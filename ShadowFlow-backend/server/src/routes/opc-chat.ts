import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { validateChatAttachments } from '../services/opc-attachments';
import { isProviderId, type ProviderId } from '../transport/api-clients';
import { resolveProviderKey } from '../transport/byokKey';
import {
  createOpcConversation,
  deleteOpcConversation,
  getOpcConversation,
  listCompanyOpcApprovals,
  listOpcDeliverableConversations,
  listOpcApprovals,
  listOpcConversations,
  listOpcLogConversations,
  listOpcMessages,
  type OpcApprovalDecision,
  type OpcApprovalOutcome,
} from '../storage/opc-chat';
import type { OpcChatActivity } from '../services/opc-chat-stream';
import { decideOpcChatApproval, opcChatCompany, OpcChatError, runOpcChatTurn } from '../services/opc-chat';
import { embeddingHeaders } from '../lib/embedding';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 25 * 1024 * 1024 } });

function fail(res: Response, error: unknown): void {
  const err = error instanceof OpcChatError
    ? error
    : error instanceof multer.MulterError
      ? new OpcChatError(413, 'UPLOAD_LIMIT', error.code === 'LIMIT_FILE_SIZE' ? '单个附件不能超过 25 MB' : '附件数量或大小超过限制')
      : new OpcChatError(500, 'CHAT_INTERNAL', error instanceof Error ? error.message : String(error));
  if (res.headersSent) {
    res.write(`${JSON.stringify({ type: 'error', code: err.code, message: err.message })}\n`);
    res.end();
    return;
  }
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
}

const MODEL_PROVIDERS = ['mimo', 'deepseek', 'openai'] as const;
const DEFAULT_BASE_URL: Record<string, string> = {
  mimo: 'https://api.xiaomimimo.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
};
const DEFAULT_MODEL: Record<string, string> = {
  mimo: 'mimo-v2.6-pro',
  deepseek: 'deepseek-chat',
};

export function modelConfig(req: Request): { provider: ProviderId; model?: string; apiKey?: string; baseUrl?: string; toolEnv?: Readonly<Record<string, string>> } {
  const provider = String(req.body?.provider || 'mimo');
  if (!isProviderId(provider) || !(MODEL_PROVIDERS as readonly string[]).includes(provider)) {
    throw new OpcChatError(422, 'INVALID_PROVIDER', '当前支持 MiMo、DeepSeek 或 OpenAI 兼容的自定义模型');
  }
  const header = (name: string) => String(req.headers[name] ?? '').trim();
  const custom = req.body?.custom === true;
  const model = String(req.body?.model || '').trim() || DEFAULT_MODEL[provider] || '';
  const baseUrl = String(req.body?.base_url || '').trim() || DEFAULT_BASE_URL[provider];
  if (!model) throw new OpcChatError(422, 'INVALID_MODEL', '请选择或填写模型名称');
  if (!baseUrl) throw new OpcChatError(422, 'INVALID_BASE_URL', '自定义模型必须填写 Base URL');
  const apiKey = resolveProviderKey(provider, req.headers) || (custom ? header('x-custom-api-key') : '');
  const toolEnv = Object.fromEntries([
    ['TAVILY_API_KEY', header('x-tavily-key')],
    ['SERPAPI_API_KEY', header('x-serpapi-key')],
    ['GITHUB_TOKEN', header('x-github-token')],
  ].filter(([, value]) => Boolean(value)));
  return {
    provider,
    model,
    apiKey: apiKey || undefined,
    baseUrl,
    toolEnv,
  };
}

router.get('/', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    res.json({ items: listOpcConversations(company.id) });
  })().catch((error) => fail(res, error));
});

router.post('/', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    const kind = req.body?.kind === 'group' ? 'group' : 'single';
    const conversation = createOpcConversation(company.id, kind, String(req.body?.title || (kind === 'group' ? '新群聊' : '新对话')).slice(0, 40));
    res.status(201).json({ conversation });
  })().catch((error) => fail(res, error));
});

router.get('/logs', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    const requestedLimit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
      throw new OpcChatError(422, 'INVALID_LOG_LIMIT', 'limit 必须是 1 到 50 的整数');
    }
    let cursor: { updated_at: string; id: string } | undefined;
    if (req.query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(String(req.query.cursor), 'base64url').toString('utf8')) as { updated_at?: unknown; id?: unknown };
        if (typeof decoded.updated_at !== 'string' || typeof decoded.id !== 'string') throw new Error('invalid');
        cursor = { updated_at: decoded.updated_at, id: decoded.id };
      } catch {
        throw new OpcChatError(422, 'INVALID_LOG_CURSOR', '日志分页游标无效');
      }
    }
    const conversations = listOpcLogConversations(company.id, requestedLimit + 1, cursor);
    const hasMore = conversations.length > requestedLimit;
    const page = conversations.slice(0, requestedLimit);
    const items = page.map(conversation => {
      const messages = listOpcMessages(conversation.id);
      const approvals = listOpcApprovals(conversation.id);
      const runIds = [...new Set([
        ...messages.map(message => message.run_id).filter((id): id is string => Boolean(id)),
        ...approvals.map(approval => approval.run_id),
      ])];
      const runs = runIds.map(runId => {
        const runMessages = messages.filter(message => message.run_id === runId);
        const activities = runMessages.flatMap(message => {
          if (!message.metadata_json) return [];
          try {
            const metadata = JSON.parse(message.metadata_json) as { activity?: OpcChatActivity };
            return metadata.activity ? [metadata.activity] : [];
          } catch {
            return [];
          }
        });
        return {
          run_id: runId,
          messages: runMessages,
          activities,
          approvals: approvals.filter(approval => approval.run_id === runId),
        };
      });
      return { conversation, runs, unassigned_messages: messages.filter(message => !message.run_id) };
    });
    const last = page.at(-1);
    res.json({
      items,
      next_cursor: hasMore && last ? Buffer.from(JSON.stringify({ updated_at: last.updated_at, id: last.id })).toString('base64url') : null,
    });
  })().catch((error) => fail(res, error));
});

