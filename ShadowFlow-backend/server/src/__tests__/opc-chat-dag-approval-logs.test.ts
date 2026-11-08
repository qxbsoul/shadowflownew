import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderInput } from '../transport/api-clients';
import { _resetForTests } from '../storage/sqlite';
import {
  appendOpcMessage,
  createOpcApproval,
  createOpcConversation,
  listOpcApprovals,
  listOpcMessages,
} from '../storage/opc-chat';
import { decideOpcChatApproval, OpcChatError, runOpcChatTurn } from '../services/opc-chat';
import type { OpcChatStreamEvent } from '../services/opc-chat-stream';
import opcChatRouter from '../routes/opc-chat';

const originalCwd = process.cwd();
let dir = '';
const config = { provider: 'openai' as const, model: 'gpt-test', apiKey: 'test-key' };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sf-opc-dag-'));
  process.chdir(dir);
  _resetForTests();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/api/opc/auth/me')) {
      return Response.json({ company: { id: 'co1', name: '测试公司' } });
    }
    return Response.json({ items: [
      { id: 'e1', name: '研究', title: '市场研究', status: 'idle' },
      { id: 'e2', name: '文案', title: '内容创作', status: 'idle' },
      { id: 'e3', name: '审核', title: '风控审核', status: 'idle' },
    ] });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetForTests();
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('公司对话 DAG 与审批', () => {
  it('独立任务真实并行，下游只接收声明上游产出', async () => {
    const first = deferred();
    const second = deferred();
    const started: string[] = [];
    let downstreamPrompt = '';
    const events: OpcChatStreamEvent[] = [];
    const callImpl = async function* (_provider: string, input: ProviderInput) {
      if (input.systemPrompt.includes('编排者')) {
        yield { type: 'text-delta' as const, text: JSON.stringify({
          intent: 'task', strategy: 'parallel', tasks: [
            { id: 'research', agentId: 'e1', title: '独立研究', prompt: '研究市场' },
            { id: 'copy', agentId: 'e2', title: '独立文案', prompt: '撰写文案' },
            { id: 'review', agentId: 'e3', title: '审核研究', prompt: '只审核研究', depends_on: ['research'] },
          ],
        }) };
        return;
      }
      if (input.systemPrompt.includes('汇总员工')) {
        yield { type: 'text-delta' as const, text: '汇总完成' };
        return;
      }
      if (input.userMessage.includes('研究市场')) {
        started.push('e1');
        await first.promise;
        yield { type: 'text-delta' as const, text: '研究独有成果-RESEARCH' };
      } else if (input.userMessage.includes('撰写文案')) {
        started.push('e2');
        await second.promise;
        yield { type: 'text-delta' as const, text: '文案独有成果-COPY' };
      } else {
        started.push('e3');
        downstreamPrompt = input.userMessage;
        yield { type: 'text-delta' as const, text: '审核成果' };
      }
    };
    const conversation = createOpcConversation('co1', 'group');
    const running = runOpcChatTurn({
      conversationId: conversation.id, companyId: 'co1', content: '并行研究、写文案，再审核研究', config,
      authorization: 'Bearer test', callImpl, onEvent: event => events.push(event),
    });
    await vi.waitFor(() => expect(started.sort()).toEqual(['e1', 'e2']));
    expect(started).not.toContain('e3');
    const pending = events.filter(event => event.type === 'activity' && event.activity.name === 'employee_task' && event.activity.status === 'pending');
    expect(pending).toHaveLength(3);
    first.resolve();
    await vi.waitFor(() => expect(started).toContain('e3'));
    second.resolve();
    const result = await running;
    expect(started).toContain('e3');
    expect(downstreamPrompt).toContain('研究独有成果-RESEARCH');
    expect(downstreamPrompt).not.toContain('文案独有成果-COPY');
    expect(result.plan?.dag.nodes.find(node => node.planner_task_id === 'review')?.depends_on).toHaveLength(1);
  });

  it('循环依赖被阻断且独立分支正常完成', async () => {
    const employeeCalls: string[] = [];
    const events: OpcChatStreamEvent[] = [];
    const callImpl = async function* (_provider: string, input: ProviderInput) {
      if (input.systemPrompt.includes('编排者')) {
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'pipeline', tasks: [
          { id: 'a', agentId: 'e1', title: '循环甲', prompt: '甲', depends_on: ['b'] },
          { id: 'b', agentId: 'e2', title: '循环乙', prompt: '乙', depends_on: ['a'] },
          { id: 'free', agentId: 'e3', title: '独立任务', prompt: '独立执行' },
        ] }) };
      } else {
        employeeCalls.push(input.userMessage);
        yield { type: 'text-delta' as const, text: input.systemPrompt.includes('汇总员工') ? '部分成果汇总' : '独立成果' };
      }
    };
    const conversation = createOpcConversation('co1', 'group');
    const result = await runOpcChatTurn({
      conversationId: conversation.id, companyId: 'co1', content: '测试循环', config,
      authorization: 'Bearer test', callImpl, onEvent: event => events.push(event),
    });
    expect(employeeCalls.filter(prompt => prompt.includes('独立执行'))).toHaveLength(1);
    expect(employeeCalls.some(prompt => /分配给你的工作：循环[甲乙]/.test(prompt))).toBe(false);
    expect(events.filter(event => event.type === 'activity' && event.activity.status === 'blocked')).toHaveLength(2);
    expect(result.plan?.dag.nodes.filter(node => node.validation_error === '依赖关系存在循环')).toHaveLength(2);
  });

  it('批准后继续当前任务及下游，重复决定返回冲突', async () => {
    const events: OpcChatStreamEvent[] = [];
    const employeePrompts: string[] = [];
    const callImpl = async function* (_provider: string, input: ProviderInput) {
      if (input.systemPrompt.includes('编排者')) {
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'pipeline', tasks: [
          { id: 'release', agentId: 'e1', title: '对外发布', prompt: '待老板审批后发布方案', requires_approval: true },
          { id: 'review', agentId: 'e2', title: '后续复盘', prompt: '复盘发布', depends_on: ['release'] },
        ] }) };
      } else if (input.systemPrompt.includes('汇总员工')) {
        yield { type: 'text-delta' as const, text: '审批后成果汇总' };
      } else {
        employeePrompts.push(input.userMessage);
        yield { type: 'text-delta' as const, text: input.userMessage.includes('发布方案') ? '发布方案成果' : '复盘成果' };
      }
    };
    const conversation = createOpcConversation('co1', 'group');
    const running = runOpcChatTurn({
      conversationId: conversation.id, companyId: 'co1', content: '审批后发布并复盘', config,
      authorization: 'Bearer test', callImpl, onEvent: event => events.push(event),
    });
    await vi.waitFor(() => {
      expect(events.some(event => event.type === 'approval' && event.approval.status === 'pending')).toBe(true);
    });
    const pending = events.find((event): event is Extract<OpcChatStreamEvent, { type: 'approval' }> => event.type === 'approval');
    expect(employeePrompts).toHaveLength(0);
    const decided = decideOpcChatApproval({
      approvalId: pending!.approval.id, conversationId: conversation.id, companyId: 'co1', decision: 'approve',
    });
    expect(decided.approval.outcome).toBe('continue');
    await running;
    expect(employeePrompts).toHaveLength(2);
    expect(listOpcApprovals(conversation.id)[0]).toMatchObject({ status: 'decided', decision: 'approve', outcome: 'continue' });
    expect(() => decideOpcChatApproval({
      approvalId: pending!.approval.id, conversationId: conversation.id, companyId: 'co1', decision: 'reject',
    })).toThrowError(expect.objectContaining<Partial<OpcChatError>>({ status: 409, code: 'APPROVAL_ALREADY_DECIDED' }));

    // 审批卡只能有一张：原消息改成“已决定”，另加一条不带审批卡片的时间线消息。
    const approvalCards = listOpcMessages(conversation.id).filter(message => message.metadata_json?.includes(`"id":"${pending!.approval.id}"`));
    expect(approvalCards).toHaveLength(1);
    expect(JSON.parse(approvalCards[0].metadata_json!)).toMatchObject({ approval: { status: 'decided', decision: 'approve' } });
  });
});

