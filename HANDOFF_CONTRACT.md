# ShadowFlow 项目交接契约

> 交接日期：2026-11-08  
> 工作区：`D:\shadowflow`  
> 适用对象：下一位继续开发、联调或验收 ShadowFlow 的工程师／AI Agent  
> 原则：先读懂、先备份、小步修改、真实验证；不得以模拟结果冒充真实能力。

## 一、项目目标与当前结论

ShadowFlow 是面向“一人公司／AI 营销公司”的本地全栈工作台。老板通过总经理模型发起任务，由总经理动态规划员工分工、执行顺序和交接关系；员工可以使用知识库和获授权的外部工具，最终由总经理汇总交付。

当前已经完成多轮前后端联调，不再是纯 UI Demo。账号与公司隔离、真实聊天、动态 DAG、审批、知识库、工具、定时任务、订单、日志、用量看板、Checkpoint、最近发言编辑与复制等主流程已有实现。

**当前代码可以作为继续迭代的基础，但工作区存在大量未提交修改，不能把它描述为已发布、已提交或全量测试全绿的正式版本。**

## 二、不可破坏的架构边界

```text
D:\shadowflow\
├─ shadowflow-react\                  React + TypeScript + Vite 前端
├─ ShadowFlow-backend\
│  ├─ shadowflow\                    Python FastAPI 业务后端
│  ├─ server\                        Node 22 网关、新版聊天及 OPC 服务
│  └─ .venv\                         Python 虚拟环境
├─ ShadowFlow_staging\               上游后端合入参考，不是前端目录
├─ backups\                          各阶段源码／数据备份
├─ .tools\node22\                    Windows 便携 Node 22
├─ start-dev.mjs                     全栈启动与兼容实例检查
├─ README.md                         安装、配置、功能和启动总说明
└─ 本地启动指南.md                    本地操作与排障说明
```

默认端口：

| 服务 | 默认地址 | 约束 |
|---|---|---|
| React | `http://localhost:3007` | 用户入口 |
| Node 网关 | `http://localhost:8002/health` | 浏览器 API 的统一入口 |
| Python | `http://localhost:8000/docs` | 业务 API；已有兼容实例也可能运行在其他端口并被启动器复用 |

必须遵守：

1. 前端只请求同源 `/api/**`，不得绕过网关直连 Python。
2. 前端请求统一放在 `shadowflow-react\src\api.ts`，状态与流式事件统一接入 `src\store.ts`，组件中不得新增裸 `fetch`。
3. Python 业务功能与 Node 聊天／网关职责保持清晰，不把业务逻辑塞进 React 组件。
4. 所有公司数据查询必须带公司边界；跨公司、跨对话访问必须被拒绝。
5. 模型、Embedding、搜索工具是三套独立配置，不得混用凭据或假定已有 Key。
6. 高风险 Shell、文件写入、外部发布、邮件等能力不得默认隐式开放。
7. 保持现有浅色、简约、科技感 UI，以及部分按钮的直角风格；新增功能沿用现有设计，不另起一套风格。

## 三、已实现的主要能力

### 1. 账号、公司与工作台

- 注册、登录、未注册演示；老板区域显示对应身份。
- 公司数据隔离，新建、切换、删除单聊和群聊。
- 对话服务端持久化，刷新后恢复历史。
- 二级会话侧栏可折叠，任务执行期间也能切换会话。
- 流式思考与正式答案分离；思考自动折叠，可再次展开。
- 用户主动上滚后不强制拉回底部，并提供轻量“回到最新”入口。
- 支持 Markdown、表格、LaTeX 等富内容展示。
- 图片、视频、TXT 附件可拖拽或通过加号上传，限制格式与大小。

### 2. 真实模型与员工编排

- 当前聊天预设 MiMo：Base URL `https://api.xiaomimimo.com/v1`，模型 `mimo-v2.6-pro`。
- 总经理根据任务选择相关员工、DAG 依赖与交接，不再要求所有员工流水账执行。
- 单聊中员工执行过程作为工作流展示，不冒充员工分别与老板聊天；最终由总经理统一回答。
- 独立任务可并行，下游只接收声明的上游产出。
- 聊天界面展示真实规划、工具调用、员工过程与思考；右栏展示 DAG 和执行状态。
- 缺少 Key 或上游失败时必须明确报错，不得生成模拟成功结果。

