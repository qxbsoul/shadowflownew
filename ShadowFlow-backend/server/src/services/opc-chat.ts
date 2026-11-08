import { randomUUID } from 'node:crypto';
import { callProvider, isProviderId, PROVIDERS_NO_KEY, type ProviderId } from '../transport/api-clients';
import { planWithLlm } from '../lib/orchestrator-parse';
import { describePlan, heuristicPlan, isCasualChat, type ChatPlan, type StrategyAgent } from '../lib/chat-strategy';
import { ThinkingDeltaParser, type OpcChatActivity, type OpcChatStreamEvent } from './opc-chat-stream';
import {
  appendOpcMessage,
  createOpcApproval,
  createOpcCheckpoint,
  decideOpcApproval,
  editLatestOpcUserMessage,
  getOpcApproval,
  getOpcConversation,
  listOpcApprovals,
  listOpcMessages,
  updateOpcMessage,
  renameOpcConversation,
  restoreOpcCheckpoint,
  type OpcApprovalDecision,
  type OpcApprovalOutcome,
  type OpcChatApproval,
  type OpcChatMessage,
} from '../storage/opc-chat';
import { PYTHON_BACKEND_URL } from '../python-backend';
import { fetchMemoryBankHits, renderKnowledgeBlock } from '../lib/memory-bank';
import { listKnowledgePackIds } from '../storage/opc-knowledge';
import { recordUsage } from '../storage/token-usage';
import { getChangeRequest, type ShopChangeRequest } from '../storage/shop';
import type { OpcChatAttachment } from './opc-attachments';
import type { ContentBlock, ConversationMessage } from '../lib/conversation-types';
import { executeOpcTool, opcToolsForEmployee } from './opc-tools';

export class OpcChatError extends Error {
  constructor(public status: number, public code: string, message: string, public thinking?: string) {
    super(message);
  }
}

interface Employee {
  id: string;
  name: string;
  title?: string;
  role?: string;
  system_prompt?: string;
  skills?: string[];
  tools?: string[];
  status?: string;
  employment?: string;
}

export interface OpcChatModelConfig {
  provider: ProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  companyId?: string;
  sessionId?: string;
  attachments?: OpcChatAttachment[];
  toolEnv?: Readonly<Record<string, string>>;
}

export interface OpcDagNodeMetadata {
  id: string;
  planner_task_id: string | null;
  agent_id: string;
  name: string;
  title: string;
  prompt: string;
  depends_on: string[];
  declared_depends_on: string[];
  requires_approval: boolean;
  /** 给老板看的审批摘要（不含角色/系统提示词）；仅需审批的节点有值。 */
  approval_brief?: string;
  validation_error: string | null;
}

export interface OpcChatTurnResult {
  messages: OpcChatMessage[];
  plan?: {
    strategy: string;
    source: string;
    assignments: Array<{ agent_id: string; name: string; title: string; depends_on: string[] }>;
    dag: { nodes: OpcDagNodeMetadata[] };
  };
}

async function pythonGet<T>(path: string, authorization: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
      headers: { Authorization: authorization }, signal: ctrl.signal,
    });
    if (!response.ok) throw new OpcChatError(response.status, response.status === 401 ? 'UNAUTHORIZED' : 'COMPANY_API_ERROR', '账号或公司数据校验失败');
    return await response.json() as T;
  } catch (error) {
    if (error instanceof OpcChatError) throw error;
    throw new OpcChatError(503, 'PYTHON_BACKEND_UNAVAILABLE', '公司业务后端暂时不可用');
  } finally {
    clearTimeout(timer);
  }
}

export async function opcChatCompany(authorization: string): Promise<{ id: string; name: string }> {
  if (!authorization.startsWith('Bearer ')) throw new OpcChatError(401, 'UNAUTHORIZED', '请先登录');
  const body = await pythonGet<{ company: { id: string; name: string } }>('/api/opc/auth/me', authorization);
  return body.company;
}