describe('公司对话日志接口', () => {
  it('按公司隔离、按 run 分组并支持游标分页', async () => {
    const co1First = createOpcConversation('co1', 'group', '公司一日志');
    const co1Second = createOpcConversation('co1', 'group', '公司一第二页');
    const co2 = createOpcConversation('co2', 'group', '公司二秘密');
    appendOpcMessage(co1First.id, { sender_kind: 'ceo', sender_name: '总经理', content: '公司一回复', run_id: 'run-co1' });
    createOpcApproval({ company_id: 'co1', conversation_id: co1First.id, run_id: 'run-co1', task_id: 'task-1', task_title: '审批发布' });
    appendOpcMessage(co2.id, { sender_kind: 'ceo', sender_name: '总经理', content: '公司二回复', run_id: 'run-co2' });
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      const token = headers?.Authorization ?? headers?.authorization;
      return Response.json({ company: token === 'Bearer co2' ? { id: 'co2', name: '公司二' } : { id: 'co1', name: '公司一' } });
    }));
    const app = express();
    app.use(express.json());
    app.use('/api/opc-chat', opcChatRouter);

    const firstPage = await request(app).get('/api/opc-chat/logs?limit=1').set('Authorization', 'Bearer co1').expect(200);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.next_cursor).toBeTruthy();
    const allFirst = await request(app).get('/api/opc-chat/logs?limit=10').set('Authorization', 'Bearer co1').expect(200);
    const companyOneLog = allFirst.body.items.find((item: { conversation: { id: string } }) => item.conversation.id === co1First.id);
    expect(companyOneLog.runs[0].run_id).toBe('run-co1');
    expect(companyOneLog.runs[0].messages[0].content).toBe('公司一回复');
    expect(companyOneLog.runs[0].approvals[0].task_title).toBe('审批发布');
    expect(JSON.stringify(allFirst.body)).not.toContain('公司二秘密');

    const secondPage = await request(app).get(`/api/opc-chat/logs?limit=1&cursor=${encodeURIComponent(firstPage.body.next_cursor)}`).set('Authorization', 'Bearer co1').expect(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].conversation.id).not.toBe(firstPage.body.items[0].conversation.id);
    expect([co1First.id, co1Second.id]).toContain(secondPage.body.items[0].conversation.id);

    const otherCompany = await request(app).get('/api/opc-chat/logs').set('Authorization', 'Bearer co2').expect(200);
    expect(otherCompany.body.items).toHaveLength(1);
    expect(otherCompany.body.items[0].conversation.id).toBe(co2.id);
    expect(JSON.stringify(otherCompany.body)).not.toContain('公司一回复');
  });
});
