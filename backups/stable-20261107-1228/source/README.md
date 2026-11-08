# ShadowFlow 联调工作区 · 总说明

本目录包含 Python FastAPI 业务后端、Node 网关和 React 工作台。前后端已完成一轮真实联调：浏览器只访问同源 `/api/**`，由 Vite 转发到 Node 网关，再由网关调用 Python；前端不会直连 Python `:8000`。

## 目录与端口

```text
D:\shadowflow\
├── ShadowFlow-backend\          # Python :8000 + Node 网关 :8002
│   ├── shadowflow\              # Python 业务代码
│   ├── server\                  # Node 网关（要求 Node 22）
│   ├── 新前端对接契约.md         # 后端接口契约
│   └── backend-openapi.json     # OpenAPI 快照
├── shadowflow-react\            # React + Vite 前端 :3007
├── .tools\node22\               # Windows 便携 Node 22.16.0
├── start-dev.mjs                # 全栈启动器
└── 本地启动指南.md               # 安装、启动、排障的完整步骤
```

| 服务 | 地址 | 作用 |
| --- | --- | --- |
| React 工作台 | http://localhost:3007 | 唯一需要打开的页面 |
| Node 网关健康检查 | http://localhost:8002/health | 网关进程检查 |
| 全链路业务检查 | http://localhost:8002/api/opc/companies | 同时验证网关和 Python |
| Python OpenAPI | http://localhost:8000/docs | 后端接口调试，不供前端直连 |

注意：网关健康检查是 `/health`，不是 `/api/health`。

## 一键启动

依赖已安装时，在根目录执行：

```bash
cd D:\shadowflow
npm run dev
```

启动器会选择便携 Node 22，拉起 Python、Node 网关和 React，自动初始化演示公司，并在服务就绪后打印地址。如果检测到 `:8000` 已经是 ShadowFlow Python，会明确提示并自动复用，不再报端口冲突。浏览器打开 **http://localhost:3007**，侧边栏显示“Gateway 已连接 · 实时数据”即表示全链路已通。按 `Ctrl+C` 停止本次启动的服务；被复用的 Python 不会被停止。

首次安装、三终端手动启动、BYOK 和端口冲突处理，见 **《本地启动指南.md》**。如需显式跳过 Python 启动，仍可执行 `npm run dev -- --no-python`。

## 本次已接通

- 工作台老板派工：创建内部公司项目、自动拆解、执行并刷新真实进度；不经过支付订单。
- 公司现场与交付成果：读取真实项目、任务状态及交付正文。
- 组织架构：读取部门和花名册；创建部门、员工入职和移除走真实接口。
- 定时任务：每天、每周、每月和一次性任务的创建、启停、删除。
- 数据看板：Node 用量数据与 Python 公司盈亏数据组合展示。
- 知识库：读取真实知识包列表。
- 模型列表与 BYOK：统一客户端按当前 provider 最小披露浏览器中的 key。
- 在线数据加载失败会明确报错；只有网关未连接时才进入演示模式，不把演示数据混入在线结果。

## 明确留空、已预留的位置

- 审批中心、商务订单和支付页面尚未新增；`src/api.ts` 已封装审批与订单接口，项目停在审批节点时不会伪装交付。
- 部门重命名/删除、独立岗位创建/删除、岗位和员工资料编辑等后端写接口尚未接入；界面会明确提示“未接入”，不会本地伪造成功。
- 知识包查询、交付物 PDF 导出、附件上传等尚未做完整 UI；统一 API 客户端已保留扩展入口。
- `/workflow/*` SSE 不在本轮使用范围内，仍遵循原契约中的已知前缀限制。

## 构建检查

```bash
cd D:\shadowflow
npm run build           # React TypeScript + Vite 构建
npm run check:gateway   # Node 网关 TypeScript 构建
```

## 文档阅读顺序

1. **本地启动指南.md**：当前可用的安装、启动和排障步骤。
2. **shadowflow-react/README.md**：当前前端联调架构与扩展点。
3. **ShadowFlow-backend/新前端对接契约.md**：后端契约原文。
4. **ShadowFlow前端联调对接指南.md**：最初的改造方案，保留作历史参考；当前实现以代码和前两份文档为准。

## 联调红线

- 前端只请求 `/api/**`，禁止直连 Python `:8000`。
- 新请求统一走 `shadowflow-react/src/api.ts`，组件中不写裸 `fetch`。
- 请求未成功前不得伪造审批、交付、导出或组织变更成功。
- BYOK key 只存浏览器 `localStorage`，每个请求仅携带当前 provider 对应的 header。
- 保持现有全直角视觉和六个页面，不为联调临时扩展新页面。