async function complete(
  config: OpcChatModelConfig,
  systemPrompt: string,
  userMessage: string,
  callImpl: typeof callProvider,
  stream?: { clientId: string; emit: (event: OpcChatStreamEvent) => void },
  usageContext?: { companyId: string; sessionId: string },
  toolContext?: {
    permissions?: string[];
    onActivity: (patch: Partial<OpcChatActivity> & Pick<OpcChatActivity, 'kind' | 'name' | 'title' | 'status' | 'actor'>) => void;
    /** 店铺工具提交变更后回调，用于在对话里插入审批卡。 */
    onShopChange?: (change: ShopChangeRequest) => void;
  },
  /** 执行型任务可以关掉思考，显著缩短耗时（目前只有 MiMo 支持）。 */
  thinkingMode?: 'enabled' | 'disabled',
): Promise<{ text: string; thinking: string; durationMs: number }> {
  const startedAt = Date.now();
  const tools = toolContext ? opcToolsForEmployee(toolContext.permissions) : [];
  const messages: ConversationMessage[] = [{ role: 'user', blocks: [
    { kind: 'text', text: userMessage },
    ...(config.attachments ?? []).filter((item): item is OpcChatAttachment & { kind: 'image' | 'video'; data_url: string } => (item.kind === 'image' || item.kind === 'video') && Boolean(item.data_url))
      .map(item => ({ kind: item.kind, data_url: item.data_url })),
  ] }];
  const thinking: string[] = [];
  for (let round = 0; round < 5; round += 1) {
    const parser = new ThinkingDeltaParser(stream?.clientId ?? '', stream?.emit);
    const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
    let failure: { code?: string; message: string } | null = null;
    for await (const chunk of callImpl(config.provider, {
      systemPrompt, userMessage, messages, tools,
      model: config.model, api_key: config.apiKey, base_url: config.baseUrl,
      thinking: thinkingMode,
      // MiMo 默认开启思考，reasoning token 与正文共用同一个输出上限。旧的
      // 2600 会让“思考较长 + 长报告”把预算吃光：轻则表格/报告被截断（历史
      // 记录里能看到半截表格），重则正文为空、整单报“模型没有返回有效内容”。
      max_tokens: 8192, temperature: 0.35,
    })) {
      if (chunk.type === 'text-delta') parser.push(chunk.text);
      if (chunk.type === 'tool-use') toolCalls.push({ id: chunk.id, name: chunk.name, input: chunk.input });
      if (chunk.type === 'usage' && (usageContext || config.companyId)) recordUsage({
        company_id: usageContext?.companyId ?? config.companyId!, session_id: usageContext?.sessionId ?? config.sessionId ?? '', model: config.model,
        input_tokens: chunk.usage.input_tokens, cached_input_tokens: chunk.usage.cache_read_input_tokens,
        output_tokens: chunk.usage.output_tokens,
      });
      if (chunk.type === 'error') {
        failure = { code: chunk.code, message: chunk.message };
        break;
      }
    }
    if (failure) {
      const status = failure.code === 'NO_API_KEY' ? 401 : failure.code === 'RATE_LIMITED' ? 429 : 502;
      throw new OpcChatError(status, failure.code ?? 'LLM_UPSTREAM_ERROR', failure.message);
    }
    const text = parser.finish();
    if (parser.thinking) thinking.push(parser.thinking);
    const reasoning = thinking.join('\n\n').trim();
    if (!toolCalls.length) {
      if (!text) {
        // 只返回思考、没有正文是真实存在的情况：既不能把思考当成果交付，
        // 也不能再笼统报“模型没有返回有效内容”。把思考原文带回上层，让
        // 失败卡片能说明发生了什么。
        throw new OpcChatError(
          502,
          'LLM_EMPTY_RESPONSE',
          reasoning
            ? '模型只输出了思考过程，没有生成正式回答（输出上限可能被思考耗尽，可从 Checkpoint 重做该任务）'
            : '模型没有返回有效内容',
          reasoning || undefined,
        );
      }
      return { text, thinking: reasoning, durationMs: Math.max(0, Date.now() - startedAt) };
    }
    if (!tools.length) throw new OpcChatError(502, 'TOOL_PERMISSION_DENIED', '模型请求了当前岗位未授权的工具');
    const assistantBlocks: ContentBlock[] = [
      ...(text ? [{ kind: 'text' as const, text }] : []),
      ...toolCalls.map(call => ({ kind: 'tool_use' as const, id: call.id, name: call.name, input: call.input })),
    ];
    messages.push({ role: 'assistant', blocks: assistantBlocks });
    for (const call of toolCalls) {
      const toolInput = JSON.stringify(call.input ?? {}).slice(0, 4000);
      toolContext?.onActivity({ kind: 'tool', name: call.name, title: `调用工具：${call.name}`, status: 'running', actor: '员工', input: toolInput });
      const result = await executeOpcTool({ companyId: config.companyId!, conversationId: config.sessionId, name: call.name, input: call.input, env: config.toolEnv });
      // 店铺工具只提交变更申请：把这条申请同步到对话里，老板可以就地审批。
      const shopChange = shopChangeFromToolResult(result.output, config.companyId);
      if (shopChange && toolContext?.onShopChange) toolContext.onShopChange(shopChange);
      const output = JSON.stringify(result.output ?? {}).slice(0, 24_000);
      toolContext?.onActivity({ kind: 'tool', name: call.name, title: result.isError ? `工具执行失败：${call.name}` : `工具执行完成：${call.name}`, status: result.isError ? 'failed' : 'done', actor: '员工', input: toolInput, output, detail: result.isError ? '未产生真实外部结果，已如实返回模型' : '真实结果已回传当前岗位' });
      messages.push({ role: 'tool', blocks: [{ kind: 'tool_result', tool_use_id: call.id, tool_name: call.name, output, is_error: result.isError }] });
    }
  }
  throw new OpcChatError(502, 'TOOL_ROUND_LIMIT', '工具调用轮次超过安全上限，本轮已停止');
}

function transcript(messages: OpcChatMessage[]): string {
  return messages.slice(-24).map((message) => {
    const role = message.sender_kind === 'user' ? '老板' : message.sender_name;
    return `${role}：${message.content}`;
  }).join('\n').slice(-30_000);
}

/** 店铺工具返回 pending_approval 时，取出落库后的变更申请（用于对话内审批卡）。 */
function shopChangeFromToolResult(output: unknown, companyId: string | undefined): ShopChangeRequest | null {
  if (!companyId || !output || typeof output !== 'object') return null;
  const value = output as { status?: unknown; change_id?: unknown };
  if (value.status !== 'pending_approval' || typeof value.change_id !== 'string') return null;
  try {
    return getChangeRequest(value.change_id, companyId);
  } catch {
    return null;
  }
}

interface DagNode extends OpcDagNodeMetadata {
  systemPrompt: string;
  preblocked: boolean;
}

type TaskResult = {
  status: 'done' | 'failed' | 'blocked' | 'rejected';
  message?: OpcChatMessage;
  handoff?: string;
};

interface OpcResumeState {
  content: string;
  attachments: OpcChatAttachment[];
  previous: OpcChatMessage[];
  plan: ChatPlan;
  planText: string;
  employees: Employee[];
  knowledgeContext: string;
  results: Array<[string, TaskResult]>;
}

const approvalWaiters = new Map<string, {
  resolve: (outcome: OpcApprovalOutcome) => void;
  emit?: (event: OpcChatStreamEvent) => void;
}>();

