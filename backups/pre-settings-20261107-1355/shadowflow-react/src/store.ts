/* 全局状态：在线时以 Gateway 为事实源，离线时才使用 data.ts 演示数据。 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createDepartment,
  createProject,
  createSchedule,
  decideApproval as decideApprovalApi,
  deleteProject,
  deleteSchedule,
  fireEmployee,
  getApprovals,
  getCompanies,
  getDashboardBreakdown,
  getDashboardBriefing,
  getDashboardOverview,
  getDashboardSeries,
  getKnowledgePacks,
  getModels,
  getOrg,
  getPnl,
  getProject,
  getProjects,
  getRoster,
  getSchedules,
  hireEmployee,
  patchSchedule,
  runProject,
  seedOpc,
  setDefaultProvider,
  type ApprovalDto,
  type ByokProvider,
  type ProjectDetailDto,
  type ProjectDto,
  type RosterEmployeeDto,
  type ScheduleDto,
} from './api';
import { persistChatMessages, restoreChatMessages } from './chat-storage';
import type {
  Activity,
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
import { EMPTY_DASHBOARD } from './types';
import {
  SEED_ACTIVITY_ID,
  seedActivities,
  seedDeliverables,
  seedErrors,
  seedKnowledge,
  seedMessages,
  seedOrg,
  seedTasks,
  uid,
} from './data';

export const VIEW_TITLES: Record<ViewKey, string> = {
  workbench: '工作台',
  approvals: '人工审批',
  org: '组织架构',
  tasks: '定时任务',
  deliverables: '交付成果',
  dashboard: '数据看板',
  knowledge: '知识库',
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
}

export interface NewTaskInput {
  title: string;
  freq: string;
  time: string;
  position: string;
  runDate?: string;
  weekDay?: string;
  monthDay?: string;
}

export interface WorkbenchStore {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  messages: Msg[];
  typing: boolean;
  sendChat: (text: string) => void;
  activities: Activity[];
  deliverables: Deliverable[];
  errors: ErrItem[];
  retryError: (id: string) => void;
  tasks: TaskItem[];
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  createTask: (input: NewTaskInput) => void;
  knowledge: KbItem[];
  dlFilter: string;
  setDlFilter: (f: string) => void;
  kbFilter: string;
  setKbFilter: (f: string) => void;
  org: OrgState;
  selectedPosId: string | null;
  selectedStaffId: string | null;
  selectPosition: (id: string) => void;
  selectStaff: (id: string) => void;
  savePosition: (id: string, patch: Partial<Position>) => void;
  saveStaff: (id: string, patch: Partial<Staff>) => void;
  createDept: (name: string, charter?: string) => void;
  renameDept: (id: string, name: string) => void;
  deleteDept: (id: string) => void;
  createPosition: (input: NewPositionInput) => void;
  deletePosition: (id: string) => void;
  createStaff: (input: NewStaffInput) => void;
  deleteStaff: (id: string) => void;
  modal: ModalState | null;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  toasts: Toast[];
  toast: (msg: string) => void;
  gwStatus: 'connecting' | 'ok' | 'off';
  models: ModelOption[];
  selectedModel: string;
  selectModel: (id: string) => void;
  dashboard: DashboardState;
  dashboardLoading: boolean;
  refreshDashboard: () => Promise<void>;
  loadDeliverable: (id: string) => Promise<void>;
  deleteDeliverable: (id: string) => Promise<void>;
  retryDeliverable: (id: string) => Promise<void>;
  approvals: ApprovalDto[];
  approvalLoading: boolean;
  refreshApprovals: () => Promise<void>;
  decideApproval: (approvalId: string, decision: 'approved' | 'rejected', note?: string) => Promise<void>;
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

const ACTIVE_PROJECT_STATUSES = new Set(['planning', 'ready', 'executing']);
const TERMINAL_PROJECT_STATUSES = new Set(['delivered', 'failed', 'cancelled']);

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

function deliverableType(project: ProjectDto): Deliverable['type'] {
  const text = `${project.name} ${project.goal ?? ''}`;
  if (/脚本|口播/.test(text)) return '脚本';
  if (/素材|海报|视觉|文案/.test(text)) return '素材';
  if (/简报|周报|报告|复盘|数据/.test(text)) return '简报';
  return '方案';
}

function projectDeliverable(project: ProjectDto): Deliverable {
  const type = deliverableType(project);
  return {
    id: project.id,
    sourceId: project.id,
    title: project.name.replace(/^内部需求｜/, ''),
    type,
    client: project.client_name || '内部',
    time: formatTime(project.updated_at ?? project.created_at),
    status: project.status === 'delivered'
      ? '已交付'
      : project.status === 'failed'
        ? '失败'
        : project.status === 'cancelled'
          ? '已取消'
          : '待审核',
    rawStatus: project.status,
    mark: type.slice(0, 1),
    color: type === '简报' ? 'rgba(18,181,165,.12)' : type === '方案' ? 'rgba(123,97,255,.12)' : 'rgba(255,91,53,.1)',
  };
}

function projectActivity(detail: ProjectDetailDto): Activity {
  const { project, tasks, approvals } = detail;
  const done = tasks.filter(t => t.status === 'done').length;
  const review = tasks.find(t => t.status === 'review');
  const running = tasks.find(t => t.status === 'running');
  const failed = tasks.find(t => t.status === 'failed');
  const pending = approvals.find(a => a.status === 'pending');
  const blocked = Boolean(review || pending);
  const status: Activity['status'] = project.status === 'delivered'
    ? 'done'
    : project.status === 'failed' || failed
      ? 'failed'
      : blocked
        ? 'blocked'
        : 'running';
  const owner = running ?? review ?? failed ?? [...tasks].reverse().find(t => t.status === 'done');
  const detailText = failed
    ? `执行失败：${failed.title}`
    : review || pending
      ? `等待人工审批：${(review?.title ?? pending?.title) || '交付验收'}`
      : running
        ? `正在${running.title}`
        : project.status === 'delivered'
          ? '已完成，交付成果可预览'
          : `等待执行 · ${done}/${tasks.length} 步已完成`;
  return {
    id: project.id,
    title: project.name.replace(/^内部需求｜/, ''),
    position: owner?.assignee?.title ?? owner?.assignee?.name ?? '公司协作',
    steps: tasks.length ? tasks.map(t => t.title) : ['等待任务拆解'],
    current: done,
    detail: detailText,
    status,
  };
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

function nextForDemo(input: NewTaskInput): string {
  const [hour, minute] = input.time.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (input.freq === '一次性' && input.runDate) {
    const [y, m, d] = input.runDate.split('-').map(Number);
    date.setFullYear(y, m - 1, d);
  } else {
    if (input.freq === '每周' && input.weekDay) {
      const delta = (Number(input.weekDay) - date.getDay() + 7) % 7;
      date.setDate(date.getDate() + delta);
    }
    if (input.freq === '每月' && input.monthDay) date.setDate(Number(input.monthDay));
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + (input.freq === '每月' ? 30 : input.freq === '每周' ? 7 : 1));
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function useWorkbenchStore(): WorkbenchStore {
  const [view, setView] = useState<ViewKey>('workbench');
  const [messages, setMessages] = useState<Msg[]>(seedMessages);
  const [typing, setTyping] = useState(false);
  const [activities, setActivities] = useState<Activity[]>(seedActivities);
  const [deliverables, setDeliverables] = useState<Deliverable[]>(seedDeliverables);
  const [approvals, setApprovals] = useState<ApprovalDto[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [errors, setErrors] = useState<ErrItem[]>(seedErrors);
  const [tasks, setTasks] = useState<TaskItem[]>(seedTasks);
  const [knowledge, setKnowledge] = useState<KbItem[]>(seedKnowledge);
  const [org, setOrg] = useState<OrgState>(seedOrg);
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [dlFilter, setDlFilter] = useState('全部');
  const [kbFilter, setKbFilter] = useState('全部');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [gwStatus, setGwStatus] = useState<'connecting' | 'ok' | 'off'>('connecting');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('sf_selected_model') ?? 'deepseek-chat');
  const [dashboard, setDashboard] = useState<DashboardState>(EMPTY_DASHBOARD);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const companyIdRef = useRef<string | null>(null);
  const liveRef = useRef(false);
  const activitiesRef = useRef<Activity[]>(activities);
  const chatScopeRef = useRef<string | null>(null);
  const deliverableRequestsRef = useRef(new Set<string>());

  useEffect(() => { activitiesRef.current = activities; }, [activities]);
  useEffect(() => {
    if (chatScopeRef.current) persistChatMessages(chatScopeRef.current, messages);
  }, [messages]);

  const restoreChat = (scope: string, fallback: Msg[]) => {
    chatScopeRef.current = scope;
    setMessages(restoreChatMessages(scope) ?? fallback);
  };

  const toast = (msg: string) => {
    const id = uid('t');
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  };
  const openModal = (m: ModalState) => setModal(m);
  const closeModal = () => setModal(null);
  const pushMsg = (from: Msg['from'], text: string, card?: Msg['card']) => {
    setMessages(prev => [...prev, { from, text, time: nowHM(), card }]);
  };

  const reportError = (error: unknown, title: string) => {
    const apiError = error instanceof ApiError ? error : null;
    const message = error instanceof Error ? error.message : String(error);
    const code = apiError?.code ?? 'NETWORK_ERROR';
    if (apiError?.status === 503 || !apiError) {
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

  const unsupported = (feature: string) => {
    setModal(null);
    toast(`${feature}：后端暂未提供写接口，前端已预留扩展点，本次未修改数据`);
  };

  const refreshOrg = async () => {
    const companyId = companyIdRef.current;
    if (!companyId) return;
    const [chart, roster] = await Promise.all([getOrg(companyId), getRoster(companyId)]);
    const active = roster.filter(e => e.employment !== 'retired' && e.status !== 'offline');
    const byId = new Map(active.map(e => [e.id, e]));
    const positions: Position[] = [ROOT_POSITION];
    const staff: Staff[] = [];
    for (const dept of chart.departments) {
      const head = dept.head ? byId.get(dept.head.id) : undefined;
      for (const employee of active.filter(e => e.department_id === dept.id)) {
        const positionId = positionIdFor(employee);
        if (!positions.some(p => p.id === positionId)) {
          positions.push({
            id: positionId,
            name: employee.title,
            deptId: dept.id,
            managerId: head && head.id !== employee.id ? positionIdFor(head) : ROOT_POSITION.id,
            avatar: employee.avatar ?? employee.name.slice(0, 1),
            enabled: employee.status !== 'offline',
            soul: employee.system_prompt || '（该岗位暂未配置职责提示词）',
            sourceEmployeeId: employee.id,
          });
        }
        staff.push({
          id: employee.id,
          name: employee.name,
          positionId,
          managerId: head && head.id !== employee.id ? positionIdFor(head) : ROOT_POSITION.id,
          avatar: employee.avatar ?? employee.name.slice(0, 1),
        });
      }
    }
    setOrg({ departments: chart.departments.map(d => ({ id: d.id, name: d.name, charter: d.charter })), positions, staff });
  };

  const refreshProjects = async () => {
    const companyId = companyIdRef.current;
    if (!companyId) return;
    const projects = await getProjects(companyId);
    setDeliverables(previous => {
      const loaded = new Map(previous.map(item => [item.id, item]));
      return projects.map(project => {
        const next = projectDeliverable(project);
        const current = loaded.get(next.id);
        // 工作台轮询不能清空终态正文，否则预览会在内容与加载提示之间反复闪烁。
        if (current?.contentLoaded && current.rawStatus === next.rawStatus && TERMINAL_PROJECT_STATUSES.has(next.rawStatus ?? '')) {
          return { ...next, content: current.content, contentLoaded: true, contentMode: current.contentMode };
        }
        return next;
      });
    });
    const active = projects.filter(p => ACTIVE_PROJECT_STATUSES.has(p.status));
    const details = await Promise.all(active.map(async p => {
      try { return await getProject(p.id); } catch { return null; }
    }));
    setActivities(details.filter((d): d is ProjectDetailDto => Boolean(d)).map(projectActivity));
  };

  const refreshApprovals = async () => {
    const companyId = companyIdRef.current;
    if (!companyId || approvalLoading) return;
    setApprovalLoading(true);
    try {
      setApprovals(await getApprovals(companyId, ''));
    } finally {
      setApprovalLoading(false);
    }
  };

  const refreshTasks = async () => {
    const records = await getSchedules();
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
      };
    }));
  };

  const refreshKnowledge = async () => {
    const packs = await getKnowledgePacks();
    const statusLabel: Record<string, string> = { ready: '已就绪', pending: '待索引', indexing: '索引中', failed: '失败' };
    setKnowledge(packs.map(pack => ({
      id: pack.pack_id,
      title: pack.name,
      desc: pack.description || `${pack.sources?.length ?? 0} 个知识来源`,
      tags: ['知识包', statusLabel[pack.status] ?? pack.status],
      mark: '知',
      color: pack.status === 'failed' ? 'rgba(255,91,53,.1)' : 'rgba(18,181,165,.12)',
    })));
  };

  const refreshDashboard = async () => {
    const companyId = companyIdRef.current;
    if (!companyId || dashboardLoading) return;
    setDashboardLoading(true);
    try {
      const [overview, series, breakdown, pnl, briefing] = await Promise.all([
        getDashboardOverview(), getDashboardSeries(), getDashboardBreakdown(), getPnl(companyId), getDashboardBriefing(),
      ]);
      const delta = overview.usage.deltas.calls;
      const breakdownItems = breakdown.items.map(item => ({ key: item.key || '未标注模型', calls: item.calls, tokens: item.total_tokens, cost: item.cost_est_usd }));
      const top = [...breakdownItems].sort((a, b) => b.calls - a.calls)[0];
      setDashboard({
        kpis: [
          { label: '近 30 天模型调用', value: String(overview.usage.calls), trend: delta === null ? '暂无环比基线' : `${delta >= 0 ? '+' : ''}${delta}% 环比前 30 天`, dir: 'up' },
          { label: '近 30 天运行成功率', value: overview.runs.success_rate === null ? '—' : `${overview.runs.success_rate}%`, trend: `${overview.runs.total} 次运行 · ${overview.runs.failed} 次失败`, dir: 'up' },
          { label: '公司累计交付项目', value: String(pnl.projects_delivered), trend: `共 ${pnl.projects_total} 个项目`, dir: 'up' },
          { label: '公司累计运营成本', value: `¥${pnl.cost.toFixed(2)}`, trend: `收入 ¥${pnl.revenue.toFixed(2)} · 利润 ¥${pnl.profit.toFixed(2)}`, dir: 'down' },
        ],
        series: series.series.map(point => {
          const date = new Date(point.day);
          return { day: point.day, label: `${date.getMonth() + 1}/${date.getDate()}`, value: point.calls };
        }),
        breakdown: breakdownItems,
        alerts: briefing.alerts,
        insight: briefing.alerts[0] ?? (top ? `近 30 天调用最多的是 ${top.key}，共 ${top.calls} 次。` : '当前窗口暂无模型调用；完成真实运行后，这里会自动形成趋势。'),
        loaded: true,
      });
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadDeliverable = async (id: string) => {
    const target = deliverables.find(d => d.id === id);
    if (!target?.sourceId || target.contentLoaded || !liveRef.current || deliverableRequestsRef.current.has(id)) return;
    deliverableRequestsRef.current.add(id);
    try {
      const detail = await getProject(target.sourceId);
      const outputs = detail.tasks.map(task => ({
        title: task.title,
        owner: task.assignee?.title ?? task.assignee?.name ?? '未分配岗位',
        text: task.output?.text ?? '',
        mode: task.output?.mode ?? '',
      })).filter(item => item.text);
      const modes = new Set(outputs.map(item => item.mode).filter(Boolean));
      const contentMode: Deliverable['contentMode'] = modes.has('error') && modes.size === 1
        ? 'error'
        : modes.has('simulated') && modes.size === 1
          ? 'simulated'
          : modes.has('simulated') || modes.has('error')
            ? 'mixed'
            : 'live';
      const content = outputs.length
        ? outputs.map((item, index) => `${index + 1}. ${item.title}\n负责人：${item.owner}\n${item.text}`).join('\n\n──────────\n\n')
        : '该项目尚未形成交付正文。';
      setDeliverables(prev => prev.map(d => d.id === id ? { ...d, content, contentLoaded: true, contentMode } : d));
    } catch (error) {
      reportError(error, '交付正文加载失败');
      setDeliverables(prev => prev.map(d => d.id === id ? { ...d, content: '正文加载失败，请关闭后重试。', contentLoaded: true, contentMode: 'error' } : d));
    } finally {
      deliverableRequestsRef.current.delete(id);
    }
  };

  const deleteDeliverable = async (id: string) => {
    const target = deliverables.find(item => item.id === id);
    if (!target) return;
    if (!liveRef.current || !target.sourceId) {
      setDeliverables(prev => prev.filter(item => item.id !== id));
      setModal(null);
      toast('演示项目已删除');
      return;
    }
    try {
      await deleteProject(target.sourceId);
      setModal(null);
      await Promise.all([refreshProjects(), refreshApprovals()]);
      toast('项目及关联任务、审批记录已删除');
    } catch (error) {
      reportError(error, '项目删除失败');
      throw error;
    }
  };

  const retryDeliverable = async (id: string) => {
    const target = deliverables.find(item => item.id === id);
    if (!target?.sourceId || !liveRef.current) {
      toast('离线演示模式不执行真实重试');
      return;
    }
    try {
      const result = await runProject(target.sourceId, true);
      await Promise.all([refreshProjects(), refreshApprovals()]);
      if (result.stopped === 'approval') {
        toast('失败任务已重试，项目已推进到人工审批');
      } else if (result.project.status === 'delivered') {
        toast('失败任务已重试，项目已交付');
      } else if (result.project.status === 'failed') {
        toast('重试后仍有任务失败，请查看项目执行输出');
      } else {
        toast(`重试完成，当前项目状态：${result.project.status}`);
      }
    } catch (error) {
      reportError(error, '失败任务重试失败');
      throw error;
    }
  };

  /* 离线演示逻辑只在线下模式运行。 */
  const startDemoRun = (title: string, steps: string[], positionName: string, deliverable: Deliverable) => {
    const id = uid('act');
    setActivities(prev => [{ id, title, steps, current: 0, detail: steps[0], status: 'running', position: positionName }, ...prev]);
    let cur = 0;
    const timer = setInterval(() => {
      cur += 1;
      if (cur >= steps.length) {
        clearInterval(timer);
        setActivities(prev => prev.map(a => a.id === id ? { ...a, current: cur, status: 'done', detail: '已完成，交付中' } : a));
        setDeliverables(prev => [deliverable, ...prev]);
        pushMsg('ceo', `完成。${title} 已交付，可在「交付成果」中预览。`);
        toast('演示交付完成：' + deliverable.title);
      } else {
        setActivities(prev => prev.map(a => a.id === id ? { ...a, current: cur, detail: '正在' + steps[cur] } : a));
      }
    }, 1500);
  };

  const demoRespond = (text: string) => {
    if (/每天|定时|提醒|每周|早上|schedule/i.test(text)) {
      pushMsg('ceo', '这类周期性工作建议设为定时任务，我已帮你打开新建窗口。');
      setTimeout(() => openModal({ kind: 'new-task' }), 300);
    } else {
      pushMsg('ceo', '收到，老板。这是离线演示应答；连接 Gateway 后会创建真实公司项目。');
      startDemoRun('整理业务需求', ['拆解业务目标', '安排负责岗位', '生成演示交付'], '策略师', {
        id: uid('dl'), title: '演示业务简报', type: '简报', client: '演示', time: '刚刚', status: '已交付', mark: '简', color: 'rgba(18,181,165,.12)',
      });
    }
  };

  const sendChat = (text: string) => {
    const value = text.trim();
    if (!value || typing) return;
    pushMsg('boss', value);
    if (liveRef.current && /每天|定时|提醒|每周|早上|schedule/i.test(value)) {
      pushMsg('ceo', '这类周期性工作应创建定时任务，我已打开新建窗口，请确认执行频率、时间和负责岗位。');
      openModal({ kind: 'new-task' });
      return;
    }
    if (!liveRef.current) {
      setTyping(true);
      setTimeout(() => { setTyping(false); demoRespond(value); }, 500);
      return;
    }
    const companyId = companyIdRef.current;
    if (!companyId) return toast('公司数据尚未就绪，请稍后重试');
    setTyping(true);
    void (async () => {
      let projectId = '';
      try {
        const created = await createProject(companyId, value);
        projectId = created.project.id;
        pushMsg('ceo', `已创建真实项目，拆成 ${created.tasks.length} 个步骤，现在开始推进；进度以公司现场为准。`);
        await refreshProjects();
        const result = await runProject(projectId);
        await Promise.all([refreshProjects(), refreshApprovals()]);
        if (result.stopped === 'approval') {
          pushMsg('ceo', '项目已推进到人工审批节点。请打开左侧「人工审批」验收；批准后会自动继续执行，驳回后会按意见返工。');
        } else if (result.project.status === 'delivered') {
          pushMsg('ceo', '项目已完成，交付成果和正文已同步到「交付成果」。', { kind: 'deliverable', title: result.project.name.replace(/^内部需求｜/, ''), meta: '真实项目 · 已交付' });
        } else {
          pushMsg('ceo', `本轮执行结束，项目状态：${result.project.status}。可继续查看公司现场与交付状态。`);
        }
      } catch (error) {
        reportError(error, '项目派工失败');
        pushMsg('ceo', '这次派工未成功，我不会伪造完成状态。请按右侧错误原因修正后重新提交。');
      } finally {
        setTyping(false);
      }
    })();
  };

  const retryError = (id: string) => {
    const item = errors.find(e => e.id === id);
    if (!item) return;
    if (liveRef.current) {
      toast('请根据处置建议修正后重新执行原操作；通用自动重试接口已预留');
      return;
    }
    setErrors(prev => prev.map(e => e.id === id ? { ...e, resolved: true, action: '演示重试完成' } : e));
  };

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!liveRef.current) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
      return;
    }
    void patchSchedule(id, !task.enabled)
      .then(() => refreshTasks())
      .then(() => toast(task.enabled ? '已暂停定时任务' : '已启用定时任务'))
      .catch(error => reportError(error, '定时任务状态更新失败'));
  };

  const deleteTask = (id: string) => {
    if (!liveRef.current) {
      setTasks(prev => prev.filter(t => t.id !== id));
      setModal(null);
      return;
    }
    void deleteSchedule(id)
      .then(() => { setModal(null); return refreshTasks(); })
      .then(() => toast('定时任务已删除'))
      .catch(error => reportError(error, '定时任务删除失败'));
  };

  const createTask = (input: NewTaskInput) => {
    if (!input.title.trim()) return toast('请填写任务名称');
    if (!liveRef.current) {
      const once = input.freq === '一次性';
      setTasks(prev => [{
        id: uid('tk'), title: input.title.trim(), schedule: once ? `一次性 · ${input.runDate ?? ''} ${input.time}` : `${input.freq} ${input.time}`,
        next: nextForDemo(input), runs: 0, position: org.positions.find(p => p.id === input.position)?.name ?? '未指定岗位', enabled: true, once, mark: once ? '次' : input.freq === '每天' ? '日' : input.freq === '每周' ? '周' : '月',
      }, ...prev]);
      setModal(null);
      setView('tasks');
      return;
    }
    const companyId = companyIdRef.current;
    const owner = org.positions.find(p => p.id === input.position);
    if (!companyId || !owner?.sourceEmployeeId) return toast('请选择有效的负责岗位');
    const [hour, minute] = input.time.split(':');
    const payload: Record<string, unknown> = {
      group_id: companyId,
      agent_id: owner.sourceEmployeeId,
      task_description: input.title.trim(),
      duration_min: 30,
    };
    if (input.freq === '一次性') {
      if (!input.runDate) return toast('一次性任务需要选择执行日期');
      const start = new Date(`${input.runDate}T${input.time}:00`);
      if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) return toast('一次性任务的执行时间必须晚于当前时间');
      payload.start_at = start.toISOString();
    } else if (input.freq === '每周') {
      payload.cron_expression = `${Number(minute)} ${Number(hour)} * * ${Number(input.weekDay ?? '1')}`;
    } else if (input.freq === '每月') {
      payload.cron_expression = `${Number(minute)} ${Number(hour)} ${Number(input.monthDay ?? '1')} * *`;
    } else {
      payload.cron_expression = `${Number(minute)} ${Number(hour)} * * *`;
    }
    void createSchedule(payload)
      .then(() => { setModal(null); setView('tasks'); return refreshTasks(); })
      .then(() => toast('定时任务已创建'))
      .catch(error => reportError(error, '定时任务创建失败'));
  };

  const selectPosition = (id: string) => { setSelectedPosId(id); setSelectedStaffId(null); };
  const selectStaff = (id: string) => { setSelectedStaffId(id); setSelectedPosId(null); };
  const savePosition = (id: string, patch: Partial<Position>) => {
    if (liveRef.current) return unsupported('岗位资料修改');
    setOrg(prev => ({ ...prev, positions: prev.positions.map(p => p.id === id ? { ...p, ...patch, root: p.root } : p) }));
    toast('演示岗位已保存');
  };
  const saveStaff = (id: string, patch: Partial<Staff>) => {
    if (liveRef.current) return unsupported('员工资料修改');
    setOrg(prev => ({ ...prev, staff: prev.staff.map(s => s.id === id ? { ...s, ...patch } : s) }));
    toast('演示员工档案已保存');
  };
  const renameDept = (id: string, name: string) => {
    if (liveRef.current) return unsupported('部门重命名');
    setOrg(prev => ({ ...prev, departments: prev.departments.map(d => d.id === id ? { ...d, name: name.trim() || d.name } : d) }));
    setModal(null);
  };
  const deleteDept = (id: string) => {
    if (liveRef.current) return unsupported('部门删除');
    setOrg(prev => {
      const positionIds = prev.positions.filter(p => p.deptId === id).map(p => p.id);
      return {
        departments: prev.departments.filter(d => d.id !== id),
        positions: prev.positions.filter(p => p.deptId !== id),
        staff: prev.staff.filter(s => !positionIds.includes(s.positionId)),
      };
    });
    setModal(null);
  };
  const createPosition = (input: NewPositionInput) => {
    if (liveRef.current) return unsupported('独立岗位创建');
    setOrg(prev => ({ ...prev, positions: [...prev.positions, {
      id: uid('p'), name: input.name.trim(), deptId: input.deptId, managerId: input.managerId,
      avatar: input.name.trim().slice(0, 1), enabled: true, soul: input.soul.trim() || '（待补充岗位职责）',
    }] }));
    setModal(null);
  };
  const deletePosition = (id: string) => {
    if (liveRef.current) return unsupported('独立岗位删除');
    setOrg(prev => ({
      departments: prev.departments,
      positions: prev.positions.filter(p => p.id !== id),
      staff: prev.staff.filter(s => s.positionId !== id),
    }));
    setModal(null);
  };

  const createDept = (name: string, charter = '') => {
    if (!name.trim()) return toast('请填写部门名称');
    if (!liveRef.current) {
      setOrg(prev => ({ ...prev, departments: [...prev.departments, { id: uid('d'), name: name.trim(), charter }] }));
      setModal(null);
      return;
    }
    const companyId = companyIdRef.current;
    if (!companyId) return;
    void createDepartment(companyId, name.trim(), charter.trim())
      .then(() => { setModal(null); return refreshOrg(); })
      .then(() => toast('部门已创建'))
      .catch(error => reportError(error, '部门创建失败'));
  };

  const createStaff = ({ name, positionId, managerId }: NewStaffInput) => {
    if (!name.trim()) return toast('请填写姓名');
    if (!liveRef.current) {
      setOrg(prev => ({ ...prev, staff: [...prev.staff, { id: uid('s'), name: name.trim(), positionId, managerId, avatar: name.trim().slice(0, 1) }] }));
      setModal(null);
      return;
    }
    const companyId = companyIdRef.current;
    const position = org.positions.find(p => p.id === positionId);
    if (!companyId || !position?.deptId) return toast('请选择有效岗位');
    void hireEmployee(companyId, {
      name: name.trim(),
      role: `custom_${Date.now()}`,
      department_id: position.deptId,
      title: position.name,
      system_prompt: position.soul,
      model_name: models.some(m => m.id === selectedModel) ? selectedModel : 'deepseek-chat',
      day_rate_cents: 1000,
    }).then(() => { setModal(null); return refreshOrg(); })
      .then(() => toast('员工已入职；自定义汇报关系待后端扩展'))
      .catch(error => reportError(error, '员工入职失败'));
  };

  const deleteStaff = (id: string) => {
    if (!liveRef.current) {
      setOrg(prev => ({ ...prev, staff: prev.staff.filter(s => s.id !== id) }));
      setModal(null);
      return;
    }
    const companyId = companyIdRef.current;
    if (!companyId) return;
    void fireEmployee(companyId, id)
      .then(() => { setModal(null); setSelectedStaffId(null); return refreshOrg(); })
      .then(() => toast('员工已移除'))
      .catch(error => reportError(error, '员工移除失败'));
  };

  const selectModel = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem('sf_selected_model', id);
    const vendor = models.find(m => m.id === id)?.vendor.toLowerCase();
    const providerMap: Record<string, ByokProvider> = { anthropic: 'anthropic', openai: 'openai', deepseek: 'deepseek', google: 'google', alibaba: 'qwen' };
    if (vendor && providerMap[vendor]) setDefaultProvider(providerMap[vendor]);
  };

  const decideApproval = async (approvalId: string, decision: 'approved' | 'rejected', note = '') => {
    const approval = approvals.find(item => item.id === approvalId);
    try {
      await decideApprovalApi(approvalId, decision, note);
    } catch (error) {
      reportError(error, '审批提交失败');
      throw error;
    }

    let result: Awaited<ReturnType<typeof runProject>> | null = null;
    if (approval?.project_id) {
      try {
        result = await runProject(approval.project_id);
      } catch (error) {
        await Promise.allSettled([refreshApprovals(), refreshProjects()]);
        reportError(error, '审批已记录，但项目继续执行失败');
        return;
      }
    }
    await Promise.all([refreshApprovals(), refreshProjects()]);
    if (result?.stopped === 'approval') {
      toast(decision === 'approved' ? '已批准，项目已推进到下一审批节点' : '已驳回并完成返工，新成果仍需审批');
    } else if (result?.project.status === 'delivered') {
      toast('审批已完成，项目已交付');
    } else {
      toast(decision === 'approved' ? '已批准，项目已继续执行' : '已驳回，任务已返工');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        await seedOpc();
        const companies = await getCompanies();
        if (!companies[0]) throw new Error('后端尚未创建公司');
        companyIdRef.current = companies[0].id;
        const modelItems = await getModels();
        if (cancelled) return;
        setModels(modelItems);
        if (!modelItems.some(m => m.id === selectedModel) && modelItems[0]) setSelectedModel(modelItems[0].id);
        liveRef.current = true;
        setGwStatus('ok');
        restoreChat(`company:${companies[0].id}`, [{ from: 'ceo', text: `已连接 ${companies[0].name}。现在派工会创建真实项目，未成功的操作不会伪装完成。`, time: nowHM() }]);
        setErrors([]);
        await Promise.all([refreshOrg(), refreshProjects(), refreshApprovals(), refreshTasks(), refreshKnowledge()]);
      } catch (error) {
        if (cancelled) return;
        liveRef.current = false;
        companyIdRef.current = null;
        setGwStatus('off');
        restoreChat('offline', seedMessages);
        setActivities(seedActivities);
        setDeliverables(seedDeliverables);
        setApprovals([]);
        setErrors(seedErrors);
        setTasks(seedTasks);
        setKnowledge(seedKnowledge);
        setOrg(seedOrg);
        setDashboard(EMPTY_DASHBOARD);
        const message = error instanceof Error ? error.message : String(error);
        toast(`Gateway 未连接，已进入演示模式：${message}`);
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
        if (view === 'approvals') await Promise.all([refreshApprovals(), refreshProjects()]);
        if (view === 'tasks') await refreshTasks();
        if (view === 'knowledge') await refreshKnowledge();
        if (view === 'dashboard') await refreshDashboard();
        if (view === 'deliverables' || view === 'workbench') await refreshProjects();
      } catch (error) {
        reportError(error, `${VIEW_TITLES[view]}数据加载失败`);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gwStatus]);

  useEffect(() => {
    if (gwStatus !== 'ok' || view !== 'workbench') return;
    const timer = setInterval(() => {
      void refreshProjects().catch(error => reportError(error, '项目进度刷新失败'));
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gwStatus]);

  useEffect(() => {
    if (gwStatus !== 'off') return;
    const seed = seedActivities.find(a => a.id === SEED_ACTIVITY_ID);
    if (!seed) return;
    let cur = seed.current;
    const timer = setInterval(() => {
      const act = activitiesRef.current.find(a => a.id === SEED_ACTIVITY_ID);
      if (!act) return clearInterval(timer);
      cur += 1;
      if (cur >= seed.steps.length) {
        clearInterval(timer);
        setActivities(prev => prev.map(a => a.id === SEED_ACTIVITY_ID ? { ...a, current: cur, status: 'done', detail: '演示已完成' } : a));
      } else {
        setActivities(prev => prev.map(a => a.id === SEED_ACTIVITY_ID ? { ...a, current: cur, detail: '正在' + seed.steps[cur] } : a));
      }
    }, 9000);
    return () => clearInterval(timer);
  }, [gwStatus]);

  return {
    view, setView, messages, typing, sendChat, activities, deliverables, errors, retryError,
    tasks, toggleTask, deleteTask, createTask, knowledge, dlFilter, setDlFilter, kbFilter, setKbFilter,
    org, selectedPosId, selectedStaffId, selectPosition, selectStaff, savePosition, saveStaff,
    createDept, renameDept, deleteDept, createPosition, deletePosition, createStaff, deleteStaff,
    modal, openModal, closeModal, toasts, toast, gwStatus, models, selectedModel, selectModel,
    dashboard, dashboardLoading, refreshDashboard, loadDeliverable, deleteDeliverable, retryDeliverable,
    approvals, approvalLoading, refreshApprovals, decideApproval,
  };
}

export { WorkbenchContext };