### 3. Checkpoint、编辑与复制（最近完成）

- 每位员工真实模型调用前创建 Checkpoint。
- 快照包含消息、审批、原始输入、附件、固定计划、花名册、知识库上下文及已完成员工成果。
- 从任意 Checkpoint 重做时复用固定计划和上游成果，不重复规划、检索或新增老板消息，只重做目标员工与后续节点。
- 恢复后删除失效的后续 Checkpoint，并恢复对应消息、审批与 DAG 状态。
- 仅允许编辑当前对话最近一条老板的聊天发言；审批等 workflow 用户消息不妨碍定位。
- 编辑后截断其后的旧轮次，以最新内容重新生成。
- 老板发言与总经理正式回答下方提供透明小字“复制”；可编辑时“编辑／复制”并排。
- 员工过程消息不提供复制；复制有浏览器兼容回退，失败时不得提示成功。

关键实现位置：

```text
ShadowFlow-backend\server\src\storage\opc-chat.ts
ShadowFlow-backend\server\src\services\opc-chat.ts
ShadowFlow-backend\server\src\services\opc-chat-stream.ts
ShadowFlow-backend\server\src\routes\opc-chat.ts
shadowflow-react\src\api.ts
shadowflow-react\src\store.ts
shadowflow-react\src\types.ts
shadowflow-react\src\components\WorkbenchView.tsx
shadowflow-react\src\modern.css
```

新增接口：

```text
POST /api/opc-chat/:id/messages/:messageId/edit
POST /api/opc-chat/:id/checkpoints/:checkpointId/redo
```

新增流事件：`conversation-restored`、`checkpoint`。

### 4. 其他已接后端能力

- 项目派工、人工审批、驳回返工、交付预览、失败重试、订单、日志。
- 知识库上传、解析、公司隔离、检索测试和聊天自动注入。
- 默认通义 Embedding，真实 `BM25 + vector` 混合检索；无 Key 时回退本地关键词与结构检索。
- Tavily／SerpAPI Web Search、网页读取、公司目录只读、GitHub／消息读取等按岗位授权工具。
- 定时任务创建、编辑、暂停、立即执行、历史和删除；执行进入真实总经理编排。
- Token 用量与按模型官方刊例价估算成本的数据看板。
- 组织架构和员工权限配置。

## 四、明确边界与遗留事项

1. PDF 导出、独立图像供应商配置和部分通用运行平台页面尚未完成。
2. 历史 `[simulated]` 记录只是旧模拟数据，不代表真实模型产出；不要恢复模拟产出逻辑。
3. 大量源码、构建产物和依赖目录处于未提交状态。**禁止直接执行 `git reset --hard`、`git clean -fd` 或整目录覆盖。**
4. 前端生产构建存在大 chunk 警告，但构建成功；如需拆包应单独优化，不与业务修复混在一起。
5. Node 全量测试曾出现仓库原有 `clawhub-e2e.smoke.test.ts`、`claw-installer.test.ts` 共 5 项安装环境失败（`PM_NOT_FOUND` 等）；不得因此宣称全量测试全绿。
6. 最近 Checkpoint 相关测试和浏览器验收使用模拟 provider，未消耗真实 MiMo Key；真实 Key 下的完整“生成→重做→编辑”仍应作为下一次人工验收。
7. `verify-opc.mjs` 是已有验收脚本，不要当作临时文件删除。

## 五、启动与依赖

完整安装命令以 `README.md` 为准。已有依赖时：

```powershell
cd D:\shadowflow
npm run dev
```

浏览器打开：

```text
http://localhost:3007
```

停止：在启动终端按 `Ctrl+C`。

已有兼容 Python 实例时可：

```powershell
npm run dev -- --no-python
```

修改 Python 或 Node 后必须重启对应服务，避免复用旧进程。遇到端口占用先查进程命令行，确认属于本工作区再停止；**不要强杀来源不明的 Python，也不要为了启动项目停止用户其他服务。**

Node 必须使用 22.x；`better-sqlite3` 与 Node 大版本匹配。根目录不需要单独 `npm install`。

## 六、数据与凭据

