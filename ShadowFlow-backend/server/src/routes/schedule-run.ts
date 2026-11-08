import { Router, type Response as ExpressResponse } from 'express';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { OpcChatError, opcChatCompany } from '../services/opc-chat';
import { executeScheduledTask } from '../services/opc-schedule';
import { PYTHON_BACKEND_URL } from '../python-backend';
import { modelConfig } from './opc-chat';
import type { ScheduledRunResult } from '../services/opc-schedule';

const router = Router();

/** Python 定时任务记录所在目录（Node 的 cwd 是 server/，Python 的 cwd 是仓库根）。 */
function schedulesDir(): string {
  return process.env.SHADOWFLOW_SCHEDULES_DIR
    ?? path.resolve(process.cwd(), '..', '.shadowflow', 'schedules');
}

interface ScheduleRunRecord {
  run_id: string;
  triggered_at: string;
  status: 'succeeded' | 'failed';
  conversation_id?: string;
  output_summary?: string;
  error?: string;
}

const toRunRecord = (result: ScheduledRunResult): ScheduleRunRecord => ({
  run_id: randomUUID().replace(/-/g, ''),
  triggered_at: new Date().toISOString(),
  status: result.status,
  conversation_id: result.conversationId,
  output_summary: result.outputSummary,
  ...(result.error ? { error: result.error } : {}),
});

/**
 * 把一次兜底执行写回 Python 的调度记录（JSON 文件）。
 * Python 每次读调度都会重新读文件，所以运行历史、已执行次数会立即生效。
 * 找不到文件时静默跳过：说明 Python 不在同一份数据目录，本次只返回运行结果。
 */
async function appendScheduleRun(scheduleId: string, run: ScheduleRunRecord): Promise<void> {
  const file = path.join(schedulesDir(), `${scheduleId}.json`);
  try {
    const raw = await readFile(file, 'utf8');
    const record = JSON.parse(raw) as { runs?: ScheduleRunRecord[]; start_at?: string | null; cron_expression?: string | null; completed?: boolean; next_run_time?: string | null };
    record.runs = [run, ...(record.runs ?? [])].slice(0, 20);
    if (record.start_at && !record.cron_expression) {
      record.completed = true;
      record.next_run_time = null;
    }
    const temp = `${file}.tmp-${process.pid}`;
    await writeFile(temp, JSON.stringify(record, null, 2), 'utf8');
    await rename(temp, file);
  } catch {
    // 数据目录不在本机同一路径时不阻断执行结果。
  }
}

function fail(res: ExpressResponse, error: unknown): void {
  const err = error instanceof OpcChatError
    ? error
    : new OpcChatError(500, 'SCHEDULE_RUN_FAILED', error instanceof Error ? error.message : String(error));
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
}

/**
 * 立即执行定时任务。
 *
 * 正常路径仍然交给 Python（它负责运行历史与执行凭据）；如果 Python 是老实例、
 * 没有注册执行桥（EXECUTOR_UNAVAILABLE / 5xx），Node 直接用同一套 OPC 对话链路兜底，
 * 并把运行记录写回调度文件，避免“任务永远跑不起来”。
 */
router.post('/:scheduleId/run', (req, res) => {
  void (async () => {
    const scheduleId = String(req.params.scheduleId || '');
    if (!/^[A-Za-z0-9_-]+$/.test(scheduleId)) throw new OpcChatError(400, 'INVALID_SCHEDULE_ID', '非法的任务 id');
    const authorization = req.headers.authorization || '';
    const company = await opcChatCompany(authorization);

    const forwarded: Record<string, string> = { authorization };
    for (const header of ['x-mimo-key', 'x-tavily-key', 'x-serpapi-key', 'x-github-token']) {
      const value = String(req.headers[header] ?? '').trim();
      if (value) forwarded[header] = value;
    }

    let upstream: globalThis.Response | null = null;
    try {
      upstream = await fetch(`${PYTHON_BACKEND_URL}/api/schedules/${encodeURIComponent(scheduleId)}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...forwarded },
        body: '{}',
      });
    } catch {
      upstream = null;
    }
    if (upstream?.status === 200) {
      res.status(200).json(await upstream.json());
      return;
    }
    // 4xx（越权、找不到、参数错）原样返回，不做兜底。
    if (upstream && upstream.status >= 400 && upstream.status < 500) {
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
      res.send(body);
      return;
    }

    const listResponse = await fetch(`${PYTHON_BACKEND_URL}/api/schedules`, { headers: forwarded });
    if (!listResponse.ok) throw new OpcChatError(502, 'SCHEDULE_LIST_FAILED', '无法读取定时任务列表，请稍后重试');
    const listed = await listResponse.json() as { data?: Array<{ schedule_id: string; company_id: string; task_description: string; agent_id?: string | null; enabled?: boolean }> };
    const schedule = (listed.data ?? []).find(item => item.schedule_id === scheduleId && item.company_id === company.id);
    if (!schedule) throw new OpcChatError(404, 'SCHEDULE_NOT_FOUND', '定时任务不存在或不属于当前公司');
    if (!schedule.task_description.trim()) throw new OpcChatError(422, 'INVALID_SCHEDULE', '该任务没有描述，无法执行');

    const result = await executeScheduledTask({
      companyId: company.id,
      description: schedule.task_description,
      // 定时任务统一走总经理调度，历史记录里的 agent_id 不再生效。
      authorization,
      config: modelConfig(req),
    });
    const run = toRunRecord(result);
    await appendScheduleRun(scheduleId, run);
    res.json({ data: run, meta: { fallback: true, reason: upstream ? `Python HTTP ${upstream.status}` : 'Python 不可达' } });
  })().catch(error => fail(res, error));
});

export default router;
