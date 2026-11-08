import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderInput } from '../transport/api-clients';
import { _resetForTests } from '../storage/sqlite';
import { appendOpcMessage, createOpcConversation, listOpcMessages } from '../storage/opc-chat';
import { runOpcChatTurn } from '../services/opc-chat';
import type { OpcChatStreamEvent } from '../services/opc-chat-stream';

const originalCwd = process.cwd();
let dir = '';
const config = { provider: 'openai' as const, model: 'gpt-test', apiKey: 'test-key' };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sf-opc-checkpoint-'));
  process.chdir(dir);
  _resetForTests();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [
    { id: 'e1', name: '研究', title: '市场研究', system_prompt: '负责一', status: 'idle' },
    { id: 'e2', name: '文案', title: '内容创作', system_prompt: '负责二', status: 'idle' },
  ] })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetForTests();
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

function checkpointIds(events: OpcChatStreamEvent[]): string[] {
  return events.flatMap(event => {
    if (event.type !== 'checkpoint' || !event.message.metadata_json) return [];
    const metadata = JSON.parse(event.message.metadata_json) as { checkpoint?: { id: string } };
    return metadata.checkpoint ? [metadata.checkpoint.id] : [];
  });
}

describe('员工执行前 Checkpoint 与最近发言编辑', () => {
  it('从第二个员工重做时保留第一员工成果、不重新规划并生成新下游交接', async () => {
    let planningCalls = 0;
    let firstEmployeeCalls = 0;
    let secondEmployeeCalls = 0;
    let latestSecondPrompt = '';
    let latestSummaryPrompt = '';
    const callImpl = async function* (_provider: string, input: ProviderInput) {
      if (input.systemPrompt.includes('编排者')) {
        planningCalls += 1;
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'pipeline', tasks: [
          { id: 'research', agentId: 'e1', title: '研究', prompt: '先研究' },
          { id: 'copy', agentId: 'e2', title: '文案', prompt: '再写文案', depends_on: ['research'] },
        ] }) };
      } else if (input.systemPrompt.includes('汇总员工')) {
        latestSummaryPrompt = input.userMessage;
        yield { type: 'text-delta' as const, text: '最终汇总' };
      } else if (input.systemPrompt.includes('负责一')) {
        firstEmployeeCalls += 1;
        yield { type: 'text-delta' as const, text: '上游-v1' };
      } else {
        secondEmployeeCalls += 1;
        latestSecondPrompt = input.userMessage;
        yield { type: 'text-delta' as const, text: `下游-v${secondEmployeeCalls}` };
      }
    };
    const conversation = createOpcConversation('co1', 'single');
    const events: OpcChatStreamEvent[] = [];
    await runOpcChatTurn({ conversationId: conversation.id, companyId: 'co1', content: '先研究再写文案', config,
      authorization: 'Bearer test', callImpl, onEvent: event => events.push(event) });
    const checkpoints = checkpointIds(events);
    expect(checkpoints).toHaveLength(2);
    expect(firstEmployeeCalls).toBe(1);
    expect(secondEmployeeCalls).toBe(1);
    const originalUsers = listOpcMessages(conversation.id).filter(message => message.sender_kind === 'user');

    const redoEvents: OpcChatStreamEvent[] = [];
    await runOpcChatTurn({ conversationId: conversation.id, companyId: 'co1', content: '', config,
      authorization: 'Bearer test', callImpl, checkpointId: checkpoints[1], onEvent: event => redoEvents.push(event) });

    expect(planningCalls).toBe(1);
    expect(firstEmployeeCalls).toBe(1);
    expect(secondEmployeeCalls).toBe(2);
    expect(latestSecondPrompt).toContain('上游-v1');
    expect(latestSummaryPrompt).toContain('下游-v2');
    expect(latestSummaryPrompt).not.toContain('下游-v1');
    expect(redoEvents[0]?.type).toBe('conversation-restored');
    expect(listOpcMessages(conversation.id).filter(message => message.sender_kind === 'user')).toEqual(originalUsers);
    expect(listOpcMessages(conversation.id).filter(message => message.sender_kind === 'agent' && message.content === '上游-v1')).toHaveLength(1);
  });

  it('只允许编辑最近老板发言，截断旧轮次且新上下文不包含旧内容', async () => {
    const planningPrompts: string[] = [];
    const callImpl = async function* (_provider: string, input: ProviderInput) {
      if (input.systemPrompt.includes('编排者')) {
        planningPrompts.push(input.userMessage);
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'expert', tasks: [
          { agentId: 'e1', title: '执行', prompt: '执行当前目标' },
        ] }) };
      } else {
        yield { type: 'text-delta' as const, text: input.systemPrompt.includes('汇总员工') ? '新汇总' : '新成果' };
      }
    };
    const conversation = createOpcConversation('co1', 'single');
    await runOpcChatTurn({ conversationId: conversation.id, companyId: 'co1', content: '第一轮旧目标', config, authorization: 'Bearer test', callImpl });
    await runOpcChatTurn({ conversationId: conversation.id, companyId: 'co1', content: '第二轮待修改', config, authorization: 'Bearer test', callImpl });
    const users = listOpcMessages(conversation.id).filter(message => message.sender_kind === 'user');
    const oldSecondRun = users[1].run_id;
    const oldSecondMessageIds = listOpcMessages(conversation.id).filter(message => message.run_id === oldSecondRun && message.sender_kind !== 'user').map(message => message.id);
    await expect(runOpcChatTurn({ conversationId: conversation.id, companyId: 'co1', content: '非法修改', config,
      authorization: 'Bearer test', callImpl, editMessageId: users[0].id })).rejects.toMatchObject({ code: 'ONLY_LATEST_USER_MESSAGE_EDITABLE' });

    appendOpcMessage(conversation.id, { sender_kind: 'user', sender_name: '老板', channel: 'workflow', run_id: oldSecondRun, content: '批准：继续执行' });
    const events: OpcChatStreamEvent[] = [];
    await runOpcChatTurn({ conversationId: conversation.id, companyId: 'co1', content: '第二轮最新目标', config,
      authorization: 'Bearer test', callImpl, editMessageId: users[1].id, onEvent: event => events.push(event) });
    const stored = listOpcMessages(conversation.id);
    expect(stored.filter(message => message.sender_kind === 'user').map(message => message.content)).toEqual(['第一轮旧目标', '第二轮最新目标']);
    expect(stored.some(message => message.run_id === oldSecondRun && message.sender_kind !== 'user')).toBe(true);
    expect(stored.some(message => oldSecondMessageIds.includes(message.id))).toBe(false);
    expect(planningPrompts.at(-1)).toContain('第二轮最新目标');
    expect(planningPrompts.at(-1)).not.toContain('第二轮待修改');
    expect(planningPrompts.at(-1)).toContain('第一轮旧目标');
    expect(events[0]?.type).toBe('conversation-restored');
  });

  it('跨公司、跨对话恢复被拒绝且不修改原对话', async () => {
    const callImpl = async function* (_provider: string, input: ProviderInput) {
      if (input.systemPrompt.includes('编排者')) {
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'expert', tasks: [{ agentId: 'e1', title: '执行', prompt: '执行' }] }) };
      } else {
        yield { type: 'text-delta' as const, text: '真实结果' };
      }
    };
    const source = createOpcConversation('co1', 'single');
    const events: OpcChatStreamEvent[] = [];
    await runOpcChatTurn({ conversationId: source.id, companyId: 'co1', content: '生成', config,
      authorization: 'Bearer test', callImpl, onEvent: event => events.push(event) });
    const checkpointId = checkpointIds(events)[0];
    const before = listOpcMessages(source.id);
    const other = createOpcConversation('co2', 'single');
    await expect(runOpcChatTurn({ conversationId: other.id, companyId: 'co2', content: '', config,
      authorization: 'Bearer test', callImpl, checkpointId })).rejects.toMatchObject({ code: 'CHECKPOINT_NOT_FOUND' });
    expect(listOpcMessages(source.id)).toEqual(before);
  });
});