- `ShadowFlow-backend\.shadowflow\opc.sqlite`：账号、公司、员工、项目、任务、审批、订单。
- `ShadowFlow-backend\server\.shadowflow\app.sqlite`：Node 应用数据、新版聊天、Checkpoint、知识包归属。
- `ShadowFlow-backend\.shadowflow\knowledge\`：原始知识文件、索引和检索数据库。
- `ShadowFlow-backend\.shadowflow\runtime.sqlite`：运行记录。
- `ShadowFlow-backend\.shadowflow\schedules\`：定时任务、执行历史及加密执行凭据。
- `ShadowFlow-backend\.shadowflow\.schedule-secret-key`：定时任务凭据加密密钥，必须保密并随任务一起备份。

聊天主要表：`opc_chat_conversations`、`opc_chat_messages`、`opc_chat_checkpoints`。

日常模型和 Embedding Key 默认保存在当前浏览器 `localStorage`；不要写入文档、测试快照或源码。服务运行时可能产生 SQLite `-wal`、`-shm`，不得手工移动数据库。

## 七、备份与回滚

最近 Checkpoint 改造前备份：

```text
D:\shadowflow\backups\before-checkpoints-20261108-060457.zip
```

其他重要备份：

```text
D:\shadowflow\backups\before-tools-schedules-20261108-052046.zip
D:\shadowflow\backups\before-usage-attachments-20261108-045238.zip
D:\shadowflow\backups\opc-before-full-integration-20261108-021542.zip
D:\shadowflow\backups\pre-real-chat-20261107-1630
D:\shadowflow\backups\stable-20261107-1228
```

每次结构性修改前必须新备份。回滚会覆盖代码或数据，执行前停止服务并备份当前状态；不得默认回滚整个工作区来解决局部问题。

## 八、测试基线与验收契约

最近一次已验证：

- 前端 `npm run build`：通过。
- 后端 `npm run build`：通过。
- Checkpoint／聊天／DAG／审批／日志／工具相关：6 个文件、24 项测试全部通过。
- 真实浏览器验收：两个 Checkpoint 卡片、两个重做入口、最近发言编辑与取消、旧发言不可编辑、老板发言实际剪贴板复制、总经理复制入口均通过。
- 临时验收服务和脚本已清理，未留下 3007／8002 临时进程。

相关回归命令：

```powershell
cd D:\shadowflow\ShadowFlow-backend\server
D:\shadowflow\.tools\node22\node.exe node_modules\vitest\vitest.mjs run src/__tests__/opc-chat-checkpoint.test.ts src/__tests__/opc-chat.test.ts src/__tests__/opc-chat-dag-approval-logs.test.ts src/__tests__/opc-chat-stream.test.ts src/__tests__/opc-task-execution.test.ts src/__tests__/opc-tools.test.ts
```

交付任何修改前必须：

1. 构建前端和后端。
2. 运行受影响模块的回归测试，不只验证页面能打开。
3. 涉及交互时做真实浏览器点击验收；不能用 DOM  programmatic click 的结果冒充剪贴板等需要用户激活的浏览器能力。
4. 真实功能失败要报告失败，不得用硬编码、假 Toast 或模拟产出掩饰。
5. 清理临时服务和临时脚本，不留下 npm、Node、Vite 后台进程。
6. 明确说明测试范围、未验证范围和真实 API 是否被调用。

## 九、协作规则

- 所有工作留在 `D:\shadowflow`；外部文件先复制到工作区再操作。
- 未经用户明确要求，不使用子代理，不自行同步 GitHub，不提交、不推送、不发布。
- 先读目标文件再编辑；小步修改，避免无关重构和整包重写。
- 新功能先确认后端是否已有能力；后端已有而前端未做可留明确接口，不得伪造入口。
- 保留公司隔离、会话锁、审批状态和 DAG 依赖语义，任何“优化”不得绕过这些约束。
- 不打印、不保存、不复用用户提供的真实 Key 做无关测试。
- 不删除用户数据、历史备份、现有验收脚本或未确认用途的文件。
- 若需求与现有架构冲突，先说明取舍再改，不以“先跑起来”为理由破坏边界。

## 十、建议的下一步

用用户自己的真实模型配置完成一轮人工验收：创建一个需要两名以上员工的任务，确认实时思考与 DAG；从中间 Checkpoint 重做并检查上游成果复用；编辑最近一条老板发言并确认旧轮次被替换；最后检查日志、Token 用量和刷新恢复。通过后再处理剩余平台页面和构建拆包，不优先扩大功能面。
