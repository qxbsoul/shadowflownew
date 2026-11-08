/* 全局状态：Gateway 是业务数据唯一事实源，离线时拒绝业务写入。 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createDepartment,
  createSchedule,
  createKnowledgePack,
  createOpcConversation,
  deleteDepartment as deleteDepartmentApi,
  deleteKnowledgePack as deleteKnowledgePackApi,
  deleteKnowledgeSource,
  deleteOpcConversation as deleteOpcConversationApi,
  deleteSchedule,
  editOpcChatMessageStream,
  redoOpcChatCheckpointStream,
  fireEmployee,
  getAuthToken,
  getCompanies,
  getDashboardBreakdown,
  getDashboardOverview,
  getDashboardSeries,
  getKnowledgePacks,
  getModels,
  getOpcMe,
  getOpcBilling,
  getOpcPlans,
  upgradeOpcPlan,
  getOpcConversation,
  getOpcConversations,
  getOpcChatApprovals,
  getOpcChatDeliverables,
  getOrg,
  getRoster,
  getSchedules,
  getScheduleRuns,
  getShopChanges,
  getShopFinance,
  getShopOrders,
  getShopProducts,
  getShopSales,
  decideShopChange as decideShopChangeApi,
  guestOpc,
  hireEmployee,
  loginOpc,
  logoutOpc,
  patchSchedule,
  queryKnowledgePack,
  registerOpc,
  runSchedule,
  updateDepartment,
  updateEmployee,
  updateKnowledgePack as updateKnowledgePackApi,
  uploadKnowledgeFile,
  type ChatApprovalListItemDto,
  type ChatDeliverableDto,
  type BillingSummaryDto,
  type PlanDto,
  type EmployeePatch,
  type KnowledgeHitDto,
  type KnowledgeSourceDto,
  type SchedulePatch,
  type ScheduleRunDto,
  type ShopChangeDto,
  type ShopFinanceDto,
  type ShopOrderDto,
  type ShopProductDto,
  type ShopSalesDto,
  seedOpc,
  sendOpcChatStream,
  decideOpcChatApproval as decideOpcChatApprovalApi,
  setAuthToken,
  type OpcChatKind,
  type OpcChatMessageDto,
  type OpcChatStreamEvent,
  type OpcConversationDto,
  type AuthUserDto,
  type ByokProvider,
  type CompanyDto,
  type RosterEmployeeDto,
  type ScheduleDto,
} from './api';
import { persistChatMessages, restoreChatMessages } from './chat-storage';
import { avatarIdFor } from './avatar-set';
import { persistConversationWorkspace, restoreConversationWorkspace, type ConversationMeta } from './conversation-storage';
import {
  clearApiKey,
  loadApiSettings,
  MIMO_BASE_URL,
  MIMO_MODEL,
  saveApiSettings,
  type ApiConfigMode,
  type ApiSettingsInput,
  type ApiSettingsState,
} from './settings-storage';
import type {
  Activity,
  ChatActivity,
  ChatApproval,
  ChatAttachment,
  ChatCheckpoint,
  ChatDagNode,
  ChatShopChange,
  ChatWorkflow,
  ChatWorkflowRun,
  DashboardState,
  Deliverable,
  ErrItem,
  KbItem,
  ModelOption,
  Msg,
  ModalState,
  OrgState,
  Position,
  Staff,
  TaskItem,
  Toast,
  ViewKey,
} from './types';
import { EMPTY_CHAT_WORKFLOW, EMPTY_DASHBOARD } from './types';
import { uid } from './data';

export const VIEW_TITLES: Record<ViewKey, string> = {
  workbench: '工作台',
  orders: '商品与订单',
  approvals: '人工审批',
  logs: '运行日志',
  org: '组织架构',
  tasks: '定时任务',
  deliverables: '交付成果',
  dashboard: '数据看板',
  knowledge: '知识库',
  settings: '设置',
};

export function nowHM(): string {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export interface NewPositionInput {
  name: string;
  deptId: string;
  managerId: string;
  soul: string;
}

export interface NewStaffInput {
  name: string;
  positionId: string;
  managerId: string;
  /** micah 头像 id；不传时按名字自动分配。 */
  avatar?: string;
}

export interface NewTaskInput {
  title: string;
  freq: string;
  time: string;
  /** 旧字段：定时任务已统一走总经理，保留兼容但不再使用。 */
  position?: string;
  runDate?: string;
  weekDay?: string;
  monthDay?: string;
}

export type DashboardSection = 'ai' | 'finance' | 'sales';

export interface WorkbenchStore {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  authStatus: 'loading' | 'anonymous' | 'authenticated';
  authPanel: 'login' | 'register';
  setAuthPanel: (panel: 'login' | 'register') => void;
  authUser: AuthUserDto | null;
  currentCompany: CompanyDto | null;
  authError: string;
  authenticate: (kind: 'login' | 'register', payload: { email: string; password: string; display_name?: string; company_name?: string }) => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => Promise<void>;
  conversations: ConversationMeta[];
  /** 静默刷新会话列表（定时任务在后台建的对话靠它出现在工作台）。 */
  refreshConversations: () => Promise<void>;
  activeConversationId: string;
  newConversation: (kind?: OpcChatKind) => void;
  selectConversation: (id: string) => void;
  openConversation: (id: string) => Promise<void>;
  switchConversationKind: (kind: OpcChatKind) => void;
  deleteConversation: (id: string) => Promise<void>;
  messages: Msg[];
  /** 仅表示当前对话是否正在执行；其他对话的运行状态通过 isConversationTyping 查询。 */
  typing: boolean;
  isConversationTyping: (id: string) => boolean;
  sendChat: (text: string, files?: File[]) => void;
  editChatMessage: (messageId: string, text: string) => void;
  redoCheckpoint: (checkpointId: string) => void;
  decideChatApproval: (approvalId: string, decision: 'approve' | 'reject' | 'custom', customText?: string, outcome?: 'continue' | 'reject', conversationId?: string) => Promise<void>;
  chatWorkflow: ChatWorkflow;
  errors: ErrItem[];
  retryError: (id: string) => void;
  tasks: TaskItem[];
  toggleTask: (id: string) => Promise<void>;
  saveTask: (id: string, patch: SchedulePatch) => Promise<void>;
  runTask: (id: string) => Promise<ScheduleRunDto>;
  getTaskRuns: (id: string) => Promise<ScheduleRunDto[]>;
  deleteTask: (id: string) => Promise<void>;
  createTask: (input: NewTaskInput) => Promise<void>;
  knowledge: KbItem[];
  createKnowledge: (name: string, description?: string) => Promise<void>;
  renameKnowledge: (id: string, name: string, description: string) => Promise<void>;
  removeKnowledge: (id: string) => Promise<void>;
  removeKnowledgeSource: (packId: string, sourceId: string) => Promise<void>;
  uploadKnowledge: (files: File[], packId?: string) => Promise<KnowledgeSourceDto[]>;
  searchKnowledge: (packId: string, query: string) => Promise<{ hits: KnowledgeHitDto[]; ragBackend: string }>;
  kbFilter: string;
  setKbFilter: (f: string) => void;
  org: OrgState;
  companyId: string | null;
  refreshOrg: () => Promise<void>;
  selectedPosId: string | null;
  selectedStaffId: string | null;
  selectPosition: (id: string) => void;
  selectStaff: (id: string) => void;
  savePosition: (id: string, patch: Partial<Position>) => Promise<void>;
  saveStaff: (id: string, patch: Partial<Staff>) => Promise<void>;
  createDept: (name: string, charter?: string) => Promise<void>;
  renameDept: (id: string, name: string) => Promise<void>;
  deleteDept: (id: string) => Promise<void>;
  createPosition: (input: NewPositionInput) => Promise<void>;
  deletePosition: (id: string) => Promise<void>;
  createStaff: (input: NewStaffInput) => Promise<void>;
  deleteStaff: (id: string, reassignTo?: string) => Promise<void>;
  modal: ModalState | null;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  toasts: Toast[];
  toast: (msg: string) => void;
  gwStatus: 'connecting' | 'ok' | 'off';
  models: ModelOption[];
  selectedModel: string;
  selectModel: (id: string) => void;
  apiSettings: ApiSettingsState;
  saveModelSettings: (input: ApiSettingsInput) => void;
  clearModelKey: (target: { mode: ApiConfigMode; provider: ByokProvider }) => void;
  /** 小商品店铺：商品 / 订单 / 财务与销售统计 / AI 变更审批。 */
  shopProducts: ShopProductDto[];
  shopProductsLoading: boolean;
  refreshShopProducts: () => Promise<void>;
  shopOrders: ShopOrderDto[];
  shopOrdersLoading: boolean;
  refreshShopOrders: () => Promise<void>;
  shopFinance: ShopFinanceDto | null;
  shopSales: ShopSalesDto | null;
  shopStatsLoading: boolean;
  refreshShopFinance: () => Promise<void>;
  refreshShopSales: () => Promise<void>;
  shopChanges: ShopChangeDto[];
  shopChangesLoading: boolean;
  refreshShopChanges: () => Promise<void>;
  decideShopChange: (id: string, decision: 'approve' | 'reject') => Promise<void>;
  dashboardSection: DashboardSection;
  /** 套餐与积分：10,000 Token = 1 积分，按月发放。 */
  billing: BillingSummaryDto | null;
  billingLoading: boolean;
  plans: PlanDto[];
  refreshBilling: () => Promise<void>;
  upgradePlan: (plan: 'basic' | 'studio') => Promise<void>;
  setDashboardSection: (section: DashboardSection) => void;
  dashboard: DashboardState;
  dashboardLoading: boolean;
  refreshDashboard: () => Promise<void>;
  /** 左侧「交付成果」：按对话聚合的最终成果与员工中间产出。 */
  conversationDeliverables: ChatDeliverableDto[];
  conversationDeliverablesLoading: boolean;
  refreshConversationDeliverables: () => Promise<void>;
  /** 左侧「人工审批」：跨对话的真实任务审批。 */
  chatApprovals: ChatApprovalListItemDto[];
  chatApprovalsLoading: boolean;
  refreshChatApprovals: () => Promise<void>;
}

