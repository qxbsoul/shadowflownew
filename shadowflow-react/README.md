# ShadowFlow · AI 营销公司工作台（React 版）

Vite + React 18 + TypeScript 前端，现已接入 ShadowFlow Python 后端和 Node 网关。当前为八个视图（含设置），保留全直角视觉，不引入额外后端或 UI 框架。

## 启动

推荐从工作区根目录一键启动三项服务：

```bash
cd D:\shadowflow
npm run dev
```

只开发前端时：

```bash
cd D:\shadowflow\shadowflow-react
npm ci
npm run dev       # http://localhost:3007
npm run build     # TypeScript 检查 + 生产构建
npm run preview   # 预览生产构建
```

完整安装与排障见根目录 **《本地启动指南.md》**。

## 当前联调架构

```text
React :3007
  │  同源 /api/**
  ▼
Vite proxy
  │  http://localhost:8002
  ▼
Node Gateway :8002
  │
  ▼
Python FastAPI :8000
```

- `vite.config.ts` 固定开发端口 `3007` 和 `strictPort`，代理 `/api` 到 `localhost:8002`。
- `src/api.ts` 是唯一网络入口，统一处理 JSON、错误信封、30 秒超时和 BYOK header；业务组件不写裸 `fetch`。
- 默认使用同源相对路径。需要显式指定网关时可使用 `?api=http://host:port`，但正常本地联调不需要。
- 启动通过 `/api/opc/companies` 做全链路检查。网关 `/health` 只用于进程健康检查，当前没有 `/api/health`。
- 在线时组织、项目、任务、知识和看板全部使用服务端数据；只有连接失败才回退 `src/data.ts` 的演示数据。

## 已接真实接口

| 页面/能力 | 当前实现 |
| --- | --- |
| 工作台单聊／群聊 | `/api/opc-chat` 的新建、列表、历史、删除和发消息；在线会话由 Node SQLite 按公司持久化 |
| 真实模型与动态协作 | 单聊与群聊均携带最近 24 条消息；除寒暄外均由总经理选择相关员工、安排顺序和交接，员工真实调用后由总经理汇总，失败不伪造成功 |
| 旧项目派工 | `POST /api/opc/company/{id}/projects` + `POST /api/opc/projects/{id}/run`，属于独立历史流程，不再由新聊天自动创建 |
| 人工审批 | 审批列表与历史筛选；`POST /api/opc/approvals/{id}/decide` 后调用项目运行接口继续推进 |
| 公司现场 | 项目列表、项目详情和任务状态，工作台每 3 秒刷新活动项目 |
| 交付成果 | 真实项目列表；打开预览时加载并按任务顺序展示全部输出、任务名和负责人，终态正文不随轮询闪烁 |
| 项目删除 | `DELETE /api/opc/projects/{id}`；内部项目级联删除，订单项目由后端返回 409 |
| 失败重试 | `POST /api/opc/projects/{id}/run`，请求体 `{ "retry": true }`；不重复已完成任务 |
| 组织架构 | 公司组织图与花名册；创建部门、员工入职、员工移除 |
| 定时任务 | `/api/schedules` 的列表、创建、启停和删除 |
| 数据看板 | `/api/dashboard/*` + `/api/opc/company/{id}/pnl` |
| 知识库 | `/api/knowledge/packs` 列表 |
| 模型 | `/api/opc/models`，选择结果保存在本地 |

新版聊天与旧项目 Playbook 已分离：聊天用于真实连续对话和动态协作，旧项目继续支持“派工 → 审批／驳回返工 → 继续执行 → 交付”。删除聊天只删除会话及消息，不影响项目；删除和失败重试项目仍从交付预览进入。

**执行内容边界：** 新聊天不会生成模拟成功消息。旧项目中已有 `[simulated]` 记录保留原样，表示历史流程状态而非真实模型业务交付；前端不补写虚假正文。

## 预留但暂未做 UI 的能力

`src/api.ts` 已保留订单、支付通知、知识包详情/查询及通用 `apiGet/apiPost/apiPatch/apiDelete`，便于后续扩展：

- 后端已有但工作台未做页面：商品／订单／支付、订单事件与取消、单任务读取与强制执行、收入登记、知识包创建／重建索引／详情、定时任务运行历史，以及通用会话／团队／运行平台接口；
- 前端有入口但后端缺写接口：部门重命名/删除、独立岗位增删改、员工资料和汇报关系编辑；
- 仅占位：知识包查询界面、附件上传、PDF 导出、通用错误“重试”；
- `/workflow/*` SSE 能力。

未接入的按钮会明确提示，不会显示虚假的成功状态。

## 对话存储、流式输出与后续扩展

在线聊天通过 `src/api.ts → src/store.ts → 视图组件` 调用 `/api/opc-chat`，服务端保存会话和正式消息。消息接口以 `Accept: application/x-ndjson` 请求流式响应，逐行处理 `message-start`、`thinking-delta`、`content-delta`、`message-end`、`done` 和 `error`。单聊的派单与员工成果使用 `workflow` 通道进入右侧工作流，聊天区只显示老板和总经理最终回复；刷新后按通道恢复。思考内容只来自上游通道，暗色流式显示并计时，正式答案开始后自动折叠；数据库不保存思维链。聊天仅在用户位于底部时自动跟随，上翻后显示“回到最新”。`src/chat-storage.ts`、`src/conversation-storage.ts` 仅保留旧版本地记录兼容和离线演示能力，不覆盖在线服务端历史；旧本地聊天不会自动迁移。后续可增加会话重命名或附件接口，无需改变项目、审批和交付的独立链路。

## 设置与 BYOK

从左下角老板卡片右侧“设置”进入。`src/settings-storage.ts` 是模型配置的浏览器 repository，视图通过 `store.ts` 读取、保存和清除，不直接操作密钥。

- 当前工作台仅开放 MiMo，Base URL 固定为 `https://api.xiaomimimo.com/v1`，模型固定为 `mimo-v2.6-pro`。
- key 保存在 `sf_mimo_key`，聊天请求只注入 `X-MiMo-Key`，不写入服务端数据库；已有 key 不回显，留空保存保留原 key。
- 清除需要二次确认，不影响聊天；API 配置只在当前浏览器，刷新恢复，清除浏览器数据会删除，不跨设备同步。

## 目录结构

```text
src/
├── main.tsx                 入口
├── App.tsx                  布局与视图切换
├── api.ts                   唯一 API 客户端与后续扩展接口
├── chat-storage.ts          本地对话过渡 repository，后续可替换为聊天后端
├── settings-storage.ts      官方 BYOK 与MiMo 的本地配置 repository
├── store.ts                 在线状态、真实业务动作、设置、聊天恢复、离线演示回退
├── data.ts                  仅用于离线演示的种子数据
├── types.ts                 页面类型
├── styles.css               全直角视觉样式
└── components/
    ├── Sidebar.tsx          导航、审批角标、Gateway 状态与设置入口
    ├── Topbar.tsx           标题、搜索与快捷操作
    ├── WorkbenchView.tsx    对话工作台
    ├── ApprovalsView.tsx    人工审批与审批历史
    ├── LiveBoard.tsx        真实项目现场与错误原因
    ├── OrgView.tsx          组织架构
    ├── TasksView.tsx        定时任务
    ├── DeliverablesView.tsx 交付成果
    ├── DashboardView.tsx    数据看板
    ├── KnowledgeView.tsx    知识库
    ├── SettingsView.tsx     BYOK、MiMo、执行状态与存储说明
    ├── ModalHost.tsx        审批、删除、重试、预览等弹窗
    └── Toasts.tsx           操作反馈
```
