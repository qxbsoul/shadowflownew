/* ════════════════════════════════════════════════════════════
   种子数据（演示数据，可对接 ShadowFlow Gateway）
   ════════════════════════════════════════════════════════════ */
import type {
  Activity,
  Deliverable,
  ErrItem,
  KbItem,
  Msg,
  OrgState,
  TaskItem,
} from './types';

export const uid = (p: string) => p + '-' + Math.random().toString(36).slice(2, 8);

export const AVATAR_PICKS = ['总', '客', '策', '文', '设', '审', '数', '研'];
export const DL_TYPES = ['全部', '简报', '方案', '脚本', '素材'];
export const KB_TYPES = ['全部', '知识包', '已就绪', '待索引', '索引中', '失败'];

export const seedMessages: Msg[] = [
  {
    from: 'ceo',
    text: '早上好，老板。公司目前 4 个部门、8 个岗位在运转，今天已有 2 项定时任务交付。有什么想推进的，尽管吩咐。',
    time: '09:02',
  },
  { from: 'boss', text: '把上周的获客数据整理成简报，中午前发我。', time: '09:03' },
  {
    from: 'ceo',
    text: '已交付。《跨境电商获客周报 · 第 45 周》要点：新增商机 12 个（环比 +20%），内容渠道转化率提升 6pt。完整版在「交付成果」里可以预览。',
    time: '09:12',
    card: { kind: 'deliverable', title: '跨境电商获客周报 · 第 45 周', meta: '简报 · 今天 09:12 交付' },
  },
];

/** 种子任务：启动后缓慢推进，制造「公司现场」的心跳感 */
export const SEED_ACTIVITY_ID = 'act-seed';

export const seedActivities: Activity[] = [
  {
    id: SEED_ACTIVITY_ID,
    title: '制定《双 12 预热投放方案》',
    position: '策略师',
    steps: ['拆解投放目标', '分析渠道数据', '生成投放策略', '预算测算', '排版交付'],
    current: 1,
    detail: '正在分析渠道数据',
    status: 'running',
  },
];

export const seedDeliverables: Deliverable[] = [
  { id: 'dl-1', title: '跨境电商获客周报 · 第 45 周', type: '简报', client: '跨境电商专项', time: '今天 09:12', status: '已交付', mark: '简', color: 'rgba(18,181,165,.12)' },
  { id: 'dl-2', title: '双 11 营销策略方案 v2', type: '方案', client: '自营', time: '昨天 18:40', status: '已交付', mark: '案', color: 'rgba(123,97,255,.12)' },
  { id: 'dl-3', title: '3 条短视频口播脚本', type: '脚本', client: '潮玩品牌', time: '昨天 15:02', status: '已交付', mark: '脚', color: 'rgba(255,91,53,.1)' },
  { id: 'dl-4', title: '行业情报日报 · 11/06', type: '简报', client: '内部', time: '昨天 09:00', status: '已交付', mark: '简', color: 'rgba(18,181,165,.12)' },
  { id: 'dl-5', title: '客户复盘会材料', type: '方案', client: '跨境电商专项', time: '前天 16:20', status: '待审核', mark: '案', color: 'rgba(232,161,58,.13)' },
  { id: 'dl-6', title: '小红书种草文案 × 6', type: '素材', client: '美妆客户', time: '前天 11:05', status: '已交付', mark: '素', color: 'rgba(255,91,53,.1)' },
];

export const seedErrors: ErrItem[] = [
  {
    id: 'err-1',
    title: '行业数据抓取失败',
    cause: '目标站点触发限流（HTTP 429）',
    impact: '《行业情报日报》缺少 2 个竞品价格点',
    action: '已降级为缓存数据补全，建议 30 分钟后重试',
    time: '今天 08:47',
    resolved: false,
  },
];

export const seedTasks: TaskItem[] = [
  {
    id: 'tk-1',
    title: '每天早上 9 点扫描跨境电商行业新闻并生成简报',
    schedule: '每天 09:00',
    next: '2026/11/08 09:00:00',
    runs: 3,
    position: '策略师',
    enabled: true,
    once: false,
    mark: '日',
  },
  {
    id: 'tk-2',
    title: '每周一 10:00 生成获客周报并邮件同步',
    schedule: '每周一 10:00',
    next: '2026/11/09 10:00:00',
    runs: 11,
    position: '客户经理',
    enabled: true,
    once: false,
    mark: '周',
  },
  {
    id: 'tk-3',
    title: '客户复盘会材料准备（一次性）',
    schedule: '11/10 15:00',
    next: '2026/11/10 15:00:00',
    runs: 0,
    position: '内容专员',
    enabled: true,
    once: true,
    mark: '次',
  },
];

