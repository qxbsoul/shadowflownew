/* ShadowFlow Gateway 唯一网络入口。
 * 前端只访问同源 /api/**；Vite 负责转发到 Node:8002，禁止直连 Python:8000。
 * 后续页面可复用 apiGet/apiPost/apiPatch/apiDelete，无需再写裸 fetch。
 */
import { embeddingRequestHeaders } from './embedding-storage';
import { toolRequestHeaders } from './tool-storage';
import type { ChatActivity, ChatApproval, ChatDagNode, ChatShopChange } from './types';

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

export interface AuthUserDto {
  id: string;
  email?: string | null;
  display_name: string;
  auth_type: 'password' | 'guest';
}

export interface AuthSessionDto {
  token: string;
  user: AuthUserDto;
  company: CompanyDto;
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
  manager_id?: string | null;
  name: string;
  role: string;
  title: string;
  avatar?: string;
  system_prompt?: string;
  status: string;
  employment?: string;
  model_name?: string;
  skills?: string[];
  tools?: string[];
}

export interface EmployeePatch {
  name?: string;
  title?: string;
  department_id?: string | null;
  manager_id?: string | null;
  system_prompt?: string;
  avatar?: string;
  status?: string;
  model_name?: string;
  skills?: string[];
  tools?: string[];
}

export interface EmployeeConfigVersionDto {
  id: string;
  employee_id: string;
  company_id: string;
  version: number;
  source: 'hire' | 'patch' | 'org_publish' | 'restore' | 'legacy_snapshot' | string;
  restored_from_version?: number | null;
  created_at: string;
  config: {
    name?: string;
    role?: string;
    title?: string;
    department_id?: string | null;
    manager_id?: string | null;
    system_prompt?: string;
    model_name?: string;
    model_provider?: string;
    skills?: string[];
    tools?: string[];
    status?: string;
    [key: string]: unknown;
  };
}

export interface TaskExecutionDto {
  id: string;
  task_id: string;
  company_id: string;
  employee_id: string;
  config_version_id: string;
  config_version: number;
  attempt: number;
  input_summary?: string | null;
  output_summary?: string | null;
  model?: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_ms?: number | null;
  error?: string | null;
  status: string;
}

