# ShadowFlow 本地联调工作区

ShadowFlow 由 React 工作台、Node 网关和 Python FastAPI 后端组成。浏览器只请求同源 `/api/**`，请求经 Node 网关转发或处理，不会直接连接 Python 端口。

## 1. 项目结构与端口

```text
D:\shadowflow\
├── shadowflow-react\             React + TypeScript + Vite，端口 3007
├── ShadowFlow-backend\
│   ├── shadowflow\              Python 业务后端，端口 8000
│   ├── server\                  Node 22 网关与真实聊天，端口 8002
│   └── .venv\                   推荐创建的 Python 虚拟环境
├── .tools\node22\               工作区自带 Windows Node 22
├── start-dev.mjs                全栈启动器
└── 本地启动指南.md               详细操作与排障
```

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| React 工作台 | http://localhost:3007 | 日常使用的页面 |
| Node 网关 | http://localhost:8002/health | 网关健康检查 |
| Python API | http://localhost:8000/docs | 后端接口调试 |

## 2. 环境要求

- Windows 10／11，推荐使用 PowerShell。
- **Python 3.10 或更高版本**，推荐 Python 3.12。
- **Node.js 22.x**。工作区已带 `.tools\node22`，存在时无需另行安装。
- 可用端口：`3007`、`8000`、`8002`。

检查 Python：

```powershell
python --version
```

检查工作区 Node 22：

```powershell
D:\shadowflow\.tools\node22\node.exe --version
```

如果便携 Node 不存在，请安装 Node.js 22.x。不要使用 Node 24 安装网关依赖后再用 Node 22 运行，`better-sqlite3` 的原生模块需要与 Node 大版本匹配。

## 3. 安装依赖

以下命令在 **PowerShell** 中执行。根目录的 `package.json` 只提供启动脚本，不需要在根目录单独执行 `npm install`。

### 3.1 创建 Python 虚拟环境

```powershell
cd D:\shadowflow\ShadowFlow-backend
python -m venv .venv
```

虚拟环境只需创建一次。如果 `.venv` 已存在，跳过这一步。

### 3.2 安装 Python 服务依赖

```powershell
cd D:\shadowflow\ShadowFlow-backend
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".[server]"
```

这里会安装：

- 项目核心依赖：`pydantic`、`pyyaml`、`httpx`；
- API 服务：`fastapi`、`uvicorn`；
- 定时任务：`APScheduler`；
- 限流：`slowapi`；
- 上传与表单：`python-multipart`；
- 向量计算与混合检索：`numpy`；
- 凭据加密：`cryptography`。

只有需要运行完整 Python 开发测试时，才改装开发依赖：

```powershell
cd D:\shadowflow\ShadowFlow-backend
.\.venv\Scripts\python.exe -m pip install -e ".[server,dev]"
```

启动器会优先使用 `ShadowFlow-backend\.venv\Scripts\python.exe`。需要使用其他解释器时，可在启动前设置：

```powershell
$env:SF_PYTHON = "D:\path\to\python.exe"
```

### 3.3 安装 Node 网关依赖

使用工作区自带 Node 22：

```powershell
cd D:\shadowflow
.\.tools\node22\npm.cmd --prefix .\ShadowFlow-backend\server ci
```

主要运行依赖包括 `express`、`better-sqlite3`、`openai`、`http-proxy-middleware`；开发依赖包括 `typescript`、`tsx`、`vitest`。具体版本以 `ShadowFlow-backend\server\package-lock.json` 为准。

### 3.4 安装 React 前端依赖

```powershell
cd D:\shadowflow
.\.tools\node22\npm.cmd --prefix .\shadowflow-react ci
```

主要运行依赖是 `react`、`react-dom`；构建依赖是 `typescript`、`vite`、`@vitejs/plugin-react`。具体版本以 `shadowflow-react\package-lock.json` 为准。

如果 `.tools\node22` 不存在，可在两个项目目录分别使用自己安装的 Node 22 执行 `npm ci`。

## 4. 启动服务

依赖安装完成后，在根目录执行：

```powershell
cd D:\shadowflow
npm run dev
```

启动器会拉起 Python、Node 和 React，并等待服务就绪。看到“全部服务已就绪”后打开：

```text
http://localhost:3007
```

首次进入可注册、登录或使用未注册演示。停止时在启动终端按 `Ctrl+C`。

如果 Python 已经运行，启动器会自动复用兼容实例。**修改 Python 或 Node 代码后，应停止对应旧进程再重新执行 `npm run dev`，避免继续复用旧代码。** 已有新版 Python 时可显式跳过重复启动：

```powershell
npm run dev -- --no-python
```

## 5. 配置模型并验证

