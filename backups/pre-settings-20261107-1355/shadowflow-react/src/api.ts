/* ShadowFlow Gateway 唯一网络入口。
 * 前端只访问同源 /api/**；Vite 负责转发到 Node:8002，禁止直连 Python:8000。
 * 后续页面可复用 apiGet/apiPost/apiPatch/apiDelete，无需再写裸 fetch。
 */

export const BYOK_PROVIDERS = [
  'anthropic', 'openai', 'deepseek', 'zhipu', 'mimo', 'google', 'qwen',
  'moonshot', 'mistral', 'groq', 'openrouter', 'ollama', 'lmstudio', 'azure',
] as const;

export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  trace_id?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  traceId?: string;
  payload: unknown;

  constructor(status: number, code: string, message: string, payload: unknown, traceId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.payload = payload;
  }
}

export interface CompanyDto {
  id: string;
  name: string;
  industry?: string;
  mission?: string;
  owner_name?: string;
  status?: string;
}

export interface ModelDto {
  id: string;
  label: string;
  vendor: string;
  tier: string;
}

export interface OrgMemberDto {
  id: string;
  name: string;
  title: string;
  avatar?: string;
  status: string;
  model?: string;
  skills?: string[];
}

export interface OrgDepartmentDto {
  id: string;
  name: string;
  charter?: string;
  head?: { id: string; name: string; title: string } | null;
  members: OrgMemberDto[];
}

export interface RosterEmployeeDto {
  id: string;
  company_id: string;
  department_id: string | null;
  name: string;
  role: string;
  title: string;
  avatar?: string;
  system_prompt?: string;
  status: string;
  employment?: string;
  model_name?: string;
}

