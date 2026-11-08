/* ShadowFlow · 公司化工作台类型定义。 */

export type ViewKey =
  | 'workbench'
  | 'approvals'
  | 'org'
  | 'tasks'
  | 'deliverables'
  | 'dashboard'
  | 'knowledge';

export interface MsgCard {
  kind: 'deliverable';
  title: string;
  meta: string;
}

export interface Msg {
  from: 'ceo' | 'boss';
  text: string;
  time: string;
  card?: MsgCard;
}

export interface Activity {
  id: string;
  title: string;
  position: string;
  steps: string[];
  current: number;
  detail: string;
  status: 'running' | 'done' | 'blocked' | 'failed';
}

export type DlType = '简报' | '方案' | '脚本' | '素材';

export interface Deliverable {
  id: string;
  title: string;
  type: DlType;
  client: string;
  time: string;
  status: '已交付' | '待审核' | '失败' | '已取消';
  mark: string;
  color: string;
  sourceId?: string;
  rawStatus?: string;
  content?: string;
  contentLoaded?: boolean;
  contentMode?: 'live' | 'simulated' | 'mixed' | 'error';
}

export interface ErrItem {
  id: string;
  title: string;
  cause: string;
  impact: string;
  action: string;
  time: string;
  resolved: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  schedule: string;
  next: string;
  runs: number;
  position: string;
  enabled: boolean;
  once: boolean;
  mark: string;
}

export interface KbItem {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  mark: string;
  color: string;
}

export interface Department {
  id: string;
  name: string;
  charter?: string;
}

export interface Position {
  id: string;
  name: string;
  deptId: string | null;
  managerId: string | null;
  avatar: string;
  enabled: boolean;
  soul: string;
  root?: boolean;
  /** 后端没有独立岗位表；该字段把派生岗位映射回员工 Agent。 */
  sourceEmployeeId?: string;
}

export interface Staff {
  id: string;
  name: string;
  positionId: string;
  managerId: string | null;
  avatar: string;
}

export interface OrgState {
  departments: Department[];
  positions: Position[];
  staff: Staff[];
}

export interface ModelOption {
  id: string;
  label: string;
  vendor: string;
  tier: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  trend: string;
  dir: 'up' | 'down';
}

export interface DashboardSeriesPoint {
  day: number;
  label: string;
  value: number;
}

export interface DashboardBreakdownItem {
  key: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface DashboardState {
  kpis: DashboardKpi[];
  series: DashboardSeriesPoint[];
  breakdown: DashboardBreakdownItem[];
  alerts: string[];
  insight: string;
  loaded: boolean;
}

export const EMPTY_DASHBOARD: DashboardState = {
  kpis: [
    { label: '近 30 天模型调用', value: '—', trend: '等待数据', dir: 'up' },
    { label: '近 30 天运行成功率', value: '—', trend: '等待数据', dir: 'up' },
    { label: '公司累计交付项目', value: '—', trend: '等待数据', dir: 'up' },
    { label: '公司累计运营成本', value: '—', trend: '等待数据', dir: 'down' },
  ],
  series: [],
  breakdown: [],
  alerts: [],
  insight: '进入看板后加载真实经营数据。',
  loaded: false,
};

export type ModalState =
  | { kind: 'new-dept' }
  | { kind: 'rename-dept'; deptId: string }
  | { kind: 'delete-dept'; deptId: string }
  | { kind: 'new-position'; deptId?: string }
  | { kind: 'delete-position'; positionId: string }
  | { kind: 'new-staff'; positionId?: string }
  | { kind: 'delete-staff'; staffId: string }
  | { kind: 'new-task' }
  | { kind: 'delete-task'; taskId: string }
  | { kind: 'decide-approval'; approvalId: string; decision: 'approved' | 'rejected' }
  | { kind: 'delete-deliverable'; deliverableId: string }
  | { kind: 'preview-deliverable'; deliverableId: string };

export interface Toast {
  id: string;
  msg: string;
}