1. 登录后点击左下角老板卡片右侧的“设置”。
2. 在“模型与 API”配置自己的 MiMo API Key。
3. 服务地址固定为 `https://api.xiaomimimo.com/v1`，模型固定为 `mimo-v2.6-pro`。
4. 在“知识库 Embedding”选择厂商、模型并填写 Key。默认是通义 `qwen3.7-text-embedding-flash`，Base URL 为 `https://dashscope.aliyuncs.com/compatible-mode/v1`；点击“测试连接”应返回真实向量维度。也提供 OpenAI、SiliconFlow 和自定义 OpenAI 兼容接口预设。
5. 打开“知识库”，拖入或点击选择文件。首次上传自动创建“公司知识库”；展开知识包可查看解析状态并测试检索。配置 Embedding 后，新上传资料会生成真实向量，检索使用 `BM25 + vector` 混合通道；未配置 Key 时回退到本地关键词与结构检索。
6. 新建单聊，发送“先写推广文案，再结合数据分析复盘”，确认总经理实际派发相关员工、员工顺序交接并由总经理汇总；连续发送两条消息并刷新，确认上下文恢复。
7. 聊天区会显示知识库检索、总经理规划、员工派单等真实工作流卡片；右栏可查看分工、员工思考、产出与交接。工作流完成事件随消息保存，刷新后可恢复。
8. 在“设置 → 工具与扩展”配置 Tavily 或 SerpAPI；在“组织架构”给员工授予 `web_search`、`fetch_url` 等权限后，员工才能通过原生工具循环获取真实外部结果。GitHub 读取可配置 Token。未配置供应商时工具会明确失败，不会生成模拟搜索结果。
9. 定时任务支持创建、编辑、暂停、立即执行、运行历史和删除。执行会进入真实总经理编排并生成可追溯对话；失败会如实记录，连续失败达到上限后自动停用。
10. 新建群聊验证同一套动态编排，再删除测试对话，确认不影响项目、审批和交付物。

**Embedding、聊天模型和外部工具是三套独立配置。** 已有知识包绑定首次向量化时的模型；更换 Embedding 模型后请新建知识包，不要混用不同维度或模型的索引。

日常 API Key 只保存在当前浏览器 `localStorage`，随对应请求使用，不写入服务端数据库。Node 仅在请求中转发 Embedding Key，Python 仅在进程内存创建向量客户端。为让定时任务脱离浏览器执行，保存任务时所需的模型／工具凭据与独立服务会话会使用 Fernet 加密存入任务 JSON，接口不会返回这些凭据。真实模型、Embedding 和搜索调用需要有效密钥并可能产生服务商费用；缺 key 或上游失败时会明确报错，不生成模拟成功结果。

## 6. 数据存储位置

- `ShadowFlow-backend\.shadowflow\opc.sqlite`：账号、公司、员工、项目、任务、审批和订单。
- `ShadowFlow-backend\server\.shadowflow\app.sqlite`：Node 应用数据、新版工作台聊天及知识包公司归属。
- `ShadowFlow-backend\.shadowflow\knowledge\`：知识包原始文件、解析索引和检索数据库。
- `ShadowFlow-backend\.shadowflow\runtime.sqlite`：运行记录。
- `ShadowFlow-backend\.shadowflow\schedules\`：定时任务、执行历史及 Fernet 加密的任务执行凭据。
- `ShadowFlow-backend\.shadowflow\.schedule-secret-key`：任务凭据的本地加密密钥，必须保密并与任务文件一起备份。

聊天数据表为 `opc_chat_conversations` 和 `opc_chat_messages`，按公司隔离。删除对话会级联删除消息。SQLite 运行时可能产生 `-wal`、`-shm` 文件，不要在服务运行时手工移动数据库。

## 7. 构建与测试

前端类型检查和生产构建：

```powershell
cd D:\shadowflow
npm run build
```

Node 网关类型检查：

```powershell
npm run check:gateway
```

Node 全量测试：

```powershell
cd D:\shadowflow\ShadowFlow-backend\server
D:\shadowflow\.tools\node22\node.exe node_modules\vitest\vitest.mjs run --maxWorkers=2
```

Python 离线测试：

```powershell
cd D:\shadowflow\ShadowFlow-backend
.\.venv\Scripts\python.exe -m pytest -m "not requires_api_key" --tb=short -q
```

## 8. 当前功能边界

- 工作台：单聊、群聊、新建、切换、删除、真实模型回复、流式思考、图片／视频／TXT 附件和服务端历史。
- 项目与经营：项目派工、人工审批、驳回返工、交付预览、失败重试、订单和运行日志均连接真实后端。历史 `[simulated]` 输出仍是模拟记录，不代表真实模型成果。
- 组织与数据：组织架构、定时任务、Token 用量与官方刊例价估算看板。
- 知识库：拖拽／点击上传、多文件解析、公司隔离、原文检索测试，以及单聊／群聊自动检索注入。支持通义、OpenAI、SiliconFlow 和自定义 OpenAI 兼容 Embedding；默认通义 flash，真实 `BM25 + vector` 混合检索，无 Key 时回退本地关键词。
- 扩展工具：按岗位授权 Web Search、网页读取、公司目录只读文件、GitHub／消息读取；工具结果会回传模型。图片生成接口已预留，但需要单独配置图像供应商。
- 安全边界：Shell、文件写入、外部发布、邮件等高风险操作不会在 OPC 聊天中隐式开放；未配置搜索供应商、模型密钥或执行桥时不会伪造成功。
- 尚未实现：PDF 导出、独立图像供应商配置和部分通用运行平台页面；界面不会伪造这些操作成功。

## 9. 备份与回滚

真实聊天改造前的源码快照：

```text
D:\shadowflow\backups\pre-real-chat-20261107-1630
```

更早的稳定版本及数据库快照：

```text
D:\shadowflow\backups\stable-20261107-1228
```

对应回滚脚本为 `rollback-stable.ps1`。回滚会覆盖代码和数据，执行前必须停止服务并另行备份需要保留的内容。

## 10. 联调约定

- 前端只请求 `/api/**`，不得直连 Python `:8000`。
- 新请求统一经过 `shadowflow-react\src\api.ts` 和 `src\store.ts`，组件中不写裸 `fetch`。
- 请求未成功前不得伪造聊天、审批、交付、删除、重试或组织变更成功。
- 保持前后端目录分离和现有全直角 UI 风格。