export interface ProjectDto {
  id: string;
  company_id: string;
  name: string;
  goal?: string;
  client_name?: string;
  status: string;
  order_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectTaskDto {
  id: string;
  title: string;
  status: string;
  output?: { text?: string; summary?: string; mode?: string } | null;
  assignee?: { id: string; name: string; title?: string; avatar?: string } | null;
}

export interface ApprovalDto {
  id: string;
  company_id?: string;
  project_id?: string;
  task_id?: string;
  kind?: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  risk?: string;
  payload?: { summary?: string; by?: string; cost_cents?: number };
  requested_by?: string;
  decided_by?: string;
  decided_at?: string;
  note?: string;
  created_at?: string;
}

export interface ProjectDetailDto {
  project: ProjectDto;
  tasks: ProjectTaskDto[];
  approvals: ApprovalDto[];
}

export interface ScheduleDto {
  schedule_id: string;
  group_id: string;
  cron_expression: string | null;
  start_at: string | null;
  agent_id: string | null;
  task_description: string;
  duration_min: number;
  next_run_time: string | null;
  completed: boolean;
  enabled: boolean;
  runs: Array<{ run_id: string; triggered_at: string; status: string; error?: string }>;
}

export interface KnowledgePackDto {
  pack_id: string;
  name: string;
  description?: string;
  status: string;
  sources?: Array<{ source_type?: string; source_ref?: string; ingest_status?: string }>;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardOverviewDto {
  usage: {
    calls: number;
    total_tokens: number;
    cost_est_usd: number;
    deltas: { calls: number | null; total_tokens: number | null; cost_est_usd: number | null };
  };
  runs: { total: number; succeeded: number; failed: number; success_rate: number | null; delta_total: number | null };
  active: { projects: number; conversations: number };
}

export interface DashboardSeriesDto {
  series: Array<{ day: number; calls: number; tokens?: number; cost?: number }>;
}

export interface DashboardBreakdownDto {
  items: Array<{ key: string; calls: number; total_tokens: number; cost_est_usd: number }>;
}

export interface PnlDto {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  projects_total: number;
  projects_delivered: number;
  avg_project_cost: number;
}

export interface BriefingDto {
  alerts: string[];
  failed_top: Array<{ goal: string; n: number }>;
}

export interface OrderDto {
  id: string;
  product_id: string;
  product_name?: string;
  requirement?: string;
  status: string;
  project_id?: string;
  created_at?: string;
  delivered_at?: string;
}

function apiBase(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('api');
  return (fromQuery ?? '').replace(/\/$/, '');
}

function providerHeader(provider: string): string {
  return `X-${provider.charAt(0).toUpperCase()}${provider.slice(1)}-Key`;
}

export function setByokKey(provider: ByokProvider, key: string): void {
  if (key) localStorage.setItem(`sf_${provider}_key`, key);
  else localStorage.removeItem(`sf_${provider}_key`);
}

export function setDefaultProvider(provider: ByokProvider): void {
  localStorage.setItem('sf_default_provider', provider);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error(`Gateway 路径必须以 /api/ 开头：${path}`);
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const provider = localStorage.getItem('sf_default_provider');
  if (provider && BYOK_PROVIDERS.includes(provider as ByokProvider)) {
    const key = localStorage.getItem(`sf_${provider}_key`);
    if (key) headers.set(providerHeader(provider), key);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(apiBase() + path, { ...init, headers, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}

function errorMessage(body: unknown, status: number): { code: string; message: string; traceId?: string } {
  let candidate: unknown = body;
  if (body && typeof body === 'object' && 'detail' in body) candidate = (body as { detail: unknown }).detail;
  if (candidate && typeof candidate === 'object' && 'error' in candidate) {
    const container = candidate as Record<string, unknown>;
    const nested = container.error;
    if (nested && typeof nested === 'object') candidate = nested;
    else if (typeof nested === 'string') {
      return {
        code: nested,
        message: typeof container.message === 'string'
          ? container.message
          : typeof container.detail === 'string'
            ? container.detail
            : nested,
      };
    }
  }
  if (Array.isArray(candidate)) return { code: 'VALIDATION_ERROR', message: JSON.stringify(candidate) };
  if (candidate && typeof candidate === 'object') {
    const value = candidate as ApiErrorPayload;
    return {
      code: typeof value.code === 'string' ? value.code : `HTTP_${status}`,
      message: typeof value.message === 'string' ? value.message : `请求失败（HTTP ${status}）`,
      traceId: typeof value.trace_id === 'string' ? value.trace_id : undefined,
    };
  }
  if (typeof candidate === 'string') return { code: `HTTP_${status}`, message: candidate };
  return { code: `HTTP_${status}`, message: `请求失败（HTTP ${status}）` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const error = errorMessage(body, response.status);
    throw new ApiError(response.status, error.code, error.message, body, error.traceId);
  }
  return body as T;
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => request<T>(path, { method: 'DELETE' });

// 初始化与元数据。公司列表同时充当全链路健康检查：网关与 Python 任一离线都会失败。
export const seedOpc = () => apiPost<{ company: CompanyDto }>('/api/opc/seed');
export const getCompanies = () => apiGet<{ items: CompanyDto[] }>('/api/opc/companies').then(r => r.items);
export const getModels = () => apiGet<{ items: ModelDto[] }>('/api/opc/models').then(r => r.items);

// 组织架构。
export const getOrg = (companyId: string) => apiGet<{ departments: OrgDepartmentDto[]; headcount: number }>(`/api/opc/company/${companyId}/org`);
export const getRoster = (companyId: string) => apiGet<{ items: RosterEmployeeDto[] }>(`/api/opc/company/${companyId}/roster`).then(r => r.items);
export const createDepartment = (companyId: string, name: string, charter = '') => apiPost<{ department: OrgDepartmentDto }>(`/api/opc/company/${companyId}/departments`, { name, charter });
export const hireEmployee = (companyId: string, payload: Record<string, unknown>) => apiPost<{ employee: RosterEmployeeDto }>(`/api/opc/company/${companyId}/employees`, payload);
export const fireEmployee = (companyId: string, employeeId: string, reassignTo?: string) => apiPost<{ ok: boolean }>(`/api/opc/company/${companyId}/employees/${employeeId}/fire`, { reassign_to: reassignTo });

// 内部项目：老板派工走这里，不经过支付订单。
export const getProjects = (companyId: string) => apiGet<{ items: ProjectDto[] }>(`/api/opc/company/${companyId}/projects?limit=50`).then(r => r.items);
export const createProject = (companyId: string, goal: string) => apiPost<{ project: ProjectDto; tasks: ProjectTaskDto[] }>(`/api/opc/company/${companyId}/projects`, { name: `内部需求｜${goal.slice(0, 24)}`, goal, client_name: '内部', auto_plan: true });
export const getProject = (projectId: string) => apiGet<ProjectDetailDto>(`/api/opc/projects/${projectId}`);
export const runProject = (projectId: string, retry = false) => apiPost<{ project: ProjectDto; stopped: string; pending_approvals: ApprovalDto[]; tasks: ProjectTaskDto[] }>(`/api/opc/projects/${projectId}/run`, { retry });
export const deleteProject = (projectId: string) => apiDelete<void>(`/api/opc/projects/${projectId}`);

// 审批已接入核心项目流程；商务订单仍通过统一客户端预留。
export const getApprovals = (companyId: string, status = 'pending') => apiGet<{ items: ApprovalDto[] }>(`/api/opc/company/${companyId}/approvals?status=${encodeURIComponent(status)}`).then(r => r.items);
export const decideApproval = (approvalId: string, decision: 'approved' | 'rejected', note = '') => apiPost<{ approval: ApprovalDto }>(`/api/opc/approvals/${approvalId}/decide`, { decision, note, decided_by: '老板' });
export const getOrders = () => apiGet<{ items: OrderDto[] }>('/api/opc/orders?limit=50').then(r => r.items);
export const createOrder = (payload: { product_id: string; buyer_name?: string; contact?: string; requirement: string }) => apiPost<{ order: OrderDto; payment: Record<string, unknown> }>('/api/opc/orders', payload);
export const getOrder = (orderId: string) => apiGet<{ order: OrderDto; steps: ProjectTaskDto[]; events: Array<Record<string, unknown>> }>(`/api/opc/orders/${orderId}`);
export const getOrderEvents = (orderId: string, since: number) => apiGet<{ order_id: string; status: string; items: Array<Record<string, unknown>> }>(`/api/opc/orders/${orderId}/events?since=${since}`);
export const notifyPayment = (payload: Record<string, unknown>) => apiPost<{ ok: boolean; order: OrderDto }>('/api/opc/pay/notify', payload);

// 定时任务。
export const getSchedules = () => apiGet<{ data: ScheduleDto[] }>('/api/schedules').then(r => r.data);
export const createSchedule = (payload: Record<string, unknown>) => apiPost<{ data: ScheduleDto }>('/api/schedules', payload);
export const patchSchedule = (scheduleId: string, enabled: boolean) => apiPatch<{ data: ScheduleDto }>(`/api/schedules/${scheduleId}`, { enabled });
export const deleteSchedule = (scheduleId: string) => apiDelete<void>(`/api/schedules/${scheduleId}`);

// 知识包。
export const getKnowledgePacks = () => apiGet<{ data: { packs: KnowledgePackDto[] } }>('/api/knowledge/packs?limit=100').then(r => r.data.packs);
export const getKnowledgePack = (packId: string) => apiGet<{ data: KnowledgePackDto }>(`/api/knowledge/packs/${packId}`).then(r => r.data);
export const queryKnowledgePack = (packId: string, query: string) => apiPost<{ data: { hits: Array<Record<string, unknown>> } }>(`/api/knowledge/packs/${packId}/query`, { query });

// Node 用量看板 + Python 公司盈亏。
export const getDashboardOverview = () => apiGet<DashboardOverviewDto>('/api/dashboard/overview?days=30');
export const getDashboardSeries = () => apiGet<DashboardSeriesDto>('/api/dashboard/timeseries?days=7&metric=calls');
export const getDashboardBreakdown = () => apiGet<DashboardBreakdownDto>('/api/dashboard/breakdown?days=30&by=model');
export const getDashboardBriefing = () => apiGet<BriefingDto>('/api/dashboard/briefing?days=7');
export const getPnl = (companyId: string) => apiGet<{ pnl: PnlDto }>(`/api/opc/company/${companyId}/pnl`).then(r => r.pnl);