export function decideOpcChatApproval(input: {
  approvalId: string;
  conversationId: string;
  companyId: string;
  decision: OpcApprovalDecision;
  customText?: string;
  outcome?: OpcApprovalOutcome;
}): { approval: OpcChatApproval; message: OpcChatMessage } {
  const existing = getOpcApproval(input.approvalId, input.companyId);
  if (!existing || existing.conversation_id !== input.conversationId) {
    throw new OpcChatError(404, 'APPROVAL_NOT_FOUND', '审批记录不存在');
  }
  if (existing.status !== 'pending') {
    throw new OpcChatError(409, 'APPROVAL_ALREADY_DECIDED', '该审批已经提交过决定');
  }
  const customText = String(input.customText ?? '').trim();
  if (input.decision === 'custom' && !customText) {
    throw new OpcChatError(422, 'CUSTOM_DECISION_REQUIRED', '自定义决定必须填写内容');
  }
  if (customText.length > 4000) {
    throw new OpcChatError(413, 'CUSTOM_DECISION_TOO_LARGE', '自定义决定不能超过 4000 字');
  }
  const outcome = input.decision === 'approve' ? 'continue' : input.decision === 'reject' ? 'reject' : input.outcome;
  if (!outcome || !['continue', 'reject'].includes(outcome)) {
    throw new OpcChatError(422, 'APPROVAL_OUTCOME_REQUIRED', '自定义决定必须明确 continue 或 reject');
  }
  const approval = decideOpcApproval(input.approvalId, input.companyId, input.decision, customText, outcome);
  if (!approval) throw new OpcChatError(409, 'APPROVAL_ALREADY_DECIDED', '该审批已经提交过决定');
  const decisionLabel = input.decision === 'approve' ? '批准' : input.decision === 'reject' ? '驳回' : '自定义决定';
  // 原审批卡片改成「已决定」，不再新增第二张审批卡；决定本身只留一条时间线消息。
  for (const message of listOpcMessages(existing.conversation_id)) {
    if (!message.metadata_json) continue;
    try {
      const metadata = JSON.parse(message.metadata_json) as { approval?: { id?: string } };
      if (metadata.approval?.id !== approval.id) continue;
      updateOpcMessage(message.id, { metadata: { ...metadata, approval } as never, status: 'done' });
    } catch { /* 忽略坏 metadata */ }
  }
  const message = appendOpcMessage(existing.conversation_id, {
    sender_kind: 'user', sender_name: '老板', channel: 'workflow', run_id: existing.run_id,
    task_id: existing.task_id, task_title: existing.task_title,
    content: `${decisionLabel}《${existing.task_title}》：${outcome === 'continue' ? '继续执行' : '停止该任务及其下游'}${customText ? `\n${customText}` : ''}`,
    status: 'done',
  });
  const waiter = approvalWaiters.get(approval.id);
  approvalWaiters.delete(approval.id);
  waiter?.emit?.({ type: 'approval', approval });
  waiter?.resolve(outcome);
  return { approval, message };
}

/**
 * 什么必须老板审批：会改变外部世界、花钱、对外发布或删除数据。
 *
 * 刻意用「动词＋宾语」而不是单独的高危词，避免把“写一篇上架文案”也拦成审批；
 * 商品上架/改价/删除不在这里重复拦——店铺工具本身就会生成「商品变更审批」，
 * 再叠一层任务审批只会让同一次操作批两遍。
 */
/**
 * 需要老板审批的只有「会改变外部世界 / 花钱」的动作：对外发布、上架或改商品、给客户群发、
 * 付款退款、签合同、删除数据、投放预算、品牌定稿/合规放行。
 *
 * 只看任务标题，不扫工单正文——正文里常有“未经老板确认前不对外发布”这类否定句，
 * 扫正文会把「生成公司阶段小结」这种普通汇报误判成审批。
 */
const APPROVAL_ACTION_RE = new RegExp([
  '对外发布', '发布(?:到|至|上线)', '发布(?:新品|产品|公告|新闻稿|页面|上线)',
  '公开上线', '上线(?:发布|新)',
  '上架', '下架', '改价', '调价', '定价', '改库存', '删除(?:商品|产品|数据|记录|文件)',
  '群发', '批量发送', '发送给客户', '发送至客户', '发给客户', '邮件发送',
  '付款', '收款', '退款', '转账', '打款', '签署', '签合同',
  '投放(?:广告|预算)', '购买(?:广告|流量)', '品牌定稿', '最终定稿', '合规放行', '风险豁免',
].join('|'));

/** 纯内容生产/内部汇报：即使规划器误标，也永不触发任务级审批。 */
const NON_APPROVAL_TITLE_RE = /小结|总结|汇总|报告|简报|周报|日报|调研|分析|方案|文案|草稿|计划|整理|梳理|复盘|记录|清单|排期|规划|撰写|草拟|答复|回复/;

function explicitApproval(title: string, prompt: string, _declared: boolean | undefined): boolean {
  if (isShopWriteTask(title, prompt)) return false;
  const headline = title.trim();
  if (APPROVAL_ACTION_RE.test(headline)) return true;
  if (NON_APPROVAL_TITLE_RE.test(headline)) return false;
  // 标题里没有明确的硬动作（如“生成阶段小结”），一律不作为审批。
  return false;
}

/**
 * 商品类写操作（上架/改价/库存/下架删除）由店铺工具生成「商品变更审批」，
 * 老板在对话或人工审批页批一次即可；任务层不再叠第二层审批。
 */
function isShopWriteTask(title: string, prompt: string): boolean {
  const text = `${title}\n${prompt}`;
  return /商品|产品|店铺/.test(text) && /上架|下架|改价|调价|定价|库存|删除/.test(text);
}

/** 审批卡片上要显示的具体内容：老板能看懂的摘要 + 上游交付，不贴系统提示词，也不能只有标题。 */
function approvalContentOf(input: {
  goal: string;
  title: string;
  brief?: string;
  handoffs?: string[];
}): string {
  const brief = (input.brief ?? '').trim();
  const parts: string[] = [];
  parts.push(brief || `工单：${input.title}\n老板目标：${input.goal}`);
  const handoff = input.handoffs?.filter(Boolean).join('\n\n').slice(-4000) ?? '';
  if (handoff) parts.push(`上游交付摘要：\n${handoff}`);
  return parts.join('\n\n').slice(0, 12_000);
}

