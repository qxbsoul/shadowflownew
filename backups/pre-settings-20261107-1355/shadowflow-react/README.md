# ShadowFlow · AI 营销公司工作台（React 版）

Vite + React 18 + TypeScript 前端，现已接入 ShadowFlow Python 后端和 Node 网关。当前为七个视图，保留全直角视觉，不引入额外后端或 UI 框架。

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
| 工作台派工 | `POST /api/opc/company/{id}/projects` + `POST /api/opc/projects/{id}/run` |
| 对话上下文过渡恢复 | 浏览器本地恢复消息和项目卡片；在线按公司、离线分别隔离，最多 200 条 |
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

老板派工是内部项目，不创建支付订单。核心流程为“派工 → 审批／驳回返工 → 继续执行 → 交付”，删除和失败重试都从交付预览进入。审批、交付、删除和重试状态均以后端响应为准。

**执行内容边界：** 当前 Python OPC 执行器会因 `shadowflow.llm.completion` 尚未提供而进入既有模拟降级分支，返回 `[simulated]` 任务记录。项目、任务和审批状态是真实后端数据，但这些记录不是模型实际生成的业务交付。前端会显示模拟／错误提示，不补写虚假正文；本轮未修改模型 Provider 或 OPC 执行器。

## 预留但暂未做 UI 的能力

`src/api.ts` 已保留订单、支付通知、知识包详情/查询及通用 `apiGet/apiPost/apiPatch/apiDelete`，便于后续扩展：

- 后端已有但工作台未做页面：商品／订单／支付、订单事件与取消、单任务读取与强制执行、收入登记、知识包创建／重建索引／详情、定时任务运行历史，以及通用会话／团队／运行平台接口；
- 前端有入口但后端缺写接口：部门重命名/删除、独立岗位增删改、员工资料和汇报关系编辑；
- 仅占位：知识包查询界面、附件上传、PDF 导出、通用错误“重试”；
- `/workflow/*` SSE 能力。

未接入的按钮会明确提示，不会显示虚假的成功状态。

## 本地对话恢复的后续替换点

`src/chat-storage.ts` 是浏览器 `localStorage` 的过渡 repository，在线 key 为 `sf_workbench_chat:v1:company:{companyId}`，离线 key 为 `sf_workbench_chat:v1:offline`。`store.ts` 只负责选择作用域、恢复和触发保存，视图组件不直接操作存储。后续聊天后端接入时，以相同 scope 替换该 repository 即可，项目创建、审批和交付仍走现有 `api.ts → store.ts → 视图`，不混入聊天存储层。

## BYOK

key 仅保存在浏览器 `localStorage`：`sf_{provider}_key`，默认 provider 为 `sf_default_provider`。每次请求只注入当前 provider 的一个 `X-{Provider}-Key` header。模型选择存储为 `sf_selected_model`。这只保留通用模型调用配置，**不会自动把当前 OPC 的模拟执行变成真实模型执行**。

## 目录结构

```text
src/
├── main.tsx                 入口
├── App.tsx                  布局与视图切换
├── api.ts                   唯一 API 客户端与后续扩展接口
├── chat-storage.ts          本地对话过渡 repository，后续可替换为聊天后端
├── store.ts                 在线状态、真实业务动作、聊天恢复、离线演示回退
├── data.ts                  仅用于离线演示的种子数据
├── types.ts                 页面类型
├── styles.css               全直角视觉样式
└── components/
    ├── Sidebar.tsx          导航、审批角标与 Gateway 状态
    ├── Topbar.tsx           标题、搜索与快捷操作
    ├── WorkbenchView.tsx    对话工作台
    ├── ApprovalsView.tsx    人工审批与审批历史
    ├── LiveBoard.tsx        真实项目现场与错误原因
    ├── OrgView.tsx          组织架构
    ├── TasksView.tsx        定时任务
    ├── DeliverablesView.tsx 交付成果
    ├── DashboardView.tsx    数据看板
    ├── KnowledgeView.tsx    知识库
    ├── ModalHost.tsx        审批、删除、重试、预览等弹窗
    └── Toasts.tsx           操作反馈
```