// 公司级审批列表：左侧「人工审批」页用它跨对话展示待审/已审事项。
// 必须挂在 /:id 之前，否则会被当成对话 id。
router.get('/approvals', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    const limit = Number(req.query.limit ?? 100);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const items = listCompanyOpcApprovals(company.id, Number.isFinite(limit) ? limit : 100)
      .filter(item => !status || item.status === status)
      .map(item => ({
        ...item,
        // 历史记录没有存内容时明确说明，不拿标题冒充待审内容。
        content: item.content || '',
      }));
    res.json({ items });
  })().catch((error) => fail(res, error));
});

// 交付成果按对话聚合：最终成果 + 员工中间产出。
router.get('/deliverables', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    const limit = Number(req.query.limit ?? 40);
    res.json({ items: listOpcDeliverableConversations(company.id, Number.isFinite(limit) ? limit : 40) });
  })().catch((error) => fail(res, error));
});

router.post('/:id/approvals/:approvalId', (req, res) => {  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    const conversation = getOpcConversation(req.params.id, company.id);
    if (!conversation) throw new OpcChatError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    const decision = String(req.body?.decision ?? '') as OpcApprovalDecision;
    if (!['approve', 'reject', 'custom'].includes(decision)) {
      throw new OpcChatError(422, 'INVALID_APPROVAL_DECISION', 'decision 必须是 approve、reject 或 custom');
    }
    const outcome = req.body?.outcome === undefined ? undefined : String(req.body.outcome) as OpcApprovalOutcome;
    const result = decideOpcChatApproval({
      approvalId: req.params.approvalId,
      conversationId: conversation.id,
      companyId: company.id,
      decision,
      customText: typeof req.body?.custom_text === 'string' ? req.body.custom_text : '',
      outcome,
    });
    res.json(result);
  })().catch((error) => fail(res, error));
});

router.get('/:id', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    const conversation = getOpcConversation(req.params.id, company.id);
    if (!conversation) throw new OpcChatError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    res.json({ conversation, messages: listOpcMessages(conversation.id) });
  })().catch((error) => fail(res, error));
});

router.delete('/:id', (req, res) => {
  void (async () => {
    const company = await opcChatCompany(req.headers.authorization || '');
    if (!deleteOpcConversation(req.params.id, company.id)) throw new OpcChatError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    res.status(204).end();
  })().catch((error) => fail(res, error));
});

const runningConversations = new Set<string>();

async function executeChatRequest(req: Request, res: Response, mode: 'send' | 'edit' | 'redo' = 'send'): Promise<void> {
  const company = await opcChatCompany(req.headers.authorization || '');
  const conversationId = req.params.id;
  if (runningConversations.has(conversationId)) {
    throw new OpcChatError(409, 'CONVERSATION_RUNNING', '当前对话正在生成，请完成后再编辑或重做');
  }
  const attachments = mode === 'send' ? validateChatAttachments((req.files as Express.Multer.File[] | undefined) ?? []) : [];
  const config = modelConfig(req);
  runningConversations.add(conversationId);
  try {
    const streaming = String(req.headers.accept || '').includes('application/x-ndjson');
    if (streaming) {
      res.status(200).set({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
    }
    const result = await runOpcChatTurn({
      conversationId,
      companyId: company.id,
      content: String(req.body?.content || ''),
      attachments,
      config,
      authorization: req.headers.authorization || '',
      embeddingHeaders: embeddingHeaders(req.headers),
      editMessageId: mode === 'edit' ? req.params.messageId : undefined,
      checkpointId: mode === 'redo' ? req.params.checkpointId : undefined,
      onEvent: streaming ? (event) => res.write(`${JSON.stringify(event)}\n`) : undefined,
    });
    if (streaming) {
      res.write(`${JSON.stringify({ type: 'done', plan: result.plan })}\n`);
      res.end();
    } else {
      res.json(result);
    }
  } finally {
    runningConversations.delete(conversationId);
  }
}

router.post('/:id/messages', upload.array('files', 5), (req, res) => {
  void executeChatRequest(req, res).catch((error) => fail(res, error));
});

router.post('/:id/messages/:messageId/edit', (req, res) => {
  void executeChatRequest(req, res, 'edit').catch((error) => fail(res, error));
});

router.post('/:id/checkpoints/:checkpointId/redo', (req, res) => {
  void executeChatRequest(req, res, 'redo').catch((error) => fail(res, error));
});

export default router;