export async function runOpcChatTurn(input: {
  conversationId: string;
  companyId: string;
  content: string;
  attachments?: OpcChatAttachment[];
  config: OpcChatModelConfig;
  authorization: string;
  embeddingHeaders?: Record<string, string>;
  assignedAgentId?: string;
  callImpl?: typeof callProvider;
  onEvent?: (event: OpcChatStreamEvent) => void;
  editMessageId?: string;
  checkpointId?: string;
}): Promise<OpcChatTurnResult> {
  const conversation = getOpcConversation(input.conversationId, input.companyId);
  if (!conversation) throw new OpcChatError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
  if (!isProviderId(input.config.provider)) throw new OpcChatError(422, 'INVALID_PROVIDER', '模型提供商不受支持');
  if (!input.config.apiKey && !PROVIDERS_NO_KEY.has(input.config.provider)) {
    throw new OpcChatError(401, 'NO_API_KEY', '请先在设置中配置当前模型的 API Key');
  }
  input.config.companyId = input.companyId;
  input.config.sessionId = input.conversationId;
  const call = input.callImpl ?? callProvider;
  let content = input.content.trim();
  let runId: string;
  let previous: OpcChatMessage[];
  let resumeState: OpcResumeState | undefined;
  let resumeTaskId: string | undefined;
  let resumeCheckpointId: string | undefined;

  if (input.checkpointId) {
    try {
      const restored = restoreOpcCheckpoint(input.checkpointId, input.companyId, conversation.id);
      resumeState = restored.snapshot.state as OpcResumeState;
      if (!resumeState?.plan || !Array.isArray(resumeState.employees) || !Array.isArray(resumeState.results)) {
        throw new Error('CHECKPOINT_INVALID');
      }
      runId = restored.checkpoint.run_id;
      resumeTaskId = restored.checkpoint.task_id;
      resumeCheckpointId = restored.checkpoint.id;
      content = resumeState.content;
      previous = resumeState.previous;
      input.attachments = resumeState.attachments;
      input.onEvent?.({ type: 'conversation-restored', messages: listOpcMessages(conversation.id) });
    } catch (error) {
      if (error instanceof OpcChatError) throw error;
      const code = error instanceof Error ? error.message : 'CHECKPOINT_INVALID';
      throw new OpcChatError(code === 'CHECKPOINT_NOT_FOUND' ? 404 : 422, code,
        code === 'CHECKPOINT_NOT_FOUND' ? 'Checkpoint 不存在或不属于当前公司' : 'Checkpoint 数据无效，无法恢复');
    }
  } else {
    content ||= input.attachments?.length ? '请分析我发送的附件' : '';
    if (!content) throw new OpcChatError(422, 'EMPTY_MESSAGE', '请输入对话内容或添加附件');
    if (content.length > 12_000) throw new OpcChatError(413, 'MESSAGE_TOO_LARGE', '单条消息不能超过 12000 字');
    if (input.editMessageId) {
      try {
        const edited = editLatestOpcUserMessage({ conversationId: conversation.id, companyId: input.companyId, messageId: input.editMessageId, content });
        runId = edited.run_id ?? randomUUID();
        previous = listOpcMessages(conversation.id).filter(message => message.id !== edited.id);
        if (previous.length === 0) renameOpcConversation(conversation.id, content);
        if (!input.attachments?.length && edited.metadata_json) {
          const metadata = JSON.parse(edited.metadata_json) as { attachments?: OpcChatAttachment[] };
          input.attachments = metadata.attachments ?? [];
        }
        input.onEvent?.({ type: 'conversation-restored', messages: listOpcMessages(conversation.id) });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'MESSAGE_EDIT_FAILED';
        if (code === 'ONLY_LATEST_USER_MESSAGE_EDITABLE') throw new OpcChatError(409, code, '只能编辑当前对话中最近一条自己的发言');
        if (code === 'MESSAGE_NOT_FOUND') throw new OpcChatError(404, code, '要编辑的发言不存在');
        throw error;
      }
    } else {
      runId = randomUUID();
      previous = listOpcMessages(conversation.id);
      appendOpcMessage(conversation.id, { sender_kind: 'user', sender_name: '老板', content, run_id: runId,
        metadata: input.attachments?.length ? { attachments: input.attachments } : null });
      if (previous.length === 0) renameOpcConversation(conversation.id, content);
    }
  }
  input.config.attachments = input.attachments ?? [];

  const beginMessage = (
    senderKind: 'ceo' | 'agent', senderName: string, agentId?: string,
    channel: OpcChatMessage['channel'] = 'chat', task?: { id: string; title: string }, workflow = channel === 'workflow' || Boolean(task),
  ) => {
    const clientId = randomUUID();
    input.onEvent?.({
      type: 'message-start', client_id: clientId, sender_kind: senderKind, sender_name: senderName,
      agent_id: agentId, channel, run_id: runId, task_id: task?.id, task_title: task?.title, workflow,
    });
    return clientId;
  };
  const endMessage = (clientId: string, message: OpcChatMessage) => {
    input.onEvent?.({ type: 'message-end', client_id: clientId, message });
  };
  const activity = (
    id: string,
    patch: Partial<OpcChatActivity> & Pick<OpcChatActivity, 'kind' | 'name' | 'title' | 'status' | 'actor'>,
  ): OpcChatActivity => {
    const value: OpcChatActivity = { id, run_id: runId, created_at: new Date().toISOString(), ...patch };
    input.onEvent?.({ type: 'activity', activity: value });
    if (value.status !== 'running') {
      appendOpcMessage(conversation.id, {
        sender_kind: 'system', sender_name: value.actor, content: `${value.title}${value.detail ? `：${value.detail}` : ''}`,
        channel: 'workflow', run_id: runId, task_id: value.task_id, status: value.status,
        duration_ms: value.duration_ms, metadata: { activity: value },
      });
    }
    return value;
  };

  // 单聊是“老板只面对总经理”的沟通方式，不是总经理亲自包办任务。
  // 只有纯寒暄直接应答；咨询和任务都进入同一套员工编排与真实模型调用。
  if (!resumeState && conversation.kind === 'single' && isCasualChat(content)) {
    const clientId = beginMessage('ceo', '总经理');
    const result = await complete(input.config, [
      '你是 AI 营销公司的总经理，只负责理解老板意图、调度和经营沟通。',
      '寒暄时简洁回应；不得虚构已经执行的外部操作。',
    ].join('\n'), `以下是历史对话：\n${transcript(previous)}\n\n老板最新消息：${content}`, call,
    input.onEvent ? { clientId, emit: input.onEvent } : undefined);
    const message = appendOpcMessage(conversation.id, {
      sender_kind: 'ceo', sender_name: '总经理', content: result.text, run_id: runId,
      thinking: result.thinking, status: 'done', duration_ms: result.durationMs,
    });
    endMessage(clientId, message);
    return { messages: [message] };
  }

  const rosterBody = resumeState ? null : await pythonGet<{ items: Employee[] }>(
    `/api/opc/company/${encodeURIComponent(input.companyId)}/roster`, input.authorization,
  );
  const employees = resumeState?.employees ?? rosterBody!.items.filter((employee) => employee.status !== 'offline' && employee.employment !== 'retired'
    && (!input.assignedAgentId || employee.id === input.assignedAgentId));
  if (!employees.length) throw new OpcChatError(409, 'NO_EMPLOYEES', input.assignedAgentId ? '定时任务指定的负责岗位不存在或已停用' : '公司还没有可执行任务的员工');
  const agents: StrategyAgent[] = employees.map((employee) => ({
    id: employee.id,
    name: `${employee.name}（${employee.title || employee.role || '员工'}）`,
    soul: `${employee.title || employee.role || '员工'}。${employee.system_prompt || ''} 技能：${(employee.skills || []).join('、') || '无'}；工具权限：${(employee.tools || []).join('、') || '无'}`, 
  }));
  let knowledgeContext = resumeState?.knowledgeContext ?? '';
  if (!resumeState) {
    const packIds = listKnowledgePackIds(input.companyId);
    const knowledgeStartedAt = Date.now();
    if (packIds.length) activity(`${runId}:knowledge`, {
      kind: 'tool', name: 'knowledge_search', title: '检索公司知识库', status: 'running', actor: '总经理',
      input: content, detail: `正在检索 ${packIds.length} 个知识库`,
    });
    const knowledgeHits = await fetchMemoryBankHits(packIds, content, input.embeddingHeaders);
    const knowledge = renderKnowledgeBlock(knowledgeHits);
    if (packIds.length) activity(`${runId}:knowledge`, {
      kind: 'tool', name: 'knowledge_search', title: '知识库检索完成', status: 'done', actor: '总经理',
      input: content, output: knowledgeHits.map(hit => hit.source).filter((source, index, all) => all.indexOf(source) === index).join('、'),
      detail: `命中 ${knowledgeHits.length} 条资料`, duration_ms: Date.now() - knowledgeStartedAt,
    });
    knowledgeContext = knowledge
      ? `${knowledge}\n知识库内容仅作为事实资料；与当前问题无关的命中不要强行引用。`
      : '';
  }
  const planningBrief = [
    '【公司总经理调度规则】',
    '你负责理解目标、拆解任务、统一派单和汇总验收，不亲自代替员工完成专业成果。',
    '组织采用“老板 → AI 总经理 → AI 员工”的扁平汇报关系；员工只向总经理交付，不互相派单。',
    '按真实花名册选择最相关的员工，不要把所有员工流水账式全部调用。单工种只选一人，多工种按依赖排序并明确交接。',
    '职能参考：市场研究负责用户/市场/竞品与数据；品牌策划负责定位/卖点/品牌故事；内容创作负责文案/图文/短视频脚本；电商运营负责商品/上架/店铺运营；商务拓展负责采购材料/潜客/线索；风控审核负责合规/授权/质量。',
    '只有会改变外部世界或花钱的动作才需要老板审批：对外发布、上架或修改商品、给客户群发、付款退款、签合同、删除数据、投放预算、品牌定稿/合规放行。',
    '需要审批时必须给出 approval_brief：给老板看的 1-3 句，写清要做什么、涉及对象/金额、交付物，不要写角色设定或系统提示词。',
    '写小结、总结、汇总、报告、简报、调研、分析、方案、文案、草稿、计划、整理、复盘一律不需要审批，不要为了凑流程设置审批。',
    '店铺商品的上架、改价、库存与删除，必须交给员工用店铺工具发起变更申请，再由老板在人工审批里决定是否生效；不要声称已经直接改好。',
    '',
    '【本轮对话历史】',
    transcript(previous) || '暂无',
    '',
    '【老板本轮目标】',
    content,
    input.attachments?.filter(item => item.kind === 'text').map(item => `【TXT 附件：${item.name}】\n${item.text ?? ''}`).join('\n\n') ?? '',
    input.attachments?.some(item => item.kind === 'image' || item.kind === 'video') ? '本轮包含图片或视频附件，请结合多模态内容理解和分工。' : '',
    knowledgeContext,
  ].filter(Boolean).join('\n');
  const planningStartedAt = Date.now();
  if (!resumeState) activity(`${runId}:planning`, {
    kind: 'model', name: 'manager_planning', title: '总经理正在分析目标与分工', status: 'running', actor: '总经理',
    detail: '结合对话、知识资料与员工能力制定 DAG 执行计划',
  });
  const plan = resumeState?.plan ?? await planWithLlm({
    userText: planningBrief,
    agents,
    provider: input.config.provider,
    apiKey: input.config.apiKey,
    model: input.config.model,
    baseUrl: input.config.baseUrl,
    // 规划同样受 MiMo 思考 token 与正文共用上限的约束；1600 很容易被思考吃光，
    // 导致计划 JSON 缺失后静默降级为规则分工。这里给足预算，仍按实际用量计费。
    maxTokens: 8192,
    attachments: input.config.attachments?.filter((item): item is OpcChatAttachment & { kind: 'image' | 'video'; data_url: string } => (item.kind === 'image' || item.kind === 'video') && Boolean(item.data_url))
      .map(item => ({ kind: item.kind, data_url: item.data_url })),
    callImpl: call,
    onUsage: usage => recordUsage({
      company_id: input.companyId, session_id: input.conversationId, model: input.config.model,
      input_tokens: usage.input_tokens, cached_input_tokens: usage.cache_read_input_tokens, output_tokens: usage.output_tokens,
    }),
    onThinkingDelta: (_delta, thinking) => activity(`${runId}:planning`, {
      kind: 'model', name: 'manager_planning', title: '总经理正在分析目标与分工', status: 'running', actor: '总经理',
      thinking, detail: '结合对话、知识资料与员工能力制定 DAG 执行计划',
    }),
  }) ?? heuristicPlan(content, agents);
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const nameOf = (id: string) => agents.find((agent) => agent.id === id)?.name ?? id;
  const executionChannel: OpcChatMessage['channel'] = conversation.kind === 'single' ? 'workflow' : 'chat';

  const nodes: DagNode[] = plan.tasks.map((task, index) => {
    const employee = byId.get(task.agentId);
    return {
      id: `${runId}:task:${index + 1}`,
      planner_task_id: task.id ?? null,
      agent_id: task.agentId,
      name: nameOf(task.agentId),
      title: task.title,
      prompt: task.prompt,
      depends_on: [],
      declared_depends_on: task.depends_on ?? [],
      requires_approval: !isShopWriteTask(task.title, task.prompt) && explicitApproval(task.title, task.prompt, task.requires_approval),
      approval_brief: task.requires_approval ? task.approval_brief?.trim() : undefined,
      validation_error: employee ? null : `执行员工不存在：${task.agentId}`,
      systemPrompt: [
        employee?.system_prompt || `你是公司的${employee?.title || employee?.role || '员工'}${employee?.name || ''}，只负责自己的专业工单。`,
        `你的岗位是${employee?.title || employee?.role || '员工'}，你只执行总经理派发且属于本岗位的任务，并向总经理汇报。`,
        `你的技能：${(employee?.skills || []).join('、') || '未配置'}。允许使用的工具权限：${(employee?.tools || []).join('、') || '无'}；不得声称使用未授权工具。`,
        '涉及店铺商品的上架、改价、改库存、下架删除时，只能调用 shop_propose_change 提交变更；老板审批前不得声称已完成上架或修改。',
        '调用 shop_propose_change 时只传商品字段：name 是商品标题，summary 是一句话卖点，description 是顾客看到的商品详情文案（材质/规格/使用场景/售后）；不得把工单、交接记录、审批说明或内部依据整段粘贴进 description。',
      ].join('\n'),
      preblocked: !employee,
    };
  });
  const byPlannerId = new Map(nodes.filter(node => node.planner_task_id).map(node => [node.planner_task_id as string, node]));
  const byAgentId = new Map(nodes.map(node => [node.agent_id, node]));
  const byRuntimeId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    for (const ref of node.declared_depends_on) {
      const upstream = byPlannerId.get(ref) ?? byRuntimeId.get(ref) ?? byAgentId.get(ref);
      if (!upstream) {
        node.validation_error = `缺失依赖：${ref}`;
        node.preblocked = true;
      } else {
        node.depends_on.push(upstream.id);
      }
    }
  }

  // Mark only actual cycle members. Other valid branches remain executable.
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const visitStack: DagNode[] = [];
  const detectCycle = (node: DagNode): void => {
    if (node.preblocked || visitState.get(node.id) === 'visited') return;
    if (visitState.get(node.id) === 'visiting') {
      const start = visitStack.findIndex(item => item.id === node.id);
      for (const cyclic of visitStack.slice(start)) {
        cyclic.validation_error = '依赖关系存在循环';
        cyclic.preblocked = true;
      }
      return;
    }
    visitState.set(node.id, 'visiting');
    visitStack.push(node);
    for (const dependency of node.depends_on) {
      const upstream = byRuntimeId.get(dependency);
      if (upstream) detectCycle(upstream);
    }
    visitStack.pop();
    visitState.set(node.id, 'visited');
  };
  for (const node of nodes) detectCycle(node);

  const dag = {
    nodes: nodes.map(node => ({
      id: node.id,
      planner_task_id: node.planner_task_id,
      agent_id: node.agent_id,
      name: node.name,
      title: node.title,
      prompt: node.prompt,
      depends_on: node.depends_on,
      declared_depends_on: node.declared_depends_on,
      requires_approval: node.requires_approval,
      validation_error: node.validation_error,
    })),
  };
  const planText = resumeState?.planText ?? `${describePlan(plan, nameOf)}\n${plan.tasks.map((task, index) => `${index + 1}. ${nameOf(task.agentId)}：${task.title}`).join('\n')}`;
  let planMessage: OpcChatMessage;
  if (resumeState) {
    const existing = listOpcMessages(conversation.id).find(message => message.run_id === runId && message.sender_kind === 'ceo' && message.metadata_json?.includes('"dag"'));
    if (!existing) throw new OpcChatError(422, 'CHECKPOINT_INVALID', 'Checkpoint 缺少原分工消息');
    planMessage = existing;
  } else {
    const planClientId = beginMessage('ceo', '总经理', undefined, executionChannel, undefined, true);
    activity(`${runId}:planning`, {
      kind: 'model', name: 'manager_planning', title: '总经理已完成 DAG 分工', status: 'done', actor: '总经理',
      output: planText, thinking: plan.thinking, detail: `${plan.tasks.length} 个岗位工单，独立分支并行、依赖分支交接`, duration_ms: Date.now() - planningStartedAt,
    });
    input.onEvent?.({ type: 'content-delta', client_id: planClientId, text: planText });
    planMessage = appendOpcMessage(conversation.id, {
      sender_kind: 'ceo', sender_name: '总经理', content: planText, channel: executionChannel,
      run_id: runId, thinking: plan.thinking ?? '', status: 'done', metadata: {
        strategy: plan.strategy,
        source: plan.source,
        assignments: nodes.map(node => ({ agent_id: node.agent_id, name: node.name, title: node.title, depends_on: node.depends_on })),
        dag,
      },
    });
    endMessage(planClientId, planMessage);
  }

  const completedResults = new Map<string, TaskResult>(resumeState?.results ?? []);
  // 已完成的上游不重复展示或执行；未完成的节点仍保留完整 DAG 计划。
  for (const node of nodes.filter(item => !completedResults.has(item.id))) {
    activity(`${runId}:task:${node.id.split(':').at(-1)}`, {
      kind: 'model', name: 'employee_task', title: node.title, status: 'pending', actor: node.name,
      agent_id: node.agent_id, task_id: node.id, depends_on: node.depends_on,
      input: node.prompt, detail: node.validation_error ?? (node.depends_on.length ? '等待声明的上游任务' : '等待并行调度'),
    });
  }
  for (const node of nodes.filter(item => item.preblocked && !completedResults.has(item.id))) {
    activity(`${runId}:task:${node.id.split(':').at(-1)}`, {
      kind: 'model', name: 'employee_task', title: node.title, status: 'blocked', actor: node.name,
      agent_id: node.agent_id, task_id: node.id, depends_on: node.depends_on,
      detail: node.validation_error ?? '依赖校验失败',
    });
  }

  const results = new Map<string, Promise<TaskResult>>(
    [...completedResults].map(([id, result]) => [id, Promise.resolve(result)]),
  );
  const executeNode = (node: DagNode): Promise<TaskResult> => {
    const restored = results.get(node.id);
    if (restored) return restored;
    const promise = (async (): Promise<TaskResult> => {
      if (node.preblocked) return { status: 'blocked' };
      const upstreamResults = await Promise.all(node.depends_on.map(id => results.get(id) as Promise<TaskResult>));
      const failedUpstream = upstreamResults.findIndex(result => result.status !== 'done');
      if (failedUpstream >= 0) {
        const upstreamId = node.depends_on[failedUpstream];
        const detail = `上游任务未完成，已阻断：${upstreamId}`;
        activity(`${runId}:task:${node.id.split(':').at(-1)}`, {
          kind: 'model', name: 'employee_task', title: node.title, status: 'blocked', actor: node.name,
          agent_id: node.agent_id, task_id: node.id, depends_on: node.depends_on, detail,
        });
        return { status: 'blocked' };
      }

      const restoredApproval = resumeState
        ? listOpcApprovals(conversation.id).find(item => item.run_id === runId && item.task_id === node.id && item.status === 'decided')
        : undefined;
      if (restoredApproval?.outcome === 'reject') return { status: 'rejected' };
      if (node.requires_approval && !restoredApproval) {
        const approval = createOpcApproval({
          company_id: input.companyId, conversation_id: conversation.id, run_id: runId,
          task_id: node.id, task_title: node.title,
          // 审批页和对话卡片都要能看到“到底批什么”：目标 + 工单正文 + 上游交接。
          content: approvalContentOf({
            goal: content,
            title: node.title,
            brief: node.approval_brief,
            handoffs: upstreamResults.map(result => result.handoff ?? ''),
          }),
        });
        activity(`${runId}:approval:${node.id.split(':').at(-1)}`, {
          kind: 'approval', name: 'approval_required', title: `待老板审批：${node.title}`, status: 'waiting_approval', actor: '总经理',
          agent_id: node.agent_id, task_id: node.id, depends_on: node.depends_on, approval_id: approval.id,
          detail: '批准或选择继续后执行；驳回后停止本任务及其下游',
        });
        const approvalClientId = beginMessage('ceo', '总经理', undefined, 'workflow', { id: node.id, title: node.title });
        const approvalText = `《${node.title}》需要老板确认后才能执行。请批准、驳回，或填写自定义决定并明确是否继续。`;
        input.onEvent?.({ type: 'content-delta', client_id: approvalClientId, text: approvalText });
        const approvalMessage = appendOpcMessage(conversation.id, {
          sender_kind: 'ceo', sender_name: '总经理', content: approvalText, channel: 'workflow', run_id: runId,
          task_id: node.id, task_title: node.title, status: 'waiting_approval', metadata: { approval },
        });
        endMessage(approvalClientId, approvalMessage);
        const outcomePromise = new Promise<OpcApprovalOutcome>(resolve => {
          approvalWaiters.set(approval.id, { resolve, emit: input.onEvent });
        });
        input.onEvent?.({ type: 'approval', approval });
        const outcome = await outcomePromise;
        activity(`${runId}:approval:${node.id.split(':').at(-1)}`, {
          kind: 'approval', name: 'approval_decided', title: `老板已决定：${node.title}`, status: outcome === 'continue' ? 'done' : 'rejected', actor: '老板',
          agent_id: node.agent_id, task_id: node.id, depends_on: node.depends_on, approval_id: approval.id,
          detail: outcome === 'continue' ? '继续执行任务' : '停止本任务及其下游',
        });
        if (outcome === 'reject') return { status: 'rejected' };
      }

      const employee = byId.get(node.agent_id) as Employee;
      // 审批完成后、真实模型执行前落快照；恢复时不重新规划、不追加老板消息。
      if (!(resumeState && resumeTaskId === node.id && resumeCheckpointId)) {
        const checkpoint = createOpcCheckpoint({
          company_id: input.companyId, conversation_id: conversation.id, run_id: runId,
          task_id: node.id, task_title: node.title,
          snapshot: {
            messages: listOpcMessages(conversation.id), approvals: listOpcApprovals(conversation.id),
            state: {
              content, attachments: input.attachments ?? [], previous, plan, planText, employees, knowledgeContext,
              results: [...completedResults],
            } satisfies OpcResumeState,
          },
        });
        const checkpointMessage = appendOpcMessage(conversation.id, {
          sender_kind: 'system', sender_name: '总经理', channel: 'workflow', run_id: runId,
          task_id: node.id, task_title: node.title, content: `Checkpoint：${node.title}`, status: 'done',
          metadata: { checkpoint: { id: checkpoint.id, task_id: node.id, task_title: node.title, sequence: checkpoint.sequence } },
        });
        input.onEvent?.({ type: 'checkpoint', message: checkpointMessage });
      }
      activity(`${runId}:task:${node.id.split(':').at(-1)}`, {
        kind: 'model', name: 'employee_task', title: node.title, status: 'running', actor: employee.name,
        agent_id: employee.id, task_id: node.id, depends_on: node.depends_on,
      });
      activity(`${runId}:dispatch:${node.id.split(':').at(-1)}`, {
        kind: 'dispatch', name: 'employee_dispatch', title: `总经理 → ${employee.name}`, status: 'done', actor: '总经理',
        agent_id: employee.id, task_id: node.id, depends_on: node.depends_on, input: node.title,
        detail: node.depends_on.length ? '已派发工单，仅交接声明上游的成果' : '已派发独立岗位工单，并行执行',
      });
      const handoff = node.depends_on.map((dependency, index) => upstreamResults[index].handoff).filter(Boolean).join('\n\n');
      const prompt = [
        `公司对话历史：\n${transcript(previous)}`,
        `老板本轮目标：${content}`,
        `总经理通过任务工单分配给你的工作：${node.title}\n${node.prompt}`,
        knowledgeContext,
        handoff ? `上游员工向总经理回传、现由总经理交接给你的成果（仅限声明依赖）：\n${handoff.slice(-16_000)}` : '',
        '你是执行层员工，只向总经理提交本岗位成果，不向其他员工派单，也不直接代替老板作决策。',
        '请直接产出可验收的岗位成果。若使用了上游成果，必须实际衔接其内容，不要复述调度过程。',
        '缺少真实数据时明确列出缺口和可用假设，不得编造数据、来源、外部操作或审批结果。',
      ].filter(Boolean).join('\n\n');
      const clientId = beginMessage('agent', employee.name, employee.id, executionChannel, { id: node.id, title: node.title });
      const startedAt = Date.now();
      // 商品操作这类执行型工单关掉长思考：模型常常把时间花在推理上，
      // 实际只需要「查列表 → 提交变更」。规划与汇总仍保留思考。
      const isShopWork = /商品|上架|下架|改价|调价|库存|售价|定价/.test(`${node.title}\n${node.prompt}`);
      try {
        const result = await complete(
          input.config, node.systemPrompt, prompt, call,
          input.onEvent ? { clientId, emit: input.onEvent } : undefined,
          undefined,
          {
            permissions: employee.tools,
            onActivity: patch => activity(`${runId}:tool:${node.id.split(':').at(-1)}:${randomUUID()}`, {
              ...patch, actor: employee.name, agent_id: employee.id, task_id: node.id,
            }),
            onShopChange: change => {
              // 落一条带 shopChange 元数据的消息：刷新后仍在，且可以直接审批。
              appendOpcMessage(conversation.id, {
                sender_kind: 'system', sender_name: '总经理', channel: 'workflow', run_id: runId,
                task_id: node.id, task_title: node.title, content: change.summary,
                status: 'waiting_approval', metadata: { shopChange: change },
              });
              input.onEvent?.({ type: 'shop-change', change });
            },
          },
          isShopWork ? 'disabled' : undefined,
        );
        const message = appendOpcMessage(conversation.id, {
          sender_kind: 'agent', sender_name: employee.name, agent_id: employee.id, content: result.text,
          channel: executionChannel, run_id: runId, task_id: node.id, task_title: node.title,
          thinking: result.thinking, status: 'done', duration_ms: result.durationMs,
          metadata: { depends_on: node.depends_on },
        });
        endMessage(clientId, message);
        activity(`${runId}:task:${node.id.split(':').at(-1)}`, {
          kind: 'model', name: 'employee_task', title: node.title, status: 'done', actor: employee.name,
          agent_id: employee.id, task_id: node.id, depends_on: node.depends_on,
          output: result.text, thinking: result.thinking, duration_ms: Date.now() - startedAt,
        });
        return {
          status: 'done', message,
          handoff: `${employee.name}（${employee.title || '员工'}）交付《${node.title}》：\n${result.text}`,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        // 失败也保留模型真实产生的思考，避免卡片上只剩一句“没有返回有效内容”。
        const failedThinking = error instanceof OpcChatError ? error.thinking : undefined;
        const message = appendOpcMessage(conversation.id, {
          sender_kind: 'agent', sender_name: employee.name, agent_id: employee.id,
          content: detail, channel: 'workflow', run_id: runId,
          task_id: node.id, task_title: node.title, status: 'failed',
          thinking: failedThinking, metadata: { depends_on: node.depends_on },
        });
        endMessage(clientId, message);
        activity(`${runId}:task:${node.id.split(':').at(-1)}`, {
          kind: 'model', name: 'employee_task', title: node.title, status: 'failed', actor: employee.name,
          agent_id: employee.id, task_id: node.id, depends_on: node.depends_on, detail,
          thinking: failedThinking,
        });
        return { status: 'failed', message };
      }
    })();
    results.set(node.id, promise);
    void promise.then(result => {
      if (result.status === 'done') completedResults.set(node.id, result);
    });
    return promise;
  };

  // Register promises synchronously in DAG plan order so dependents can always
  // find their upstream promise; actual independent model calls overlap.
  const taskPromises = nodes.map(node => executeNode(node));
  const settled = await Promise.all(taskPromises);
  const produced: OpcChatMessage[] = [planMessage];
  const handoffs: string[] = [];
  for (const result of settled) {
    if (result.message) produced.push(result.message);
    if (result.handoff) handoffs.push(result.handoff);
  }

  if (handoffs.length) {
    const summaryStartedAt = Date.now();
    activity(`${runId}:summary`, {
      kind: 'model', name: 'manager_summary', title: '总经理正在汇总员工成果', status: 'running', actor: '总经理',
      detail: `${handoffs.length} 个成功交付，${settled.filter(result => result.status !== 'done').length} 个未执行或失败节点`,
    });
    const summaryClientId = beginMessage('ceo', '总经理');
    const summary = await complete(input.config, [
      '你是 AI 营销公司的总经理，负责汇总员工回传的成果并对老板交付，不是执行员工。',
      '基于给定成果提炼最终决定、核心交付、数据缺口和下一步；不得添加员工没有提供的数字、事实或外部执行结果。',
      '涉及对外发布、高风险合规、品牌定稿或资金操作时，明确标记“待老板审批”，不得擅自批准。',
    ].join('\n'), [
      `老板目标：${content}`,
      `你的派单：\n${planText}`,
      `员工实际回传：\n${handoffs.join('\n\n').slice(-24_000)}`,
      `未成功节点：\n${settled.map((result, index) => result.status === 'done' ? '' : `${nodes[index].title}：${result.status}`).filter(Boolean).join('\n') || '无'}`,
      knowledgeContext,
      '请向老板汇总最终结果，避免重复整段粘贴员工原文；采用知识库事实时保留来源名称。',
    ].join('\n\n'), call, input.onEvent ? { clientId: summaryClientId, emit: input.onEvent } : undefined);
    const summaryMessage = appendOpcMessage(conversation.id, {
      sender_kind: 'ceo', sender_name: '总经理', content: summary.text, run_id: runId,
      thinking: summary.thinking, status: 'done', duration_ms: summary.durationMs,
    });
    endMessage(summaryClientId, summaryMessage);
    activity(`${runId}:summary`, {
      kind: 'model', name: 'manager_summary', title: '总经理已完成汇总', status: 'done', actor: '总经理',
      output: summary.text, thinking: summary.thinking, duration_ms: Date.now() - summaryStartedAt,
    });
    produced.push(summaryMessage);
  }

  return {
    messages: produced,
    plan: {
      strategy: plan.strategy,
      source: plan.source,
      assignments: nodes.map(node => ({ agent_id: node.agent_id, name: node.name, title: node.title, depends_on: node.depends_on })),
      dag,
    },
  };
}
