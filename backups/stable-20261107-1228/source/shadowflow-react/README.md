# ShadowFlow · AI 营销公司工作台（React 版）

Vite + React 18 + TypeScript 前端，现已接入 ShadowFlow Python 后端和 Node 网关。保留原有六个视图与全直角视觉，不引入额外后端或 UI 框架。

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
| 公司现场 | 项目列表、项目详情和任务状态，工作台每 3 秒刷新活动项目 |
| 交付成果 | 真实项目列表；打开预览时加载任务输出正文 |
| 组织架构 | 公司组织图与花名册；创建部门、员工入职、员工移除 |
| 定时任务 | `/api/schedules` 的列表、创建、启停和删除 |
| 数据看板 | `/api/dashboard/*` + `/api/opc/company/{id}/pnl` |
| 知识库 | `/api/knowledge/packs` 列表 |
| 模型 | `/api/opc/models`，选择结果保存在本地 |

老板派工是内部项目，不创建支付订单。项目需要人工审批时会真实停在审批节点，不会在前端伪造完成。

## 预留但暂未做 UI 的能力

`src/api.ts` 已保留审批、订单、支付通知、知识包详情/查询及通用 `apiGet/apiPost/apiPatch/apiDelete`，便于后续扩展：

- 审批中心和订单/支付页面；
- 部门重命名/删除、独立岗位和员工资料编辑；
- 知识包查询界面、附件上传、PDF 导出；
- `/workflow/*` SSE 能力。

未接入的按钮会明确提示，不会显示虚假的成功状态。

## BYOK

key 仅保存在浏览器 `localStorage`：`sf_{provider}_key`，默认 provider 为 `sf_default_provider`。每次请求只注入当前 provider 的一个 `X-{Provider}-Key` header。模型选择存储为 `sf_selected_model`。

## 目录结构

```text
src/
├── main.tsx                 入口
├── App.tsx                  布局与视图切换
├── api.ts                   唯一 API 客户端与后续扩展接口
├── store.ts                 在线状态、真实业务动作、离线演示回退
├── data.ts                  仅用于离线演示的种子数据
├── types.ts                 页面类型
├── styles.css               全直角视觉样式
└── components/
    ├── Sidebar.tsx          导航与 Gateway 状态
    ├── Topbar.tsx           标题、搜索与快捷操作
    ├── WorkbenchView.tsx    对话工作台
    ├── LiveBoard.tsx        真实项目现场与错误原因
    ├── OrgView.tsx          组织架构
    ├── TasksView.tsx        定时任务
    ├── DeliverablesView.tsx 交付成果
    ├── DashboardView.tsx    数据看板
    ├── KnowledgeView.tsx    知识库
    ├── ModalHost.tsx        新建、删除、预览等弹窗
    └── Toasts.tsx           操作反馈
```
