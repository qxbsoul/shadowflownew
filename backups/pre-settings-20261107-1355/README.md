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

- 工作台老板派工：创建内部公司项目、自动拆解并刷新真实项目状态与进度；不经过支付订单。
- 对话上下文过渡恢复：刷新后恢复当前浏览器中的消息和项目卡片，在线按公司隔离、离线单独存储，最多保留 200 条；`src/chat-storage.ts` 以后可替换为同作用域的服务端 repository，不改变视图和项目 API 分层。
- 人工审批：待审批角标、审批历史、批准继续、驳回返工，以及后续节点自动推进。
- 公司现场与交付成果：读取真实项目、任务状态及全部任务输出记录；终态项目预览不会被 3 秒轮询重置，内部项目可级联删除，失败项目可只重试失败任务。
- 组织架构：读取部门和花名册；创建部门、员工入职和移除走真实接口。
- 定时任务：每天、每周、每月和一次性任务的创建、启停、删除。
- 数据看板：Node 用量数据与 Python 公司盈亏数据组合展示。
- 知识库：读取真实知识包列表。
- 模型列表与 BYOK：统一客户端按当前 provider 最小披露浏览器中的 key。
- 在线数据加载失败会明确报错；只有网关未连接时才进入演示模式，不把演示数据混入在线结果。

核心流程为：**派工 → 人工审批／驳回返工 → 继续执行 → 交付预览 → 删除或失败重试**。商务订单关联项目不能直接删除，必须走订单取消或归档流程。

### 当前 AI 执行边界

项目状态机、审批、任务状态和成本记录是真实后端数据，但 **OPC 的真实模型执行尚未接通**。`shadowflow/services/opc_company.py` 的 `_llm_complete()` 引用了当前 `shadowflow.llm` 并未导出的 `completion`，随后进入既有降级分支，所以输出为 `[simulated] 已按岗位要求处理任务：...`。这不是前端漏展示，也不是仅配置 BYOK 就能解决；本轮没有擅自修改模型 Provider、任务编排或执行器。交付预览和审批弹窗会明确标识模拟记录，避免把流程推进误认为真实业务成果。

角色分配本身正常：9 个任务分别由不同岗位负责；视觉设计师只是第一个 medium 风险人工卡点，因此审批区会先看到它，并不代表所有任务都交给了视觉设计师。

## 明确留空、已预留的位置

- **后端有接口、当前工作台无页面**：商品／订单／支付、订单事件与取消、单任务读取与强制执行、收入登记、知识包创建／重建索引／详情查询、定时任务运行历史，以及另一套通用会话／团队／运行平台接口。
- **前端有入口、后端缺对应写能力**：部门重命名／删除、独立岗位增删改、员工资料和汇报关系编辑；界面会明确提示“未接入”，不会本地伪造成功。
- **当前仅占位**：交付物 PDF 导出、附件上传、通用错误“重试”；统一 API 客户端已保留扩展入口。
- **合理的纯前端本地能力**：离线演示、已加载数据搜索、模型选择／BYOK，以及上述临时聊天恢复；这些不伪造成服务端能力。
- `/workflow/*` SSE 不在本轮使用范围内，仍遵循原契约中的已知前缀限制。

## 构建与回归检查

```bash
cd D:\shadowflow
npm run build           # React TypeScript + Vite 构建
npm run check:gateway   # Node 网关 TypeScript 构建

cd D:\shadowflow\ShadowFlow-backend
.\.venv\Scripts\python.exe -m pytest tests/api/test_opc_os.py -q
```

浏览器回归已覆盖驳回历史、返工后交付、删除后 API 404、失败任务重试且不重复已完成任务；控制台无错误。

## 稳定备份与回滚

本轮修改前的可运行源码和 5 个 SQLite 一致性快照保存在 `backups\stable-20261107-1228`。如需放弃本轮全部改动，先停止 `3007 / 8000 / 8002` 上的 ShadowFlow 服务，再在根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\rollback-stable.ps1
```

脚本会精确恢复源码与数据库，保留 `node_modules`、`.venv` 和便携 Node 运行时。恢复后执行 `npm run dev` 即可；该操作会覆盖本轮新代码和此后产生的数据，执行前请另行备份需要保留的内容。

## 文档阅读顺序

1. **本地启动指南.md**：当前可用的安装、启动和排障步骤。
2. **shadowflow-react/README.md**：当前前端联调架构与扩展点。
3. **ShadowFlow-backend/新前端对接契约.md**：后端契约原文。
4. **ShadowFlow前端联调对接指南.md**：最初的改造方案，保留作历史参考；当前实现以代码和前两份文档为准。

## 联调红线

- 前端只请求 `/api/**`，禁止直连 Python `:8000`。
- 新请求统一走 `shadowflow-react/src/api.ts`，组件中不写裸 `fetch`。
- 请求未成功前不得伪造审批、交付、删除、重试、导出或组织变更成功。
- BYOK key 只存浏览器 `localStorage`，每个请求仅携带当前 provider 对应的 header。
- 保持现有全直角视觉和七个视图，后续扩展沿用 `api.ts → store.ts → 视图组件` 的分层。