export interface OpcOrgDraft {
  departments: Array<{ id: string; name: string; charter: string }>;
  employees: Array<{
    id: string;
    name: string;
    title: string;
    role: string;
    system_prompt: string;
    skills: string[];
    tools: string[];
    department_id: string;
    manager_id: string | null;
    model_name: string;
  }>;
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
  brief?: string;
  priority?: string;
  status: string;
  output?: { text?: string; summary?: string; mode?: string; error?: string } | null;
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

export interface ScheduleRunDto {
  run_id: string;
  triggered_at: string;
  status: string;
  error?: string;
  conversation_id?: string;
  output_summary?: string;
}

export interface SchedulePatch {
  enabled?: boolean;
  cron_expression?: string | null;
  start_at?: string | null;
  agent_id?: string | null;
  task_description?: string;
  duration_min?: number;
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
  runs: ScheduleRunDto[];
}

export interface KnowledgeSourceDto {
  source_id: string;
  filename: string;
  extension?: string;
  size_bytes?: number;
  ingest_status?: string;
  chunk_count?: number;
  error_message?: string;
  imported_at?: string;
}

export interface KnowledgeHitDto {
  text: string;
  source?: string;
  source_name?: string;
  score?: number;
}

export interface KnowledgePackDto {
  pack_id: string;
  name: string;
  description?: string;
  status: string;
  sources?: KnowledgeSourceDto[];
  stats?: { sources?: number; chunks?: number; bytes?: number };
  created_at?: string;
  updated_at?: string;
}

export interface DashboardOverviewDto {
  currency: 'CNY';
  pricing: { source: string; input_per_million: number; cached_input_per_million: number; output_per_million: number };
  usage: {
    calls: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_est_cny: number;
    deltas: { calls: number | null; total_tokens: number | null; cost_est_cny: number | null };
  };
}

export interface DashboardSeriesDto {
  series: Array<{ day: number; calls: number; input_tokens: number; output_tokens: number; tokens: number; cost_est_cny: number }>;
}

export interface DashboardBreakdownDto {
  items: Array<{ key: string; calls: number; input_tokens: number; cached_input_tokens: number; output_tokens: number; total_tokens: number; cost_est_cny: number }>;
}

export interface PayInfoDto {
  configured: boolean;
  mode?: string;
  provider?: string;
  note?: string;
  [key: string]: unknown;
}

export interface ProductDto {
  id: string;
  name: string;
  summary?: string;
  detail?: string;
  price_cents: number;
  deliverable?: string;
  eta_hint?: string;
  active?: boolean;
}

export interface OrderDto {
  id: string;
  product_id: string;
  product_name?: string;
  buyer_name?: string;
  contact?: string;
  requirement?: string;
  amount_cents?: number;
  status: string;
  project_id?: string | null;
  created_at?: string;
  paid_at?: string;
  delivered_at?: string;
}

export interface OrderStepDto {
  title: string;
  agent?: string | null;
  status: string;
  round?: number | null;
}

export interface OrderDetailDto {
  order: OrderDto;
  project: { id: string; status: string } | null;
  steps: OrderStepDto[];
  events: Array<Record<string, unknown>>;
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

const AUTH_TOKEN_KEY = 'sf_opc_session';
export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
export const setAuthToken = (token: string) => token ? localStorage.setItem(AUTH_TOKEN_KEY, token) : localStorage.removeItem(AUTH_TOKEN_KEY);

export async function apiFetch(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error(`Gateway 路径必须以 /api/ 开头：${path}`);
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const provider = localStorage.getItem('sf_default_provider');
  if (provider && BYOK_PROVIDERS.includes(provider as ByokProvider)) {
    const key = localStorage.getItem(`sf_${provider}_key`);
    if (key) headers.set(providerHeader(provider), key);
  }
  // 自定义 OpenAI 兼容密钥只发往真实聊天接口，其他业务请求最小披露。
  if (path.startsWith('/api/opc-chat/') && localStorage.getItem('sf_api_config_mode') === 'custom') {
    const customKey = localStorage.getItem('sf_custom_api_key');
    if (customKey) headers.set('X-Custom-Api-Key', customKey);
  }
  if (path.startsWith('/api/opc-knowledge/') || path.startsWith('/api/opc-chat/')) {
    const embeddingHeaders = embeddingRequestHeaders();
    for (const [key, value] of Object.entries(embeddingHeaders)) headers.set(key, value);
  }
  if (path.startsWith('/api/opc-chat/') || path.startsWith('/api/schedules')) {
    for (const [key, value] of Object.entries(toolRequestHeaders())) headers.set(key, value);
    // 定时任务要保存执行凭据后才能后台跑：这里始终带上当前 MiMo Key。
    const mimoKey = localStorage.getItem('sf_mimo_key')?.trim();
    if (mimoKey) headers.set('X-MiMo-Key', mimoKey);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
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

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const response = await apiFetch(path, init, timeoutMs);
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

// OPC 身份与公司；密码只用于本次登录／注册请求，不写入浏览器存储。
export const loginOpc = (email: string, password: string) => apiPost<AuthSessionDto>('/api/opc/auth/login', { email, password });
export const registerOpc = (payload: { email: string; password: string; display_name: string; company_name: string }) => apiPost<AuthSessionDto>('/api/opc/auth/register', payload);
export const guestOpc = () => apiPost<AuthSessionDto>('/api/opc/auth/guest', {});
export const getOpcMe = () => apiGet<{ user: AuthUserDto; company: CompanyDto }>('/api/opc/auth/me');
export const logoutOpc = () => apiPost<{ ok: boolean }>('/api/opc/auth/logout', {});

// 初始化与元数据。公司列表同时充当全链路健康检查：网关与 Python 任一离线都会失败。
export const seedOpc = () => apiPost<{ company: CompanyDto }>('/api/opc/seed');
export const getCompanies = () => apiGet<{ items: CompanyDto[] }>('/api/opc/companies').then(r => r.items);
export const getModels = () => apiGet<{ items: ModelDto[] }>('/api/opc/models').then(r => r.items);

// 组织架构。
export const getOrg = (companyId: string) => apiGet<{ departments: OrgDepartmentDto[]; headcount: number }>(`/api/opc/company/${companyId}/org`);
export const getRoster = (companyId: string) => apiGet<{ items: RosterEmployeeDto[] }>(`/api/opc/company/${companyId}/roster`).then(r => r.items);
export const createDepartment = (companyId: string, name: string, charter = '') => apiPost<{ department: OrgDepartmentDto }>(`/api/opc/company/${companyId}/departments`, { name, charter });
export const updateDepartment = (companyId: string, departmentId: string, payload: { name?: string; charter?: string }) => apiPatch<{ department: OrgDepartmentDto }>(`/api/opc/company/${companyId}/departments/${encodeURIComponent(departmentId)}`, payload);
export const deleteDepartment = (companyId: string, departmentId: string) => apiDelete<void>(`/api/opc/company/${companyId}/departments/${encodeURIComponent(departmentId)}`);
export const hireEmployee = (companyId: string, payload: Record<string, unknown>) => apiPost<{ employee: RosterEmployeeDto }>(`/api/opc/company/${companyId}/employees`, payload);
export const updateEmployee = (companyId: string, employeeId: string, payload: EmployeePatch) => apiPatch<{ employee: RosterEmployeeDto }>(`/api/opc/company/${companyId}/employees/${encodeURIComponent(employeeId)}`, payload);
export const getEmployeeConfigVersions = (companyId: string, employeeId: string) => apiGet<{ items: EmployeeConfigVersionDto[] }>(`/api/opc/company/${companyId}/employees/${encodeURIComponent(employeeId)}/config-versions`).then(r => r.items);
export const restoreEmployeeConfigVersion = (companyId: string, employeeId: string, version: number) => apiPost<{ employee: RosterEmployeeDto; version: EmployeeConfigVersionDto }>(`/api/opc/company/${companyId}/employees/${encodeURIComponent(employeeId)}/config-versions/${version}/restore`, {});
export const fireEmployee = (companyId: string, employeeId: string, reassignTo?: string) => apiPost<{ ok: boolean; reassigned?: number }>(`/api/opc/company/${companyId}/employees/${encodeURIComponent(employeeId)}/fire`, { reassign_to: reassignTo || undefined });
export const generateOrgDraft = (companyId: string, businessDescription: string) => request<{ draft: OpcOrgDraft; model: string; mode: 'live' }>('/api/opc-org/draft', {
  method: 'POST',
  headers: { 'X-MiMo-Key': localStorage.getItem('sf_mimo_key')?.trim() || '' },
  body: JSON.stringify({ company_id: companyId, business_description: businessDescription }),
}, 100_000);
export const publishOrgDraft = (companyId: string, draft: OpcOrgDraft) => apiPost<{
  ok: true;
  created: { departments: number; employees: number };
}>('/api/opc-org/publish', { company_id: companyId, draft });

// 内部项目：老板派工走这里，不经过支付订单。
export const getProjects = (companyId: string) => apiGet<{ items: ProjectDto[] }>(`/api/opc/company/${companyId}/projects?limit=50`).then(r => r.items);
export const createProject = (companyId: string, goal: string, options: { name?: string; client_name?: string } = {}) => apiPost<{ project: ProjectDto; tasks: ProjectTaskDto[] }>(`/api/opc/company/${companyId}/projects`, { name: options.name || `内部需求｜${goal.slice(0, 24)}`, goal, client_name: options.client_name ?? '内部', auto_plan: true });
export const getProject = (projectId: string) => apiGet<ProjectDetailDto>(`/api/opc/projects/${projectId}`);
export const updateProjectTask = (taskId: string, payload: { title?: string; brief?: string; assignee?: string; priority?: string }) => apiPatch<{ task: ProjectTaskDto }>(`/api/opc/tasks/${encodeURIComponent(taskId)}`, payload);
export const getTaskExecutions = (taskId: string) => apiGet<{ items: TaskExecutionDto[] }>(`/api/opc/tasks/${encodeURIComponent(taskId)}/executions`).then(r => r.items);
export const runProject = (projectId: string, retry = false) => apiPost<{ project: ProjectDto; stopped: string; pending_approvals: ApprovalDto[]; tasks: ProjectTaskDto[] }>(`/api/opc/projects/${projectId}/run`, { retry });
export const deleteProject = (projectId: string) => apiDelete<void>(`/api/opc/projects/${projectId}`);

// 公司项目审批与商务订单；支付结果只由后端有效回调推进。
export const getApprovals = (companyId: string, status = 'pending') => apiGet<{ items: ApprovalDto[] }>(`/api/opc/company/${companyId}/approvals?status=${encodeURIComponent(status)}`).then(r => r.items);
export const decideApproval = (approvalId: string, decision: 'approved' | 'rejected', note = '') => apiPost<{ approval: ApprovalDto }>(`/api/opc/approvals/${approvalId}/decide`, { decision, note, decided_by: '老板' });
export const getProducts = () => apiGet<{ items: ProductDto[]; pay: PayInfoDto }>('/api/opc/products');
export const getOrders = () => apiGet<{ items: OrderDto[] }>('/api/opc/orders?limit=50').then(r => r.items);
export const createOrder = (payload: { product_id: string; buyer_name?: string; contact?: string; requirement: string }) => apiPost<{ order: OrderDto; payment: Record<string, unknown> }>('/api/opc/orders', payload);
export const getOrder = (orderId: string) => apiGet<OrderDetailDto>(`/api/opc/orders/${encodeURIComponent(orderId)}`);
export const cancelOrder = (orderId: string, reason = 'buyer_cancelled') => apiPost<{ order: OrderDto }>(`/api/opc/orders/${encodeURIComponent(orderId)}/cancel`, { reason });
export const getOrderEvents = (orderId: string, since: number) => apiGet<{ order_id: string; status: string; items: Array<Record<string, unknown>> }>(`/api/opc/orders/${orderId}/events?since=${since}`);
export const notifyPayment = (payload: Record<string, unknown>) => apiPost<{ ok: boolean; order: OrderDto }>('/api/opc/pay/notify', payload);

// 定时任务。
export const getSchedules = () => apiGet<{ data: ScheduleDto[] }>('/api/schedules').then(r => r.data);
export const createSchedule = (payload: Record<string, unknown>) => apiPost<{ data: ScheduleDto }>('/api/schedules', payload);
export const patchSchedule = (scheduleId: string, payload: SchedulePatch) => apiPatch<{ data: ScheduleDto }>(`/api/schedules/${encodeURIComponent(scheduleId)}`, payload);
export const deleteSchedule = (scheduleId: string) => apiDelete<void>(`/api/schedules/${encodeURIComponent(scheduleId)}`);
// 立即执行要等总经理 + 员工的完整回合，30s 默认超时会把请求 abort 掉（表现为
// "signal is aborted without reason"），这里单独放宽到 10 分钟。
export const runSchedule = (scheduleId: string) =>
  request<{ data: ScheduleRunDto }>(`/api/schedules/${encodeURIComponent(scheduleId)}/run`, { method: 'POST', body: '{}' }, 600_000).then(r => r.data);
export const getScheduleRuns = (scheduleId: string) => apiGet<{ data: ScheduleRunDto[] }>(`/api/schedules/${encodeURIComponent(scheduleId)}/runs`).then(r => r.data);

// 公司知识包：Node 校验归属，Python 负责文件解析与检索。
export const getKnowledgePacks = () => apiGet<{ data: { packs: KnowledgePackDto[] } }>('/api/opc-knowledge/packs').then(r => r.data.packs);
export const createKnowledgePack = (name: string, description = '') => apiPost<{ data: KnowledgePackDto }>('/api/opc-knowledge/packs', { name, description }).then(r => r.data);
export const updateKnowledgePack = (packId: string, payload: { name?: string; description?: string }) => apiPatch<{ data: KnowledgePackDto }>(`/api/opc-knowledge/packs/${encodeURIComponent(packId)}`, payload).then(r => r.data);
export const deleteKnowledgePack = (packId: string) => apiDelete<{ data: { deleted: boolean; pack_id: string } }>(`/api/opc-knowledge/packs/${encodeURIComponent(packId)}`);
export const deleteKnowledgeSource = (packId: string, sourceId: string) => apiDelete<{ data: { deleted: boolean; source_id: string } }>(`/api/opc-knowledge/packs/${encodeURIComponent(packId)}/sources/${encodeURIComponent(sourceId)}`);
export const uploadKnowledgeFile = (packId: string, file: File) => {
  const body = new FormData();
  body.append('upload', file, file.name);
  body.append('metadata', JSON.stringify({ original_name: file.name }));
  return request<{ data: KnowledgeSourceDto }>(`/api/opc-knowledge/packs/${encodeURIComponent(packId)}/files`, { method: 'POST', body }, 120_000).then(r => r.data);
};
export const queryKnowledgePack = (packId: string, query: string) => apiPost<{ data: { hits: KnowledgeHitDto[] }; meta?: { rag_backend?: string } }>(`/api/opc-knowledge/packs/${encodeURIComponent(packId)}/query`, { query, top_k: 5 });
export const testEmbeddingConnection = () => request<{ data: { model: string; dimensions: number } }>('/api/opc-knowledge/embedding/test', {
  method: 'POST', body: '{}',
}, 60_000);

// 当前公司真实模型用量；成本为人民币官方刊例价估算。
export const getDashboardOverview = () => apiGet<DashboardOverviewDto>('/api/dashboard/overview?days=30');
export const getDashboardSeries = () => apiGet<DashboardSeriesDto>('/api/dashboard/timeseries?days=7&metric=tokens');
export const getDashboardBreakdown = () => apiGet<DashboardBreakdownDto>('/api/dashboard/breakdown?days=30&by=model');

// ── 套餐与积分：10,000 Token = 1 积分，按月发放 ─────────────────────────────
export interface BillingSummaryDto {
  plan: 'basic' | 'studio';
  plan_label: string;
  price_cents: number;
  credits_total: number;
  credits_used: number;
  credits_remaining: number;
  percent_used: number;
  tokens_used: number;
  tokens_per_credit: number;
  period_start: string;
  period_end: string;
  features: string[];
}

export interface PlanDto {
  key: 'basic' | 'studio' | 'custom';
  label: string;
  price_cents: number;
  credits?: number;
  features: string[];
  contact?: boolean;
}

export const getOpcBilling = () => apiGet<{ data: BillingSummaryDto }>('/api/opc-billing/summary').then(r => r.data);
export const getOpcPlans = () => apiGet<{ items: PlanDto[] }>('/api/opc-billing/plans').then(r => r.items);
export const upgradeOpcPlan = (plan: 'basic' | 'studio') =>
  apiPost<{ data: BillingSummaryDto }>('/api/opc-billing/upgrade', { plan }).then(r => r.data);


// ── 小商品店铺：商品 / 订单 / 财务与销售统计 ──────────────────────────────────
export interface ShopProductDto {
  id: string;
  name: string;
  summary: string;
  description: string;
  images: string[];
  price_cents: number;
  cost_cents: number;
  market_price_cents: number;
  stock: number;
  shipping_fee_cents: number;
  status: 'active' | 'offline' | 'deleted';
  created_at: number;
  updated_at: number;
  sold_qty: number;
  revenue_cents: number;
  profit_cents: number;
}
export interface ShopProductInput {
  name?: string;
  summary?: string;
  description?: string;
  images?: string[];
  price_cents?: number;
  cost_cents?: number;
  market_price_cents?: number;
  stock?: number;
  shipping_fee_cents?: number;
  status?: 'active' | 'offline';
}
export type ShopOrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
export interface ShopOrderDto {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string;
  unit_price_cents: number;
  cost_cents: number;
  quantity: number;
  shipping_fee_cents: number;
  amount_cents: number;
  buyer_name: string;
  phone: string;
  address: string;
  note: string;
  status: ShopOrderStatus;
  tracking_company: string;
  tracking_no: string;
  tracking_note: string;
  created_at: number;
  paid_at: number | null;
  shipped_at: number | null;
  delivered_at: number | null;
}
export interface ShopFinanceDto {
  currency: 'CNY';
  window_days: number;
  revenue_cents: number;
  product_cost_cents: number;
  shipping_income_cents: number;
  ai_cost_cny: number;
  gross_profit_cny: number;
  order_count: number;
  paid_order_count: number;
  pending_ship_count: number;
  avg_order_cny: number;
  series: Array<{ day: number; revenue_cents: number; profit_cny: number; orders: number }>;
}
export interface ShopSalesDto {
  window_days: number;
  paid_orders: number;
  units_sold: number;
  revenue_cents: number;
  profit_cents: number;
  status_counts: Partial<Record<ShopOrderStatus, number>>;
  top_products: Array<{ product_id: string; name: string; units: number; revenue_cents: number; profit_cents: number }>;
  series: Array<{ day: number; orders: number; units: number; revenue_cents: number }>;
}
export interface ShopChangeDto {
  id: string;
  conversation_id: string;
  action: 'create' | 'update' | 'delete';
  product_id: string;
  summary: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
  decided_at: number | null;
}
export interface PublicProductDto {
  id: string;
  name: string;
  summary: string;
  description: string;
  images: string[];
  price_cents: number;
  market_price_cents: number;
  stock: number;
  shipping_fee_cents: number;
}
export interface PublicOrderDto {
  id: string;
  product_name: string;
  product_image: string;
  quantity: number;
  amount_cents: number;
  status: ShopOrderStatus;
  buyer_name: string;
  address: string;
  tracking_company: string;
  tracking_no: string;
  tracking_note: string;
  created_at: number;
  paid_at: number | null;
  shipped_at: number | null;
}

export const getShopProducts = () => apiGet<{ items: ShopProductDto[] }>('/api/shop/products').then(r => r.items);
export const createShopProduct = (payload: ShopProductInput) => apiPost<{ product: ShopProductDto }>('/api/shop/products', payload).then(r => r.product);
export const updateShopProduct = (id: string, payload: ShopProductInput) => apiPatch<{ product: ShopProductDto }>(`/api/shop/products/${encodeURIComponent(id)}`, payload).then(r => r.product);
export const deleteShopProduct = (id: string) => apiDelete<{ ok: boolean }>(`/api/shop/products/${encodeURIComponent(id)}`);
export const getShopOrders = (status = '') => apiGet<{ items: ShopOrderDto[]; total: number }>(`/api/shop/orders?limit=200${status ? `&status=${encodeURIComponent(status)}` : ''}`);
export const shipShopOrder = (id: string, payload: { tracking_company: string; tracking_no: string; tracking_note?: string }) => apiPost<{ order: ShopOrderDto }>(`/api/shop/orders/${encodeURIComponent(id)}/ship`, payload).then(r => r.order);
export const deliverShopOrder = (id: string) => apiPost<{ order: ShopOrderDto }>(`/api/shop/orders/${encodeURIComponent(id)}/deliver`, {}).then(r => r.order);
export const cancelShopOrder = (id: string) => apiPost<{ order: ShopOrderDto }>(`/api/shop/orders/${encodeURIComponent(id)}/cancel`, {}).then(r => r.order);
export const getShopFinance = (days = 30) => apiGet<ShopFinanceDto>(`/api/shop/stats/finance?days=${days}`);
export const getShopSales = (days = 30) => apiGet<ShopSalesDto>(`/api/shop/stats/sales?days=${days}`);
export const getShopChanges = (status = '') => apiGet<{ items: ShopChangeDto[] }>(`/api/shop/changes${status ? `?status=${status}` : ''}`).then(r => r.items);
export const decideShopChange = (id: string, decision: 'approve' | 'reject') => apiPost<{ request: ShopChangeDto; product: ShopProductDto | null }>(`/api/shop/changes/${encodeURIComponent(id)}/${decision}`, {});
export const getPublicProduct = (id: string) => apiGet<{ product: PublicProductDto }>(`/api/shop/public/products/${encodeURIComponent(id)}`).then(r => r.product);
export const createPublicOrder = (payload: { product_id: string; quantity: number; buyer_name: string; phone?: string; address: string; note?: string }) => apiPost<{ order: PublicOrderDto }>('/api/shop/public/orders', payload).then(r => r.order);
export const payPublicOrder = (id: string) => apiPost<{ order: PublicOrderDto }>(`/api/shop/public/orders/${encodeURIComponent(id)}/pay`, {}).then(r => r.order);
export const getPublicOrder = (id: string) => apiGet<{ order: PublicOrderDto }>(`/api/shop/public/orders/${encodeURIComponent(id)}`).then(r => r.order);

// 公司真实模型对话：Node 持久化，Python 校验公司归属。
export type OpcChatKind = 'single' | 'group';
export interface OpcConversationDto {
  id: string;
  company_id: string;
  kind: OpcChatKind;
  title: string;
  created_at: string;
  updated_at: string;
}
export interface OpcChatMessageDto {
  id: string;
  conversation_id: string;
  sender_kind: 'user' | 'ceo' | 'agent' | 'system';
  sender_name: string;
  agent_id: string | null;
  content: string;
  channel?: 'chat' | 'workflow';
  run_id?: string | null;
  task_id?: string | null;
  task_title?: string | null;
  thinking?: string;
  status?: 'pending' | 'waiting_approval' | 'running' | 'done' | 'failed' | 'blocked' | 'rejected' | null;
  duration_ms?: number | null;
  metadata_json?: string | null;
  created_at: string;
}
export interface OpcChatLogRunDto {
  run_id: string;
  messages: OpcChatMessageDto[];
  activities: ChatActivity[];
  approvals: ChatApproval[];
}
export interface OpcChatLogItemDto {
  conversation: OpcConversationDto;
  runs: OpcChatLogRunDto[];
  unassigned_messages: OpcChatMessageDto[];
}
export const getOpcChatLogs = (limit = 20, cursor = '') => apiGet<{ items: OpcChatLogItemDto[]; next_cursor: string | null }>(`/api/opc-chat/logs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
export const decideOpcChatApproval = (conversationId: string, approvalId: string, payload: { decision: 'approve' | 'reject' | 'custom'; custom_text?: string; outcome?: 'continue' | 'reject' }) => apiPost<{ approval: ChatApproval }>(`/api/opc-chat/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(approvalId)}`, payload);
export interface ChatApprovalListItemDto extends ChatApproval {
  conversation_title: string;
}
export const getOpcChatApprovals = (limit = 100) => apiGet<{ items: ChatApprovalListItemDto[] }>(`/api/opc-chat/approvals?limit=${limit}`).then(r => r.items);
export interface ChatDeliverableDto {
  id: string;
  title: string;
  kind: string;
  updated_at: string;
  final: { content: string; created_at: string } | null;
  employees: Array<{ id: string; name: string; task_title: string; content: string; status: string; created_at: string }>;
  pending_approvals: number;
}
export const getOpcChatDeliverables = (limit = 40) => apiGet<{ items: ChatDeliverableDto[] }>(`/api/opc-chat/deliverables?limit=${limit}`).then(r => r.items);

export const getOpcConversations = () => apiGet<{ items: OpcConversationDto[] }>('/api/opc-chat').then(r => r.items);
export const createOpcConversation = (kind: OpcChatKind) => apiPost<{ conversation: OpcConversationDto }>('/api/opc-chat', { kind }).then(r => r.conversation);
export const getOpcConversation = (id: string) => apiGet<{ conversation: OpcConversationDto; messages: OpcChatMessageDto[] }>(`/api/opc-chat/${id}`);
export const deleteOpcConversation = (id: string) => apiDelete<void>(`/api/opc-chat/${id}`);
export const sendOpcChat = (id: string, payload: {
  content: string;
  provider: ByokProvider;
  model: string;
  custom: boolean;
  base_url?: string;
}) => request<{ messages: OpcChatMessageDto[] }>(`/api/opc-chat/${id}/messages`, {
  method: 'POST', body: JSON.stringify(payload),
}, 300_000);

export type OpcChatStreamEvent =
  | { type: 'conversation-restored'; messages: OpcChatMessageDto[] }
  | { type: 'checkpoint'; message: OpcChatMessageDto }
  | { type: 'activity'; activity: ChatActivity }
  | { type: 'approval'; approval: ChatApproval }
  | { type: 'shop-change'; change: ChatShopChange }
  | { type: 'message-start'; client_id: string; sender_kind: 'ceo' | 'agent'; sender_name: string; agent_id?: string; channel?: 'chat' | 'workflow'; run_id?: string; task_id?: string; task_title?: string; workflow?: boolean }
  | { type: 'thinking-delta' | 'content-delta'; client_id: string; text: string }
  | { type: 'message-end'; client_id: string; message: OpcChatMessageDto }
  | { type: 'done'; plan?: { strategy?: string; source?: string; dag?: { nodes: ChatDagNode[] } } }
  | { type: 'error'; code: string; message: string };

export interface OpcChatStreamPayload {
  content: string;
  provider: ByokProvider;
  model: string;
  custom: boolean;
  base_url?: string;
}

async function streamOpcChat(
  path: string,
  payload: OpcChatStreamPayload,
  onEvent: (event: OpcChatStreamEvent) => void,
  files: File[] = [],
): Promise<void> {
  let body: BodyInit = JSON.stringify(payload);
  if (files.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) form.append(key, String(value));
    for (const file of files) form.append('files', file, file.name);
    body = form;
  }
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { Accept: 'application/x-ndjson' },
    body,
  }, 300_000);
  if (!response.ok) {
    const text = await response.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* 保留文本错误。 */ }
    const error = errorMessage(body, response.status);
    throw new ApiError(response.status, error.code, error.message, body, error.traceId);
  }
  if (!response.body) throw new ApiError(502, 'STREAM_UNAVAILABLE', '浏览器未能读取模型流式响应', null);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OpcChatStreamEvent;
    if (event.type === 'error') throw new ApiError(502, event.code, event.message, event);
    onEvent(event);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) consume(line);
    if (done) {
      if (buffer.trim()) consume(buffer);
      break;
    }
  }
}

const chatModelPayload = (content: string): OpcChatStreamPayload => ({
  content, provider: 'mimo', model: 'mimo-v2.6-pro', custom: false, base_url: 'https://api.xiaomimimo.com/v1',
});

export const sendOpcChatStream = (
  id: string,
  payload: OpcChatStreamPayload,
  onEvent: (event: OpcChatStreamEvent) => void,
  files: File[] = [],
) => streamOpcChat(`/api/opc-chat/${id}/messages`, payload, onEvent, files);

export const editOpcChatMessageStream = (
  id: string,
  messageId: string,
  content: string,
  onEvent: (event: OpcChatStreamEvent) => void,
) => streamOpcChat(`/api/opc-chat/${id}/messages/${encodeURIComponent(messageId)}/edit`, chatModelPayload(content), onEvent);

export const redoOpcChatCheckpointStream = (
  id: string,
  checkpointId: string,
  onEvent: (event: OpcChatStreamEvent) => void,
) => streamOpcChat(`/api/opc-chat/${id}/checkpoints/${encodeURIComponent(checkpointId)}/redo`, chatModelPayload(''), onEvent);