const WorkbenchContext = createContext<WorkbenchStore | null>(null);

export function useWorkbench(): WorkbenchStore {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error('useWorkbench 必须在 WorkbenchContext.Provider 内使用');
  return ctx;
}

const ROOT_POSITION: Position = {
  id: 'p-ceo',
  name: '总经理',
  deptId: null,
  managerId: null,
  avatar: '总',
  enabled: true,
  root: true,
  soul: '负责理解老板需求、拆解目标、协调公司岗位并把控最终交付。',
};

function positionIdFor(employee: RosterEmployeeDto): string {
  return `pos-${employee.role}-${employee.department_id ?? 'none'}`;
}

function formatTime(raw?: string): string {
  if (!raw) return '时间未记录';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `今天 ${hm}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${hm}`;
}

function formatNext(raw: string | null): string {
  if (!raw) return '暂无后续运行';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function scheduleText(schedule: ScheduleDto): { label: string; once: boolean; mark: string } {
  if (!schedule.cron_expression) return { label: `一次性 · ${formatNext(schedule.start_at)}`, once: true, mark: '次' };
  const [minute, hour, day, , weekday] = schedule.cron_expression.split(' ');
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  if (weekday !== '*') {
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return { label: `每周${names[Number(weekday)] ?? weekday} ${time}`, once: false, mark: '周' };
  }
  if (day !== '*') return { label: `每月 ${day} 日 ${time}`, once: false, mark: '月' };
  return { label: `每天 ${time}`, once: false, mark: '日' };
}

export function useWorkbenchStore(): WorkbenchStore {
  const [view, setView] = useState<ViewKey>('workbench');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, boolean>>({});
  const [chatWorkflow, setChatWorkflow] = useState<ChatWorkflow>(EMPTY_CHAT_WORKFLOW);
  const [conversationDeliverables, setConversationDeliverables] = useState<ChatDeliverableDto[]>([]);
  const [conversationDeliverablesLoading, setConversationDeliverablesLoading] = useState(false);
  const [chatApprovals, setChatApprovals] = useState<ChatApprovalListItemDto[]>([]);
  const [chatApprovalsLoading, setChatApprovalsLoading] = useState(false);
  const [shopProducts, setShopProducts] = useState<ShopProductDto[]>([]);
  const [shopProductsLoading, setShopProductsLoading] = useState(false);
  const [shopOrders, setShopOrders] = useState<ShopOrderDto[]>([]);
  const [shopOrdersLoading, setShopOrdersLoading] = useState(false);
  const [shopFinance, setShopFinance] = useState<ShopFinanceDto | null>(null);
  const [shopSales, setShopSales] = useState<ShopSalesDto | null>(null);
  const [shopStatsLoading, setShopStatsLoading] = useState(false);
  const [shopChanges, setShopChanges] = useState<ShopChangeDto[]>([]);
  const [shopChangesLoading, setShopChangesLoading] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('sales');
  const [billing, setBilling] = useState<BillingSummaryDto | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [errors, setErrors] = useState<ErrItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [knowledge, setKnowledge] = useState<KbItem[]>([]);
  const [org, setOrg] = useState<OrgState>({ departments: [], positions: [], staff: [] });
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [kbFilter, setKbFilter] = useState('全部');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [gwStatus, setGwStatus] = useState<'connecting' | 'ok' | 'off'>('connecting');
  const [authStatus, setAuthStatus] = useState<'loading' | 'anonymous' | 'authenticated'>('loading');
  const [authPanel, setAuthPanel] = useState<'login' | 'register'>('login');
  const [authUser, setAuthUser] = useState<AuthUserDto | null>(null);
  const [currentCompany, setCurrentCompany] = useState<CompanyDto | null>(null);
  const [authError, setAuthError] = useState('');
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState(MIMO_MODEL);
  // 发送请求时读 ref，避免闭包拿到旧的模型 id。
  const selectedModelRef = useRef(MIMO_MODEL);
  const [apiSettings, setApiSettings] = useState<ApiSettingsState>(() => loadApiSettings());
  const [dashboard, setDashboard] = useState<DashboardState>(EMPTY_DASHBOARD);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const companyIdRef = useRef<string | null>(null);
  const liveRef = useRef(false);
  const chatScopeRef = useRef<string | null>(null);
  const companyChatScopeRef = useRef('');
  const activeConversationRef = useRef('');
  const runningConversationsRef = useRef(new Set<string>());
  const orgMutationsRef = useRef(new Set<string>());
  const taskMutationsRef = useRef(new Set<string>());
  const knowledgeMutationsRef = useRef(new Set<string>());
  const typing = Boolean(activeConversationId && typingByConversation[activeConversationId]);
  const isConversationTyping = (id: string) => Boolean(typingByConversation[id]);
  const setConversationTyping = (id: string, running: boolean) => {
    if (running) runningConversationsRef.current.add(id);
    else runningConversationsRef.current.delete(id);
    setTypingByConversation(previous => {
      if (Boolean(previous[id]) === running) return previous;
      const next = { ...previous };
      if (running) next[id] = true;
      else delete next[id];
      return next;
    });
  };

  useEffect(() => {
    if (chatScopeRef.current) persistChatMessages(chatScopeRef.current, messages);
  }, [messages]);
  useEffect(() => {
    if (companyChatScopeRef.current) persistConversationWorkspace(companyChatScopeRef.current, { activeId: activeConversationId, items: conversations });
  }, [conversations, activeConversationId]);

  const conversationWelcome = (_kind: OpcChatKind = 'single', title?: string): Msg[] => title ? [{
    from: 'ceo', text: `已打开项目「${title}」。`, time: nowHM(),
  }] : [];

  const fromServerConversation = (item: OpcConversationDto): ConversationMeta => ({
    id: item.id, title: item.title, kind: item.kind, updatedAt: item.updated_at,
  });
  const metadataFromMessage = (item: OpcChatMessageDto): { activity?: ChatActivity; approval?: ChatApproval; shopChange?: ChatShopChange; checkpoint?: ChatCheckpoint; attachments?: ChatAttachment[]; strategy?: string; source?: string; dag?: { nodes: ChatDagNode[] } } => {
    try { return item.metadata_json ? JSON.parse(item.metadata_json) : {}; } catch { return {}; }
  };
  const activityFromMessage = (item: OpcChatMessageDto): ChatActivity | undefined => metadataFromMessage(item).activity;
  const fromServerMessage = (item: OpcChatMessageDto): Msg => ({
    id: item.id,
    from: item.sender_kind === 'user' ? 'boss' : item.sender_kind,
    senderName: item.sender_name,
    text: item.content,
    thinking: item.thinking || undefined,
    thinkingDone: true,
    time: formatTime(item.created_at),
    activity: activityFromMessage(item),
    attachments: metadataFromMessage(item).attachments,
    approval: metadataFromMessage(item).approval,
    shopChange: metadataFromMessage(item).shopChange,
    checkpoint: metadataFromMessage(item).checkpoint,
    channel: item.channel ?? 'chat',
    runId: item.run_id ?? undefined,
  });
  const applyConversationDetail = (detail: { messages: OpcChatMessageDto[] }, kind: OpcChatKind) => {
    const chatMessages = detail.messages.filter(message => message.channel !== 'workflow' || activityFromMessage(message) || metadataFromMessage(message).approval || metadataFromMessage(message).shopChange || metadataFromMessage(message).checkpoint);
    const workflowMessages = detail.messages.filter(message => message.channel === 'workflow' || message.task_id);
    const runIds = [...new Set(workflowMessages.map(message => message.run_id || 'legacy'))];
    const runs: ChatWorkflowRun[] = runIds.map(runId => {
      const records = workflowMessages.filter(message => (message.run_id || 'legacy') === runId);
      const planMessage = records.find(message => message.sender_kind === 'ceo');
      const metadata = planMessage ? metadataFromMessage(planMessage) : {};
      const goal = detail.messages.find(message => message.sender_kind === 'user' && (message.run_id || 'legacy') === runId)?.content ?? '历史工作流';
      return {
        id: runId,
        goal,
        plan: planMessage?.content ?? '',
        strategy: metadata.strategy,
        source: metadata.source,
        dag: metadata.dag?.nodes,
        createdAt: Date.parse(records[0]?.created_at ?? '') || Date.now(),
        activities: records.map(activityFromMessage).filter((item): item is ChatActivity => Boolean(item)),
        items: records.filter(message => message.sender_kind === 'agent').map(message => ({
          id: message.id,
          agentId: message.agent_id ?? undefined,
          name: message.sender_name,
          taskTitle: message.task_title || '岗位工单',
          content: message.content,
          thinking: message.thinking ?? '',
          status: message.status ?? 'done',
          durationMs: message.duration_ms ?? undefined,
          startedAt: Date.parse(message.created_at) || Date.now(),
        })),
      };
    }).sort((a, b) => a.createdAt - b.createdAt);
    // 历史数据里同一审批可能有多条消息（旧版会追加一条“已决定”消息）：
    // 只保留最后一条（已决定的），并统一用 approval-<id> 作为卡片 id。
    const lastApprovalMessage = new Map<string, string>();
    for (const message of chatMessages) {
      const approval = metadataFromMessage(message).approval;
      if (approval) lastApprovalMessage.set(approval.id, message.id);
    }
    const deduped = chatMessages.filter(message => {
      const approval = metadataFromMessage(message).approval;
      return !approval || lastApprovalMessage.get(approval.id) === message.id;
    });
    setMessages(deduped.length ? deduped.map(message => {
      const approval = metadataFromMessage(message).approval;
      const mapped = fromServerMessage(message);
      return approval ? { ...mapped, id: `approval-${approval.id}` } : mapped;
    }) : conversationWelcome(kind));
    setChatWorkflow({ runs });
  };

  const restoreCompanyChat = async (company: CompanyDto) => {
    const scope = `company:${company.id}`;
    companyChatScopeRef.current = scope;
    const saved = restoreConversationWorkspace(scope);
    let items = (await getOpcConversations()).map(fromServerConversation);
    if (!items.length) items = [fromServerConversation(await createOpcConversation('single'))];
    const activeId = items.some(item => item.id === saved.activeId) ? saved.activeId : items[0].id;
    const active = items.find(item => item.id === activeId) ?? items[0];
    activeConversationRef.current = activeId;
    chatScopeRef.current = `${scope}:${activeId}`;
    setConversations(items);
    setActiveConversationId(activeId);
    const detail = await getOpcConversation(activeId);
    applyConversationDetail(detail, active.kind ?? 'single');
  };

  /**
   * 静默刷新会话列表：定时任务在后台新建的对话不会推送事件，
   * 工作台开着的时候靠它把「定时任务｜…」及时挂到侧边栏。
   */
  const refreshConversations = async () => {
    if (!companyIdRef.current) return;
    try {
      const latest = (await getOpcConversations()).map(fromServerConversation);
      if (!latest.length) return;
      setConversations(previous => {
        const merged = new Map(previous.map(item => [item.id, item]));
        for (const item of latest) merged.set(item.id, item);
        return [...merged.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      });
    } catch {
      // 后台刷新失败不打扰用户，下次进入工作台会再试。
    }
  };

  const newConversation = (kind: OpcChatKind = 'single') => {
    if (!liveRef.current) {
      toast('后端未连接，无法新建对话');
      return;
    }
    setChatWorkflow(EMPTY_CHAT_WORKFLOW);
    void createOpcConversation(kind).then(item => {
      activeConversationRef.current = item.id;
      chatScopeRef.current = `${companyChatScopeRef.current}:${item.id}`;
      setConversations(prev => [fromServerConversation(item), ...prev]);
      setActiveConversationId(item.id);
      setMessages(conversationWelcome(kind));
    }).catch(error => reportError(error, '新建对话失败'));
  };

  const selectConversation = (id: string) => {
    if (id === activeConversationRef.current) return;
    const target = conversations.find(item => item.id === id);
    if (!target) return;
    setChatWorkflow(EMPTY_CHAT_WORKFLOW);
    activeConversationRef.current = id;
    chatScopeRef.current = `${companyChatScopeRef.current}:${id}`;
    setActiveConversationId(id);
    if (liveRef.current && !target.projectId) {
      setMessages([]);
      void getOpcConversation(id).then(detail => {
        if (activeConversationRef.current === id) applyConversationDetail(detail, target.kind ?? 'single');
      }).catch(error => reportError(error, '对话加载失败'));
    } else {
      setMessages(restoreChatMessages(chatScopeRef.current) ?? conversationWelcome(target.kind, target.projectId ? target.title : undefined));
    }
  };

  /**
   * 直接跳到某个对话（哪怕它还没在当前列表里）——定时任务在后台创建的
   * 「定时任务｜…」对话就用它打开。
   */
  const openConversation = async (id: string) => {
    if (!companyIdRef.current) return;
    try {
      const detail = await getOpcConversation(id);
      const meta = fromServerConversation(detail.conversation);
      setConversations(prev => prev.some(item => item.id === id) ? prev : [meta, ...prev]);
      setChatWorkflow(EMPTY_CHAT_WORKFLOW);
      activeConversationRef.current = id;
      chatScopeRef.current = `${companyChatScopeRef.current}:${id}`;
      setActiveConversationId(id);
      applyConversationDetail(detail, detail.conversation.kind ?? 'single');
      setView('workbench');
    } catch (error) {
      reportError(error, '对话加载失败');
    }
  };

  const switchConversationKind = (kind: OpcChatKind) => {
    const target = conversations.find(item => (item.kind ?? 'single') === kind && !item.projectId);
    if (target) selectConversation(target.id);
    else newConversation(kind);
  };

  const deleteConversation = async (id: string) => {
    const target = conversations.find(item => item.id === id);
    if (!target) return;
    if (!liveRef.current) {
      const error = new Error('后端未连接，无法删除对话');
      toast(error.message);
      throw error;
    }
    try {
      if (!target.projectId) await deleteOpcConversationApi(id);
      const remaining = conversations.filter(item => item.id !== id);
      setConversations(remaining);
      setModal(null);
      if (activeConversationRef.current === id) {
        activeConversationRef.current = '';
        const next = remaining.find(item => (item.kind ?? 'single') === (target.kind ?? 'single'));
        if (next) selectConversation(next.id);
        else newConversation(target.kind ?? 'single');
      }
      toast('对话已删除');
    } catch (error) {
      reportError(error, '删除对话失败');
      throw error;
    }
  };

  const authenticate = async (kind: 'login' | 'register', payload: { email: string; password: string; display_name?: string; company_name?: string }) => {
    const session = kind === 'login'
      ? await loginOpc(payload.email, payload.password)
      : await registerOpc({ email: payload.email, password: payload.password, display_name: payload.display_name ?? '', company_name: payload.company_name ?? '' });
    setAuthToken(session.token);
    window.location.reload();
  };
  const guestLogin = async () => {
    const session = await guestOpc();
    setAuthToken(session.token);
    window.location.reload();
  };
  const logout = async () => {
    try { await logoutOpc(); } finally {
      setAuthToken('');
      window.location.reload();
    }
  };

  const toast = (msg: string) => {
    const id = uid('t');
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  };
  const openModal = (m: ModalState) => setModal(m);
  const closeModal = () => setModal(null);
  const pushMsg = (from: Msg['from'], text: string, card?: Msg['card'], attachments?: Msg['attachments']) => {
    setMessages(prev => [...prev, { from, text, time: nowHM(), card, attachments }]);
  };

  const reportError = (error: unknown, title: string) => {
    const apiError = error instanceof ApiError ? error : null;
    const message = error instanceof Error ? error.message : String(error);
    const code = apiError?.code ?? 'NETWORK_ERROR';
    // 执行器未配置只是单项能力不可用，不应把仍可用的 Gateway 误判为离线。
    if ((apiError?.status === 503 && code !== 'EXECUTOR_UNAVAILABLE') || !apiError) {
      liveRef.current = false;
      setGwStatus('off');
    }
    setErrors(prev => [{
      id: uid('err'),
      title,
      cause: `${code}：${message}`,
      impact: '本次操作未写入成功，页面保留服务端最后确认的数据。',
      action: code === 'NO_API_KEY'
        ? '请在浏览器 localStorage 配置当前 provider 的 BYOK key 后重试。'
        : code === 'STATE_CONFLICT' || apiError?.status === 409
          ? '刷新页面确认最新状态，再调整操作。'
          : '按原因修正后可从原操作重新提交。',
      time: '刚刚',
      resolved: false,
    }, ...prev].slice(0, 12));
    toast(`${title}：${message}`);
  };

  const runOrgMutation = async (key: string, title: string, operation: () => Promise<void>) => {
    if (orgMutationsRef.current.has(key)) return;
    orgMutationsRef.current.add(key);
    try {
      await operation();
    } catch (error) {
      reportError(error, title);
      throw error;
    } finally {
      orgMutationsRef.current.delete(key);
    }
  };

  const refreshOrg = async () => {
    const companyId = companyIdRef.current;
    if (!companyId) return;
    const [chart, roster] = await Promise.all([getOrg(companyId), getRoster(companyId)]);
    // offline 是停用状态，仍应显示；只有已离职员工从组织图中移除。
    const active = roster.filter(e => e.employment !== 'retired');
    const byId = new Map(active.map(e => [e.id, e]));
    const managerPositionId = (employee: RosterEmployeeDto) => {
      const manager = employee.manager_id ? byId.get(employee.manager_id) : undefined;
      return manager ? positionIdFor(manager) : ROOT_POSITION.id;
    };
    const positions: Position[] = [ROOT_POSITION];
    const staff: Staff[] = [];
    for (const dept of chart.departments) {
      for (const employee of active.filter(e => e.department_id === dept.id)) {
        const positionId = positionIdFor(employee);
        const managerId = managerPositionId(employee);
        if (!positions.some(p => p.id === positionId)) {
          positions.push({
            id: positionId,
            name: employee.title,
            deptId: dept.id,
            managerId,
            avatar: employee.avatar ?? employee.name.slice(0, 1),
            enabled: employee.status !== 'offline',
            soul: employee.system_prompt || '（该岗位暂未配置职责提示词）',
            sourceEmployeeId: employee.id,
            sourceRole: employee.role,
          });
        }
        staff.push({
          id: employee.id,
          name: employee.name,
          positionId,
          managerId,
          avatar: employee.avatar ?? employee.name.slice(0, 1),
          skills: employee.skills ?? [],
          tools: employee.tools ?? [],
        });
      }
    }
    setOrg({ departments: chart.departments.map(d => ({ id: d.id, name: d.name, charter: d.charter })), positions, staff });
  };

  /** 交付成果与审批都以真实对话数据为准；公司边界由后端校验。 */
  const refreshConversationDeliverables = async () => {
    if (!companyIdRef.current) return;
    setConversationDeliverablesLoading(true);
    try {
      setConversationDeliverables(await getOpcChatDeliverables());
    } finally {
      setConversationDeliverablesLoading(false);
    }
  };

  const refreshChatApprovals = async () => {
    if (!companyIdRef.current || chatApprovalsLoading) return;
    setChatApprovalsLoading(true);
    try {
      setChatApprovals(await getOpcChatApprovals());
    } finally {
      setChatApprovalsLoading(false);
    }
  };

  const refreshShopProducts = async () => {
    if (!companyIdRef.current) return;
    setShopProductsLoading(true);
    try {
      setShopProducts(await getShopProducts());
    } finally {
      setShopProductsLoading(false);
    }
  };

  const refreshShopOrders = async () => {
    if (!companyIdRef.current) return;
    setShopOrdersLoading(true);
    try {
      setShopOrders((await getShopOrders()).items);
    } finally {
      setShopOrdersLoading(false);
    }
  };

  const refreshShopFinance = async () => {
    if (!companyIdRef.current) return;
    setShopStatsLoading(true);
    try {
      setShopFinance(await getShopFinance(30));
    } finally {
      setShopStatsLoading(false);
    }
  };

  const refreshShopSales = async () => {
    if (!companyIdRef.current) return;
    setShopStatsLoading(true);
    try {
      setShopSales(await getShopSales(30));
    } finally {
      setShopStatsLoading(false);
    }
  };

  const refreshShopChanges = async () => {
    if (!companyIdRef.current || shopChangesLoading) return;
    setShopChangesLoading(true);
    try {
      setShopChanges(await getShopChanges());
    } finally {
      setShopChangesLoading(false);
    }
  };

  const decideShopChange = async (id: string, decision: 'approve' | 'reject') => {
    try {
      const result = await decideShopChangeApi(id, decision);
      setShopChanges(prev => prev.map(item => item.id === id ? result.request : item));
      await Promise.all([refreshShopProducts(), refreshShopOrders()]);
      toast(decision === 'approve' ? '已批准，商品变更已生效' : '已驳回，商品保持不变');
    } catch (error) {
      reportError(error, '商品变更审批失败');
      throw error;
    }
  };

  const refreshTasks = async () => {
    const records = (await getSchedules()).filter(record => record.group_id === companyIdRef.current);
    setTasks(records.map(record => {
      const meta = scheduleText(record);
      const owner = org.positions.find(p => p.sourceEmployeeId === record.agent_id);
      return {
        id: record.schedule_id,
        title: record.task_description || '未命名任务',
        schedule: meta.label,
        next: record.completed ? '已完成' : formatNext(record.next_run_time),
        runs: record.runs?.length ?? 0,
        position: owner?.name ?? (record.agent_id ? '已移除岗位' : '未指定岗位'),
        enabled: record.enabled,
        once: meta.once,
        mark: meta.mark,
        cronExpression: record.cron_expression,
        startAt: record.start_at,
        agentId: record.agent_id,
        durationMin: record.duration_min,
        completed: record.completed,
      };
    }));
  };

  const refreshKnowledge = async () => {
    const packs = await getKnowledgePacks();
    const statusLabel: Record<string, string> = { ready: '已就绪', pending: '待索引', indexing: '索引中', failed: '失败' };
    setKnowledge(packs.map(pack => ({
      id: pack.pack_id,
      title: pack.name,
      description: pack.description ?? '',
      desc: `${pack.sources?.length ?? 0} 份资料 · ${pack.stats?.chunks ?? 0} 个检索片段`,
      tags: ['知识包', statusLabel[pack.status] ?? pack.status, '对话自动引用'],
      mark: '知',
      color: pack.status === 'failed' ? 'rgba(255,91,53,.1)' : 'rgba(18,181,165,.12)',
      sources: pack.sources,
    })));
  };

  const runKnowledgeMutation = async (key: string, title: string, operation: () => Promise<void>) => {
    if (knowledgeMutationsRef.current.has(key)) throw new Error('相同操作正在进行，请勿重复提交');
    knowledgeMutationsRef.current.add(key);
    try {
      await operation();
    } catch (error) {
      reportError(error, title);
      throw error;
    } finally {
      knowledgeMutationsRef.current.delete(key);
    }
  };

  const createKnowledge = async (name: string, description = '') => {
    if (!name.trim()) throw new Error('请输入知识包名称');
    if (!liveRef.current) throw new Error('离线状态无法创建真实知识包');
    await runKnowledgeMutation('pack:create', '知识包创建失败', async () => {
      await createKnowledgePack(name.trim(), description.trim());
      await refreshKnowledge();
      toast('知识包已创建');
    });
  };

  const renameKnowledge = async (id: string, name: string, description: string) => {
    if (!name.trim()) throw new Error('请输入知识包名称');
    if (!liveRef.current) throw new Error('离线状态无法修改真实知识包');
    await runKnowledgeMutation(`pack:${id}`, '知识包修改失败', async () => {
      await updateKnowledgePackApi(id, { name: name.trim(), description: description.trim() });
      await refreshKnowledge();
      toast('知识包信息已保存');
    });
  };

  const removeKnowledge = async (id: string) => {
    if (!liveRef.current) throw new Error('离线状态无法删除真实知识包');
    await runKnowledgeMutation(`pack:${id}`, '知识包删除失败', async () => {
      await deleteKnowledgePackApi(id);
      await refreshKnowledge();
      toast('知识包已删除');
    });
  };

  const removeKnowledgeSource = async (packId: string, sourceId: string) => {
    if (!liveRef.current) throw new Error('离线状态无法删除知识来源');
    await runKnowledgeMutation(`source:${packId}:${sourceId}`, '知识来源删除失败', async () => {
      await deleteKnowledgeSource(packId, sourceId);
      await refreshKnowledge();
      toast('知识来源已删除');
    });
  };

  const uploadKnowledge = async (files: File[], packId?: string) => {
    if (!liveRef.current) throw new Error('离线状态无法上传真实知识资料');
    let targetId = packId || knowledge[0]?.id;
    const results: KnowledgeSourceDto[] = [];
    try {
      if (!targetId) targetId = (await createKnowledgePack('公司知识库', '公司上传资料，对话时自动检索引用')).pack_id;
      for (const file of files) results.push(await uploadKnowledgeFile(targetId, file));
      return results;
    } finally {
      // 即使后续文件失败，也重新读取已成功上传文件的真实索引状态。
      await refreshKnowledge().catch(() => undefined);
    }
  };

  const searchKnowledge = async (packId: string, query: string) => {
    const result = await queryKnowledgePack(packId, query);
    return { hits: result.data.hits, ragBackend: result.meta?.rag_backend ?? '后端未返回' };
  };

  const refreshDashboard = async () => {
    const companyId = companyIdRef.current;
    if (!companyId || dashboardLoading) return;
    setDashboardLoading(true);
    try {
      const [overview, series, breakdown] = await Promise.all([getDashboardOverview(), getDashboardSeries(), getDashboardBreakdown()]);
      const number = new Intl.NumberFormat('zh-CN');
      const cost = (value: number) => `¥${value.toFixed(value > 0 && value < 0.01 ? 6 : 4)}`;
      const trend = (value: number | null) => value === null ? '暂无环比基线' : `${value >= 0 ? '+' : ''}${value}% 环比前 30 天`;
      setDashboard({
        kpis: [
          { label: '总 Token', value: number.format(overview.usage.total_tokens), trend: trend(overview.usage.deltas.total_tokens), dir: 'up' },
          { label: '输入 Token', value: number.format(overview.usage.input_tokens), trend: `缓存命中 ${number.format(overview.usage.cached_input_tokens)}`, dir: 'up' },
          { label: '输出 Token', value: number.format(overview.usage.output_tokens), trend: '模型接口实际返回', dir: 'up' },
          { label: '刊例成本估算', value: cost(overview.usage.cost_est_cny), trend: trend(overview.usage.deltas.cost_est_cny), dir: 'down' },
          { label: '模型调用次数', value: number.format(overview.usage.calls), trend: trend(overview.usage.deltas.calls), dir: 'up' },
        ],
        series: series.series.map(point => {
          const date = new Date(point.day);
          return { day: point.day, label: `${date.getMonth() + 1}/${date.getDate()}`, calls: point.calls,
            inputTokens: point.input_tokens, outputTokens: point.output_tokens, tokens: point.tokens, costCny: point.cost_est_cny };
        }),
        breakdown: breakdown.items.map(item => ({ key: item.key || '未标注模型', calls: item.calls,
          inputTokens: item.input_tokens, cachedInputTokens: item.cached_input_tokens, outputTokens: item.output_tokens,
          tokens: item.total_tokens, costCny: item.cost_est_cny })),
        pricing: { source: overview.pricing.source, inputPerMillion: overview.pricing.input_per_million,
          cachedInputPerMillion: overview.pricing.cached_input_per_million, outputPerMillion: overview.pricing.output_per_million },
        loaded: true,
      });
    } finally {
      setDashboardLoading(false);
    }
  };

  type ChatStreamAction = { type: 'edit'; id: string } | { type: 'redo'; id: string } | undefined;
  const runChatStream = (text: string, files: File[] = [], action?: ChatStreamAction) => {
    const value = text.trim() || (files.length ? '请分析我发送的附件' : '');
    if (!value && action?.type !== 'redo') return;
    const conversationId = activeConversationRef.current;
    // ref 同步拦截同一对话的重复提交，state 只负责驱动各对话的 UI 状态。
    if (!conversationId || runningConversationsRef.current.has(conversationId)) return;
    const conversation = conversations.find(item => item.id === conversationId);
    if (!conversation) return toast('请先新建一个对话');
    if (conversation.projectId) {
      toast('历史项目对话为只读记录，请新建对话继续交流');
      return;
    }
    if (!liveRef.current) {
      toast('后端未连接，操作未完成');
      return;
    }
    if (!action) {
      setConversations(prev => prev.map(item => item.id === conversationId
        ? { ...item, title: item.title === '新对话' || item.title === '新群聊' ? value.slice(0, 40) : item.title, updatedAt: new Date().toISOString() }
        : item));
      const optimisticAttachments: ChatAttachment[] = files.map(file => ({
        kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'text',
        name: file.name, mime: file.type || 'text/plain', size: file.size,
        data_url: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
      }));
      pushMsg('boss', value, undefined, optimisticAttachments);
    }
    setConversationTyping(conversationId, true);
    // 每次请求持有独立的 workflow 映射，切对话不会清除其他流的关联信息。
    const workflowIds = new Set<string>();
    const workflowRunIds = new Map<string, string>();
    void (async () => {
      try {
        const handleStreamEvent = (event: OpcChatStreamEvent) => {
          if (activeConversationRef.current !== conversationId) return;
          if (event.type === 'conversation-restored') {
            applyConversationDetail({ messages: event.messages }, conversation.kind ?? 'single');
            return;
          }
          if (event.type === 'checkpoint') {
            const checkpointMessage = fromServerMessage(event.message);
            setMessages(prev => prev.some(message => message.id === checkpointMessage.id) ? prev : [...prev, checkpointMessage]);
            return;
          }
          if (event.type === 'approval') {
            const approval = event.approval;
            // 新审批一出现就刷新侧边栏「人工审批」，不必等用户手动刷新。
            void refreshChatApprovals().catch(() => undefined);
            setMessages(prev => {
              const id = `approval-${approval.id}`;
              const index = prev.findIndex(message => message.id === id);
              const next: Msg = { id, from: 'system', senderName: '总经理', text: approval.task_title, time: formatTime(approval.created_at), approval, runId: approval.run_id };
              return index < 0 ? [...prev, next] : prev.map((message, itemIndex) => itemIndex === index ? next : message);
            });
            return;
          }
          if (event.type === 'shop-change') {
            const change = event.change;
            setMessages(prev => {
              const id = `shop-change-${change.id}`;
              const index = prev.findIndex(message => message.id === id);
              const next: Msg = {
                id, from: 'system', senderName: '总经理', text: change.summary,
                time: formatTime(new Date(change.created_at ?? Date.now()).toISOString()),
                shopChange: change,
              };
              return index < 0 ? [...prev, next] : prev.map((message, itemIndex) => itemIndex === index ? next : message);
            });
            void refreshShopChanges().catch(() => undefined);
            return;
          }
          if (event.type === 'done') {
            const nodes = event.plan?.dag?.nodes;
            if (nodes?.length) setChatWorkflow(prev => ({ runs: prev.runs.map((run, index) => index === prev.runs.length - 1 ? { ...run, dag: nodes, strategy: event.plan?.strategy ?? run.strategy, source: event.plan?.source ?? run.source } : run) }));
            return;
          }
          if (event.type === 'activity') {
            const activity = event.activity;
            setMessages(prev => {
              const id = `activity-${activity.id}`;
              const next: Msg = {
                id, from: 'system', senderName: activity.actor, text: activity.detail || activity.title,
                time: formatTime(activity.created_at), activity,
              };
              const index = prev.findIndex(message => message.id === id);
              return index < 0 ? [...prev, next] : prev.map((message, itemIndex) => itemIndex === index ? next : message);
            });
            setChatWorkflow(prev => {
              const runs = prev.runs.some(run => run.id === activity.run_id) ? prev.runs : [...prev.runs, {
                id: activity.run_id, goal: value, plan: '', createdAt: Date.now(), items: [], activities: [],
              }];
              return { runs: runs.map(run => run.id !== activity.run_id ? run : {
                ...run,
                activities: run.activities.some(item => item.id === activity.id)
                  ? run.activities.map(item => item.id === activity.id ? activity : item)
                  : [...run.activities, activity],
              }) };
            });
            return;
          }
          if (event.type === 'message-start') {
            if (event.workflow) {
              const runId = event.run_id ?? `live-${event.client_id}`;
              workflowIds.add(event.client_id);
              workflowRunIds.set(event.client_id, runId);
              setChatWorkflow(prev => {
                const runs = prev.runs.some(run => run.id === runId) ? prev.runs : [...prev.runs, {
                  id: runId, goal: value, plan: '', createdAt: Date.now(), items: [], activities: [],
                }];
                return {
                  runs: runs.map(run => run.id !== runId || event.sender_kind !== 'agent' ? run : {
                    ...run,
                    items: [...run.items, {
                      id: event.client_id, agentId: event.agent_id, name: event.sender_name,
                      taskTitle: event.task_title || '岗位工单', content: '', thinking: '',
                      status: 'running', startedAt: Date.now(),
                    }],
                  }),
                };
              });
            }
            if (event.channel !== 'workflow') {
              setMessages(prev => [...prev, {
                id: `stream-${event.client_id}`, from: event.sender_kind, senderName: event.sender_name,
                text: '', thinking: '', thinkingDone: false, streaming: true, time: nowHM(),
              }]);
            }
            return;
          }
          if (event.type === 'thinking-delta' || event.type === 'content-delta') {
            const runId = workflowRunIds.get(event.client_id);
            if (runId) {
              setChatWorkflow(prev => ({
                runs: prev.runs.map(run => run.id !== runId ? run : {
                  ...run,
                  plan: run.items.some(item => item.id === event.client_id) || event.type !== 'content-delta'
                    ? run.plan : run.plan + event.text,
                  items: run.items.map(item => item.id !== event.client_id ? item : {
                    ...item,
                    thinking: event.type === 'thinking-delta' ? item.thinking + event.text : item.thinking,
                    content: event.type === 'content-delta' ? item.content + event.text : item.content,
                  }),
                }),
              }));
            }
            setMessages(prev => prev.map(message => message.id === `stream-${event.client_id}` ? {
              ...message,
              thinking: event.type === 'thinking-delta' ? `${message.thinking ?? ''}${event.text}` : message.thinking,
              thinkingDone: event.type === 'content-delta' ? true : message.thinkingDone,
              text: event.type === 'content-delta' ? `${message.text}${event.text}` : message.text,
            } : message));
            return;
          }
          if (event.type === 'message-end') {
            const runId = event.message.run_id ?? workflowRunIds.get(event.client_id);
            const metadata = metadataFromMessage(event.message);
            if (runId && workflowIds.has(event.client_id)) {
              setChatWorkflow(prev => ({
                runs: prev.runs.map(run => run.id !== runId ? run : {
                  ...run,
                  plan: event.message.sender_kind === 'ceo' ? event.message.content : run.plan,
                  strategy: metadata.strategy ?? run.strategy,
                  source: metadata.source ?? run.source,
                  dag: metadata.dag?.nodes ?? run.dag,
                  items: run.items.map(item => item.id !== event.client_id ? item : {
                    ...item,
                    content: event.message.content,
                    thinking: event.message.thinking || item.thinking,
                    status: event.message.status ?? 'done',
                    durationMs: event.message.duration_ms ?? undefined,
                  }),
                }),
              }));
            }
            setMessages(prev => {
              let found = false;
              const next = prev.map(message => {
                if (message.id !== `stream-${event.client_id}` && !(metadata.approval && message.id === `approval-${metadata.approval.id}`)) return message;
                found = true;
                return { ...fromServerMessage(event.message), id: metadata.approval ? `approval-${metadata.approval.id}` : message.id, thinking: message.thinking || event.message.thinking, thinkingDone: true, streaming: false };
              });
              if (!found && metadata.approval) next.push({ ...fromServerMessage(event.message), id: `approval-${metadata.approval.id}` });
              return next;
            });
          }
        };
        if (action?.type === 'edit') {
          await editOpcChatMessageStream(conversationId, action.id, value, handleStreamEvent);
        } else if (action?.type === 'redo') {
          await redoOpcChatCheckpointStream(conversationId, action.id, handleStreamEvent);
        } else {
          await sendOpcChatStream(conversationId, {
            content: value, provider: 'mimo', model: selectedModelRef.current, custom: false, base_url: MIMO_BASE_URL,
          }, handleStreamEvent, files);
        }
      } catch (error) {
        reportError(error, action?.type === 'redo' ? 'Checkpoint 重做失败' : action?.type === 'edit' ? '编辑并重新生成失败' : '模型回复失败');
        if (activeConversationRef.current === conversationId) {
          setMessages(prev => prev.filter(message => !message.streaming));
          pushMsg('system', '本轮没有生成成功回复，请检查模型配置或稍后重试。');
        }
      } finally {
        // 无论当前前台是哪条对话，都必须清理本次请求自己的运行状态。
        setConversationTyping(conversationId, false);
        // 本轮真实 Token 已落库，顺带刷新积分进度（顶栏百分比 / AI 成本面板）。
        void refreshBilling();
      }
    })();
  };

  const sendChat = (text: string, files: File[] = []) => runChatStream(text, files);
  const editChatMessage = (messageId: string, text: string) => {
    const bossMessages = messages.filter(message => message.from === 'boss' && message.channel !== 'workflow' && message.id && !message.streaming);
    const latest = bossMessages[bossMessages.length - 1];
    if (!text.trim()) return toast('编辑内容不能为空');
    if (latest?.id !== messageId) return toast('只能编辑最近一条自己的发言');
    runChatStream(text, [], { type: 'edit', id: messageId });
  };
  const redoCheckpoint = (checkpointId: string) => runChatStream('', [], { type: 'redo', id: checkpointId });

  const decideChatApproval = async (approvalId: string, decision: 'approve' | 'reject' | 'custom', customText = '', outcome?: 'continue' | 'reject', conversationId?: string) => {
    // 侧边栏审批可能属于非当前对话，必须显式带对话 id 才能让后端定位归属。
    const targetConversation = conversationId ?? activeConversationRef.current;
    if (!targetConversation) return;
    try {
      const result = await decideOpcChatApprovalApi(targetConversation, approvalId, { decision, custom_text: customText, outcome });
      setMessages(prev => prev.map(message =>
        message.id === `approval-${approvalId}` || message.approval?.id === approvalId
          ? { ...message, approval: result.approval }
          : message));
      setChatApprovals(prev => prev.map(item => item.id === approvalId ? { ...item, ...result.approval } : item));
      toast(decision === 'reject' || outcome === 'reject' ? '已记录驳回，此任务分支停止' : '已记录你的选择，工作流继续执行');
    } catch (error) {
      reportError(error, '审批提交失败');
      throw error;
    } finally {
      void refreshChatApprovals().catch(() => undefined);
    }
  };

  const retryError = (id: string) => {
    if (!errors.some(item => item.id === id)) return;
    setErrors(prev => prev.map(item => item.id === id ? { ...item, resolved: true } : item));
  };

  const runTaskMutation = async (key: string, title: string, operation: () => Promise<void>) => {
    if (taskMutationsRef.current.has(key)) throw new Error('相同操作正在进行，请勿重复提交');
    taskMutationsRef.current.add(key);
    try {
      await operation();
    } catch (error) {
      reportError(error, title);
      throw error;
    } finally {
      taskMutationsRef.current.delete(key);
    }
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error('任务不存在或已删除');
    if (!liveRef.current) throw new Error('离线状态无法修改真实任务');
    await runTaskMutation(`toggle:${id}`, '定时任务状态更新失败', async () => {
      await patchSchedule(id, { enabled: !task.enabled });
      await refreshTasks();
      toast(task.enabled ? '已暂停定时任务' : '已启用定时任务');
    });
  };

  const saveTask = async (id: string, patch: SchedulePatch) => {
    if (!liveRef.current) throw new Error('离线状态无法修改真实任务');
    await runTaskMutation(`save:${id}`, '定时任务保存失败', async () => {
      await patchSchedule(id, patch);
      await refreshTasks();
      toast('定时任务已保存');
    });
  };

  const runTask = async (id: string) => {
    if (!liveRef.current) throw new Error('离线状态无法执行真实任务');
    let result: ScheduleRunDto | undefined;
    await runTaskMutation(`run:${id}`, '立即执行失败', async () => {
      result = await runSchedule(id);
      await refreshTasks();
      if (result.conversation_id) {
        const latest = (await getOpcConversations()).map(fromServerConversation);
        setConversations(previous => {
          const existing = new Map(previous.map(item => [item.id, item]));
          for (const item of latest) existing.set(item.id, item);
          return [...existing.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        });
      }
      if (result.status === 'succeeded') toast('任务已真实执行并完成');
      else toast(`任务执行状态：${result.status}${result.error ? `，${result.error}` : ''}`);
    });
    if (!result) throw new Error('执行接口未返回运行记录');
    return result;
  };

  const getTaskRuns = async (id: string) => getScheduleRuns(id);

  const deleteTask = async (id: string) => {
    if (!liveRef.current) throw new Error('后端未连接，无法删除定时任务');
    await runTaskMutation(`delete:${id}`, '定时任务删除失败', async () => {
      await deleteSchedule(id);
      setModal(null);
      await refreshTasks();
      toast('定时任务已删除');
    });
  };

  const createTask = async (input: NewTaskInput) => {
    if (!input.title.trim()) throw new Error('请填写任务名称');
    if (!liveRef.current) throw new Error('后端未连接，无法创建定时任务');
    const companyId = companyIdRef.current;
    if (!companyId) throw new Error('后端未连接，无法创建定时任务');
    const [hour, minute] = input.time.split(':');
    // 定时任务统一由总经理调度（不再指定单个岗位）。
    const payload: Record<string, unknown> = {
      group_id: companyId,
      task_description: input.title.trim(),
      duration_min: 30,
    };
    if (input.freq === '一次性') {
      if (!input.runDate) throw new Error('一次性任务需要选择执行日期');
      const start = new Date(`${input.runDate}T${input.time}:00`);
      if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) throw new Error('一次性任务的执行时间必须晚于当前时间');
      payload.start_at = start.toISOString();
    } else if (input.freq === '每周') {
      payload.cron_expression = `${Number(minute)} ${Number(hour)} * * ${Number(input.weekDay ?? '1')}`;
    } else if (input.freq === '每月') {
      payload.cron_expression = `${Number(minute)} ${Number(hour)} ${Number(input.monthDay ?? '1')} * *`;
    } else {
      payload.cron_expression = `${Number(minute)} ${Number(hour)} * * *`;
    }
    await runTaskMutation('create', '定时任务创建失败', async () => {
      await createSchedule(payload);
      setModal(null);
      setView('tasks');
      await refreshTasks();
      toast('定时任务已创建');
    });
  };

  const selectPosition = (id: string) => { setSelectedPosId(id); setSelectedStaffId(null); };
  const selectStaff = (id: string) => { setSelectedStaffId(id); setSelectedPosId(null); };
  const managerEmployeeId = (managerId: string | null | undefined) => {
    if (!managerId || managerId === ROOT_POSITION.id) return null;
    const manager = org.positions.find(position => position.id === managerId);
    if (!manager?.sourceEmployeeId) throw new Error('请选择有效的汇报对象');
    return manager.sourceEmployeeId;
  };
  const savePosition = async (id: string, patch: Partial<Position>) => {
    const position = org.positions.find(item => item.id === id);
    if (!position || position.root) return toast('总经理说明书为只读');
    if (patch.name !== undefined && !patch.name.trim()) return toast('请填写岗位名称');
    if (!liveRef.current) throw new Error('后端未连接，无法保存岗位');
    const companyId = companyIdRef.current;
    if (!companyId || !position.sourceEmployeeId) return toast('岗位尚未关联真实员工，无法保存');
    await runOrgMutation(`position:${id}`, '岗位保存失败', async () => {
      const payload: EmployeePatch = {};
      if (patch.name !== undefined) payload.title = patch.name.trim();
      if (patch.deptId !== undefined) payload.department_id = patch.deptId;
      if (patch.managerId !== undefined) payload.manager_id = managerEmployeeId(patch.managerId);
      if (patch.soul !== undefined) payload.system_prompt = patch.soul;
      if (patch.avatar !== undefined) payload.avatar = patch.avatar;
      if (patch.enabled !== undefined) payload.status = patch.enabled ? 'idle' : 'offline';
      const result = await updateEmployee(companyId, position.sourceEmployeeId!, payload);
      await refreshOrg();
      setSelectedPosId(positionIdFor(result.employee));
      toast('岗位已保存');
    });
  };
  const saveStaff = async (id: string, patch: Partial<Staff>) => {
    if (patch.name !== undefined && !patch.name.trim()) return toast('请填写姓名');
    if (!liveRef.current) throw new Error('后端未连接，无法保存员工档案');
    const companyId = companyIdRef.current;
    const target = patch.positionId ? org.positions.find(position => position.id === patch.positionId) : undefined;
    if (!companyId || (patch.positionId && (!target?.deptId || target.root))) return toast('请选择有效岗位');
    await runOrgMutation(`staff:${id}`, '员工保存失败', async () => {
      const payload: EmployeePatch = {};
      if (patch.name !== undefined) payload.name = patch.name.trim();
      if (patch.managerId !== undefined) payload.manager_id = managerEmployeeId(patch.managerId);
      if (patch.skills !== undefined) payload.skills = patch.skills;
      if (patch.tools !== undefined) payload.tools = patch.tools;
      if (target) {
        payload.department_id = target.deptId;
        payload.title = target.name;
        payload.system_prompt = target.soul;
        payload.avatar = target.avatar;
      }
      // 员工自己选的头像优先于岗位默认头像。
      if (patch.avatar) payload.avatar = patch.avatar;
      await updateEmployee(companyId, id, payload);
      await refreshOrg();
      toast('员工档案已保存');
    });
  };
  const renameDept = async (id: string, name: string) => {
    if (!name.trim()) return toast('请填写部门名称');
    if (!liveRef.current) throw new Error('后端未连接，无法重命名部门');
    const companyId = companyIdRef.current;
    if (!companyId) return;
    await runOrgMutation(`department:${id}`, '部门重命名失败', async () => {
      await updateDepartment(companyId, id, { name: name.trim() });
      await refreshOrg();
      setModal(null);
      toast('部门已重命名');
    });
  };
  const deleteDept = async (id: string) => {
    const positionIds = org.positions.filter(position => position.deptId === id).map(position => position.id);
    const employees = org.staff.filter(staff => positionIds.includes(staff.positionId));
    if (!liveRef.current) throw new Error('后端未连接，无法删除部门');
    const companyId = companyIdRef.current;
    if (!companyId) return;
    await runOrgMutation(`department:${id}`, '部门删除失败', async () => {
      try {
        for (const employee of employees) await fireEmployee(companyId, employee.id);
        await deleteDepartmentApi(companyId, id);
      } catch (error) {
        await refreshOrg().catch(() => undefined);
        throw error;
      }
      await refreshOrg();
      setSelectedPosId(null);
      setSelectedStaffId(null);
      setModal(null);
      toast('部门及其岗位员工已删除');
    });
  };
  const createPosition = async (input: NewPositionInput) => {
    const name = input.name.trim();
    if (!name) return toast('请填写岗位名称');
    if (!input.deptId) return toast('请选择所属部门');
    if (!liveRef.current) throw new Error('后端未连接，无法创建岗位');
    const companyId = companyIdRef.current;
    if (!companyId) return;
    await runOrgMutation('position:create', '岗位创建失败', async () => {
      const result = await hireEmployee(companyId, {
        name: `${name}·待入职`,
        role: `custom_${Date.now()}`,
        department_id: input.deptId,
        manager_id: managerEmployeeId(input.managerId),
        title: name,
        system_prompt: input.soul.trim() || '（待补充岗位职责）',
        avatar: name.slice(0, 1),
        model_name: models.some(m => m.id === selectedModel) ? selectedModel : 'deepseek-chat',
        day_rate_cents: 1000,
      });
      await refreshOrg();
      setSelectedPosId(positionIdFor(result.employee));
      setSelectedStaffId(null);
      setModal(null);
      toast('真实岗位已创建，并生成待入职岗位员工');
    });
  };
  const deletePosition = async (id: string) => {
    const employees = org.staff.filter(staff => staff.positionId === id);
    if (!liveRef.current) throw new Error('后端未连接，无法删除岗位');
    const companyId = companyIdRef.current;
    if (!companyId) return;
    await runOrgMutation(`position:${id}`, '岗位删除失败', async () => {
      try {
        for (const employee of employees) await fireEmployee(companyId, employee.id);
      } catch (error) {
        await refreshOrg().catch(() => undefined);
        throw error;
      }
      await refreshOrg();
      setSelectedPosId(null);
      setModal(null);
      toast('岗位及其岗位员工已删除');
    });
  };

  const createDept = async (name: string, charter = '') => {
    if (!name.trim()) return toast('请填写部门名称');
    if (!liveRef.current) throw new Error('后端未连接，无法创建部门');
    const companyId = companyIdRef.current;
    if (!companyId) return;
    await runOrgMutation('department:create', '部门创建失败', async () => {
      await createDepartment(companyId, name.trim(), charter.trim());
      await refreshOrg();
      setModal(null);
      toast('部门已创建');
    });
  };

  const createStaff = async ({ name, positionId, managerId, avatar }: NewStaffInput) => {
    if (!name.trim()) return toast('请填写姓名');
    if (!liveRef.current) throw new Error('后端未连接，无法添加员工');
    const companyId = companyIdRef.current;
    const position = org.positions.find(p => p.id === positionId);
    if (!companyId || !position?.deptId || !position.sourceRole) return toast('请选择有效岗位');
    await runOrgMutation('staff:create', '员工入职失败', async () => {
      await hireEmployee(companyId, {
        name: name.trim(),
        role: position.sourceRole!,
        department_id: position.deptId,
        manager_id: managerEmployeeId(managerId),
        title: position.name,
        system_prompt: position.soul,
        avatar: avatar || avatarIdFor(name.trim()),
        model_name: models.some(m => m.id === selectedModel) ? selectedModel : 'deepseek-chat',
        day_rate_cents: 1000,
      });
      await refreshOrg();
      setModal(null);
      toast('员工已入职');
    });
  };

  const deleteStaff = async (id: string, reassignTo?: string) => {
    if (reassignTo === id) return toast('接手人不能是被移除员工');
    if (!liveRef.current) throw new Error('后端未连接，无法移除员工');
    const companyId = companyIdRef.current;
    if (!companyId) return;
    await runOrgMutation(`staff:${id}`, '员工移除失败', async () => {
      await fireEmployee(companyId, id, reassignTo || undefined);
      await refreshOrg();
      setModal(null);
      setSelectedStaffId(null);
      toast('员工已移除');
    });
  };

  const refreshBilling = async () => {
    if (!companyIdRef.current || !liveRef.current) return;
    setBillingLoading(true);
    try {
      setBilling(await getOpcBilling());
    } catch {
      // 积分统计失败不影响主链路，下一次进入相关页面会重试。
    } finally {
      setBillingLoading(false);
    }
  };

  const upgradePlan = async (plan: 'basic' | 'studio') => {
    const next = await upgradeOpcPlan(plan);
    setBilling(next);
    toast(plan === 'studio'
      ? `已升级到${next.plan_label}，积分已重置为 ${next.credits_total}`
      : `已切换到${next.plan_label}`);
  };

  const selectModel = (id: string) => {
    // 只允许切换到已经接入的模型（目前只有 MiMo）；以后新增模型时这里无需改动。
    const next = models.find(item => item.id === id && item.vendor === 'MiMo');
    if (!next) return;
    selectedModelRef.current = next.id;
    setSelectedModel(next.id);
    try { localStorage.setItem('sf_selected_model', next.id); } catch { /* 忽略存储异常 */ }
    setApiSettings(loadApiSettings());
  };

  const saveModelSettings = (input: ApiSettingsInput) => {
    const next = saveApiSettings(input);
    setSelectedModel(next.model);
    setApiSettings(next);
  };

  const clearModelKey = (target: { mode: ApiConfigMode; provider: ByokProvider }) => {
    setApiSettings(clearApiKey(target));
  };

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!getAuthToken()) {
        setGwStatus('off');
        setAuthStatus('anonymous');
        return;
      }
      try {
        const me = await getOpcMe();
        await seedOpc();
        const companies = await getCompanies();
        const owned = companies.find(item => item.id === me.company.id);
        if (!owned) throw new Error('当前账号没有可用公司');
        companyIdRef.current = owned.id;
        setAuthUser(me.user);
        setCurrentCompany(owned);
        const modelItems = await getModels();
        if (cancelled) return;
        setModels(modelItems);
        const stored = (() => { try { return localStorage.getItem('sf_selected_model') ?? ''; } catch { return ''; } })();
        const usable = modelItems.filter(item => item.vendor === 'MiMo');
        const initialModel = usable.some(item => item.id === stored) ? stored : MIMO_MODEL;
        selectedModelRef.current = initialModel;
        setSelectedModel(initialModel);
        try { localStorage.setItem('sf_selected_model', initialModel); } catch { /* 忽略存储异常 */ }
        setApiSettings(loadApiSettings());
        liveRef.current = true;
        setGwStatus('ok');
        await restoreCompanyChat(owned);
        setErrors([]);
        await Promise.all([refreshOrg(), refreshTasks(), refreshKnowledge(), refreshChatApprovals(), refreshShopChanges()]);
        await refreshBilling();
        if (!cancelled) setPlans(await getOpcPlans().catch(() => []));
        if (!cancelled) setAuthStatus('authenticated');
      } catch (error) {
        if (cancelled) return;
        liveRef.current = false;
        companyIdRef.current = null;
        setGwStatus('off');
        setAuthUser(null);
        setCurrentCompany(null);
        setConversations([]);
        setActiveConversationId('');
        setMessages([]);
        setShopProducts([]);
        setShopOrders([]);
        setShopFinance(null);
        setShopSales(null);
        setShopChanges([]);
        setTasks([]);
        setKnowledge([]);
        setDashboard(EMPTY_DASHBOARD);
        if (error instanceof ApiError && error.status === 401) {
          setAuthToken('');
          setAuthError('');
        } else {
          setAuthError(`后端连接失败：${error instanceof Error ? error.message : String(error)}`);
        }
        setAuthStatus('anonymous');
      }
    };
    void boot();
    return () => { cancelled = true; };
    // 启动只执行一次；后续按视图刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gwStatus !== 'ok') return;
    const load = async () => {
      try {
        if (view === 'org') await refreshOrg();
        if (view === 'workbench') await Promise.all([refreshConversations(), refreshShopChanges()]);
        if (view === 'orders') await Promise.all([refreshShopProducts(), refreshShopOrders(), refreshShopChanges()]);
        if (view === 'approvals') await Promise.all([refreshChatApprovals(), refreshShopChanges()]);
        if (view === 'tasks') await refreshTasks();
        if (view === 'knowledge') await refreshKnowledge();
        if (view === 'dashboard') {
          await (dashboardSection === 'finance' ? refreshShopFinance()
            : dashboardSection === 'sales' ? refreshShopSales()
              : refreshDashboard());
        }
        if (view === 'deliverables') await refreshConversationDeliverables();
        if (view === 'dashboard' || view === 'settings') await refreshBilling();
      } catch (error) {
        reportError(error, `${VIEW_TITLES[view]}数据加载失败`);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gwStatus, dashboardSection]);

  // 停留在工作台时每 20 秒静默对齐会话列表：定时任务可能在后台刚跑完。
  useEffect(() => {
    if (gwStatus !== 'ok' || view !== 'workbench') return;
    const timer = setInterval(() => { void refreshConversations(); }, 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gwStatus]);

  return {
    view, setView,
    authStatus, authPanel, setAuthPanel, authUser, currentCompany, authError, authenticate, guestLogin, logout,
    conversations, activeConversationId, newConversation, selectConversation, openConversation, switchConversationKind, deleteConversation, refreshConversations,
    messages, typing, isConversationTyping, sendChat, editChatMessage, redoCheckpoint, decideChatApproval, chatWorkflow, errors, retryError,
    tasks, toggleTask, saveTask, runTask, getTaskRuns, deleteTask, createTask,
    knowledge, createKnowledge, renameKnowledge, removeKnowledge, removeKnowledgeSource, uploadKnowledge, searchKnowledge,
    kbFilter, setKbFilter,
    org, companyId: companyIdRef.current, refreshOrg, selectedPosId, selectedStaffId, selectPosition, selectStaff, savePosition, saveStaff,
    createDept, renameDept, deleteDept, createPosition, deletePosition, createStaff, deleteStaff,
    modal, openModal, closeModal, toasts, toast, gwStatus, models, selectedModel, selectModel,
    apiSettings, saveModelSettings, clearModelKey,
    shopProducts, shopProductsLoading, refreshShopProducts,
    shopOrders, shopOrdersLoading, refreshShopOrders,
    shopFinance, shopSales, shopStatsLoading, refreshShopFinance, refreshShopSales,
    shopChanges, shopChangesLoading, refreshShopChanges, decideShopChange,
    dashboardSection, setDashboardSection,
    billing, billingLoading, plans, refreshBilling, upgradePlan,
    dashboard, dashboardLoading, refreshDashboard,
    conversationDeliverables, conversationDeliverablesLoading, refreshConversationDeliverables,
    chatApprovals, chatApprovalsLoading, refreshChatApprovals,
  };
}

export { WorkbenchContext };