export const seedKnowledge: KbItem[] = [
  { id: 'kb-1', title: '跨境电商行业情报库（11 月）', desc: '主流平台政策、竞品定价、物流时效的持续更新档案', tags: ['行业情报'], mark: '情', color: 'rgba(18,181,165,.12)' },
  { id: 'kb-2', title: '客户档案 · 跨境电商专项', desc: '业务背景、历史需求、沟通偏好与关键决策人', tags: ['客户资料'], mark: '客', color: 'rgba(123,97,255,.12)' },
  { id: 'kb-3', title: '获客方法论手册 v3', desc: '内容获客、转介绍、活动获客三条线的标准打法', tags: ['方法论'], mark: '法', color: 'rgba(255,91,53,.1)' },
  { id: 'kb-4', title: '品牌视觉规范（星火）', desc: 'Logo、色彩、字体与物料模板的统一规范', tags: ['方法论'], mark: '牌', color: 'rgba(232,161,58,.13)' },
  { id: 'kb-5', title: '竞品监测清单', desc: '12 个重点竞品的定位、价格带与营销动作追踪', tags: ['行业情报'], mark: '竞', color: 'rgba(18,181,165,.12)' },
  { id: 'kb-6', title: '客户档案 · 美妆客户', desc: '种草节奏、内容偏好与历史投放效果', tags: ['客户资料'], mark: '妆', color: 'rgba(123,97,255,.12)' },
];

/* 组织架构：组织 / 岗位 / 员工 / 汇报关系（全部可变） */
export const seedOrg: OrgState = {
  departments: [
    { id: 'd-acq', name: '获客部' },
    { id: 'd-str', name: '策略部' },
    { id: 'd-del', name: '交付部' },
    { id: 'd-qa', name: '合规部' },
  ],
  positions: [
    {
      id: 'p-ceo', name: '总经理', deptId: null, managerId: null, avatar: '总', enabled: true, root: true,
      soul: '你是「总经理」，星火营销公司的 AI 首席执行官。职责：1) 听懂老板的需求，把模糊想法拆成可执行任务；2) 评估需要哪些岗位协作，安排到人；3) 把控交付质量并向老板汇报结果。风格：简洁、可靠、有分寸。',
    },
    {
      id: 'p-am', name: '客户经理', deptId: 'd-acq', managerId: 'p-ceo', avatar: '客', enabled: true,
      soul: '负责商机跟进与客户沟通，维护客户档案，输出获客周报。',
    },
    {
      id: 'p-scout', name: '商机扫描专员', deptId: 'd-acq', managerId: 'p-am', avatar: '扫', enabled: true,
      soul: '持续扫描行业动态与潜在客户信号，沉淀商机线索。',
    },
    {
      id: 'p-str', name: '策略师', deptId: 'd-str', managerId: 'p-ceo', avatar: '策', enabled: true,
      soul: '负责营销策略与投放方案的制定，基于数据给出可执行建议。',
    },
    {
      id: 'p-analyst', name: '数据分析专员', deptId: 'd-str', managerId: 'p-str', avatar: '数', enabled: true,
      soul: '负责渠道数据、转化漏斗的统计分析，为策略提供数据支撑。',
    },
    {
      id: 'p-writer', name: '内容专员', deptId: 'd-del', managerId: 'p-ceo', avatar: '文', enabled: true,
      soul: '负责简报、文案、脚本等内容的撰写与排版交付。',
    },
    {
      id: 'p-designer', name: '设计专员', deptId: 'd-del', managerId: 'p-writer', avatar: '设', enabled: true,
      soul: '负责配图、海报与物料的视觉设计，遵循品牌视觉规范。',
    },
    {
      id: 'p-qa', name: '合规审核员', deptId: 'd-qa', managerId: 'p-ceo', avatar: '审', enabled: true,
      soul: '对交付物做合规与事实核验，标注风险点，把好最后一道关。',
    },
  ],
  staff: [
    { id: 's-1', name: '小满', positionId: 'p-am', managerId: 'p-ceo', avatar: '满' },
    { id: 's-2', name: '阿川', positionId: 'p-scout', managerId: 'p-am', avatar: '川' },
    { id: 's-3', name: '思远', positionId: 'p-str', managerId: 'p-ceo', avatar: '远' },
    { id: 's-4', name: '小镜', positionId: 'p-analyst', managerId: 'p-str', avatar: '镜' },
    { id: 's-5', name: '婉儿', positionId: 'p-writer', managerId: 'p-ceo', avatar: '婉' },
    { id: 's-6', name: '阿布', positionId: 'p-designer', managerId: 'p-writer', avatar: '布' },
    { id: 's-7', name: '老纪', positionId: 'p-qa', managerId: 'p-ceo', avatar: '纪' },
  ],
};
