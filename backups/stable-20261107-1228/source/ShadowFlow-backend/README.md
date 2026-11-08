# ShadowFlow Backend

Contract-first multi-agent workflow orchestration, rejection loops, checkpoints, and pluggable agent runtimes.

This repository contains **backend code only**. The legacy React/Vite frontend and Tauri shell have been removed; a new frontend must integrate through HTTP.

## Architecture

Both backend processes are required for the complete API surface:

| Service | Source | Port | Responsibility |
|---|---|---:|---|
| Node gateway | `server/` | 8002 | Frontend-facing entry point, RunSession/SSE, skills, projects, settings, CLI/ACP, and fallback reverse proxy |
| Python FastAPI | `shadowflow/` | 8000 | Workflow runtime, agents, teams, policy, memory, schedules, wallet, and other business APIs |

```text
New React frontend
        │ same-origin /api proxy
        ▼
Node gateway :8002
        │ unmatched /api/* requests
        ▼
Python FastAPI :8000
```

The Python service is not optional legacy code. Running only `server/` omits most business APIs.

## Requirements

- Python 3.10 or newer
- Node.js 22 and npm (use a standard Node runtime, not an Electron-embedded Node shim)
- Docker with Compose v2 (optional)

The repository includes a root `.nvmrc`. Run `node --version` before `npm ci`; the `better-sqlite3` native binding must be installed for the same Node runtime that starts the gateway.

## Local development

Create an isolated Python environment and install both dependency sets:

```bash
python -m venv .venv
```

Windows (Git Bash / PowerShell):

```bash
.venv/Scripts/python -m pip install -e ".[server,dev]"
```

macOS / Linux:

```bash
.venv/bin/python -m pip install -e ".[server,dev]"
```

Install the self-contained Node backend dependencies:

```bash
cd server
npm ci
cd ..
```

Start both backends from the repository root:

```bash
node scripts/dev.mjs --no-open
```

The launcher checks ports, starts exactly two processes, waits for HTTP readiness, and stops the process tree on Ctrl+C. It discovers Python in this order: `SF_PYTHON`, repository `.venv`, then system `python`. `--no-open` is retained for command compatibility; no browser is opened.

To debug only the Node gateway, explicitly use `node scripts/dev.mjs --no-python`. Python-backed routes will then be unavailable.

### Service addresses

| URL | Purpose |
|---|---|
| http://localhost:8002/health | Node gateway health check |
| http://localhost:8000/ | Python health check |
| http://localhost:8000/docs | Interactive Python OpenAPI documentation |
| http://localhost:8000/openapi.json | Python OpenAPI schema |

The services can also be started independently:

```bash
# Python, from repository root
.venv/Scripts/python -m uvicorn shadowflow.server:app --host 127.0.0.1 --port 8000 --reload

# Node, from server/
npm run dev
```

Use `.venv/bin/python` instead of `.venv/Scripts/python` on macOS / Linux.

## Frontend integration

**The frontend must call only `/api/**` on the Node gateway, never connect directly to port 8000.**

- Development: configure the frontend dev server to proxy `/api` to `http://localhost:8002`.
- Production: serve the frontend and reverse-proxy same-origin `/api` to the Node gateway. This avoids CORS changes.
- Disable response buffering for SSE routes in the proxy.
- Read the committed Python schema in `backend-openapi.json`; Node routes are documented by the mount table in `server/src/index.ts` because the gateway does not yet expose OpenAPI.
- BYOK provider keys are sent per request in the appropriate `X-{Provider}-Key` header. Do not persist them in backend storage.

The frontend-facing contract is maintained in [新前端对接契约.md](新前端对接契约.md). Section B.7 now records backend-verifiable page/API mappings, the approval/rejection flow, and LLM error semantics; additional product-only rules still require owner input.

## How to Plug Your Agent

ShadowFlow supports `api`, `cli`, `mcp`, and `acp` executor kinds. Provider presets live in `shadowflow/runtime/provider_presets.yaml`; workflows select a preset through their executor configuration. The executor interface, event namespace, YAML fields, health behavior, and integration contract are documented in [docs/AGENT_PLUGIN_CONTRACT.md](docs/AGENT_PLUGIN_CONTRACT.md).

## Tests

For Python feature placement, API compatibility, contract updates, and review checks, follow [docs/PYTHON_BACKEND_DEVELOPMENT.md](docs/PYTHON_BACKEND_DEVELOPMENT.md).

Python:

```bash
.venv/Scripts/python -m pytest -m "not requires_api_key" --tb=short
```

Node typecheck and Vitest:

```bash
cd server
npx tsc --noEmit
npx vitest run --maxWorkers=2
```

Standalone wire/fixture guards, also from `server/`:

```bash
npm run test:wire
npm run test:fixtures
npm run test:cli
```

Legacy script-style Node tests are available through `npm run test:scripts`; they are separate from the Vitest suite.

## Docker

```bash
cp .env.example .env
# Edit .env if server-side provider fallbacks are needed. Never commit real keys.
docker compose -f docker/docker-compose.yml up -d
```

Compose builds and starts only `shadowflow-api` and `shadowflow-node`. There is no frontend container.

Useful commands:

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs shadowflow-api
docker compose -f docker/docker-compose.yml logs shadowflow-node
docker compose -f docker/docker-compose.yml down
```

## 仓库目录与 Python 开发指南

完整的 Python 开发规范见 [docs/PYTHON_BACKEND_DEVELOPMENT.md](docs/PYTHON_BACKEND_DEVELOPMENT.md)。本节保留日常开发最需要了解的目录边界、接口修改流程和兼容性规则。

### 为什么剥离后端后目录反而更多

目录增加不只是为了安置原仓库根目录的散文件，主要有四个原因：

1. **完整后端包含两个进程。** `shadowflow/` 是 Python FastAPI 业务后端，`server/` 是 Node 网关。两者都在主启动链路中，不能只保留其中一个。
2. **源码、测试、配置和运行数据需要分开。** 测试、Docker、脚本、模板、契约文档和验证档案现在都有明确归属，修改接口时可以据此找到需要同步的内容。
3. **部分根目录散文件被分类收纳。** 启动和验证脚本进入 `scripts/`，容器配置进入 `docker/`，后端文档进入 `docs/`，运行时配置和模板分别进入 `config/`、`templates/`。
4. **安装依赖和运行测试会生成本地目录。** 例如 `.venv/`、`.pytest_cache/`、`shadowflow.egg-info/` 和 `node_modules/`。它们不是额外业务代码，也不会提交到 Git。

因此，目录数量增加不代表主程序被复制了多份，而是原来隐含的职责和依赖被显式分开。

### 顶层源码与工程目录

| 目录 | 作用 | 开发注意事项 |
|---|---|---|
| `shadowflow/` | Python 主包、FastAPI 应用、工作流运行时和业务 API | Python 开发的主要工作区 |
| `server/` | Node/TypeScript 网关，包含独立依赖、测试和 Dockerfile | 前端统一访问 8002 端口 |
| `tests/` | Python 测试、跨后端契约测试、SSE 和 CLI 守卫 | 修改接口时必须同步检查 |
| `scripts/` | 双后端启动器以及保留的运行时、演示脚本 | `scripts/dev.mjs` 是统一启动入口 |
| `config/` | 后端运行时读取的配置数据 | 不是普通示例，不能随意删除 |
| `templates/` | 工作流模板和 Agent Pack | 部分模板会被运行时实际读取 |
| `examples/` | 契约示例和独立参考实现 | 不同子目录作用不同，见下文 |
| `docker/` | Python 镜像及 Python＋Node 双服务 Compose 配置 | 用于容器化启动 |
| `docs/` | Agent 接入契约和 Python 后端开发规范 | 属于工程文档 |
| `validation/` | 剥离、修复和验证留下的档案 | 不是产品源码，不参与启动 |
| `.shadowflow/` | 声明式技能、Agent、Team 数据及被忽略的本地运行状态 | 混合目录，不能整个删除 |
| `.github/` | Python、Node、Docker 和密钥扫描 CI | 提交后自动执行验证 |
| `.git/` | Git 版本控制元数据 | 与业务代码无关，不要手动整理 |

`examples/` 中需要特别区分：

- `examples/runtime-contract/`：可执行的运行时契约示例，有实际验证价值。
- `examples/backend-poc/`：早期独立参考实现，不在主后端启动链路中，不要把它当成需要同时启动的第三套生产后端。

根目录的几个重要文件：

| 文件 | 作用 |
|---|---|
| `pyproject.toml` | Python 包元数据、依赖分组、Black/Ruff 和 pytest 配置 |
| `uv.lock` | Python 依赖锁文件 |
| `backend-openapi.json` | 从真实 FastAPI 应用生成的 OpenAPI 快照 |
| `新前端对接契约.md` | 前端通过 Node 网关使用后端能力的协议说明 |
| `CONTRIBUTING.md` | 双后端协作者通用规则 |
| `CHANGELOG.md` | 用户可见行为和项目结构变化记录 |
| `.env.example` | 环境变量安全示例，不包含真实密钥 |

### 安装、测试和运行生成的目录

以下目录可能只在安装依赖、运行测试或启动服务后出现，新克隆的仓库不一定全部存在：

| 目录 | 来源 | 处理原则 |
|---|---|---|
| `.venv/` | Python 虚拟环境 | 可重新安装，不提交 |
| `.pytest_cache/` | pytest 缓存 | 可删除并自动重建 |
| `shadowflow.egg-info/` | 可编辑安装生成的包元数据 | 可重新生成，不提交 |
| `node_modules/` | 根目录遗留的本地 npm 依赖 | 当前 Node 开发以 `server/` 为准，不提交 |
| `server/node_modules/` | Node 网关依赖 | 在 `server/` 下通过 `npm ci` 重建 |
| `__pycache__/` | Python 字节码缓存 | 可删除并自动重建 |
| `_data/` | 本地工具 schema 等运行数据 | 不提交；删除可能影响已有运行状态 |
| `shadowflow-runtime/` | 当前包含 checkpoint-store 运行数据 | 不要当普通缓存直接删除 |
| `server/.shadowflow/` | 网关设置、会话、项目或 SQLite 数据 | 可能含密钥，不提交，也不要盲目删除 |

清理时遵循三条规则：

1. 缓存和依赖可以重建，但应在停止相关服务后处理。
2. 运行数据库、检查点和设置虽然不提交，不代表没有价值；删除前先确认是否需要备份。
3. 根 `.shadowflow/` 中只有声明式源数据被跟踪，运行状态被忽略，不能将整个目录当作缓存清理。

根 `.shadowflow/` 的源码边界如下：

- 可跟踪：`.shadowflow/skills/`、`.shadowflow/agents/*.agent.yaml`、`.shadowflow/teams/*.team.yaml`。
- 不跟踪：SQLite、sessions、projects、settings、凭证和其他运行状态。

### Python 主包内部分工

| 位置 | 职责 |
|---|---|
| `shadowflow/server.py` | FastAPI 应用装配、中间件、异常处理和路由注册 |
| `shadowflow/api/` | 按领域拆分的 HTTP 接口 |
| `shadowflow/services/` | 可复用业务服务、持久化编排和外部服务适配 |
| `shadowflow/core/` | 工作流图、节点等核心抽象 |
| `shadowflow/assembly/` | 工作流编译、激活和装配 |
| `shadowflow/contracts/` | 跨模块共享的契约模型和校验 |
| `shadowflow/runtime/` | 执行器、事件、检查点、循环及运行状态 |
| `shadowflow/memory/` | 记忆存储和检索 |
| `shadowflow/llm/` | LLM Provider 和调用适配 |
| `shadowflow/planner/` | 规划与任务分解 |
| `shadowflow/protocol/` | 跨进程、跨组件协议 |
| `shadowflow/mcp_server.py`、`mcp_servers/` | MCP 服务及工具集 |
| `shadowflow/cli.py` | 命令行入口 |

核心原则：**路由负责 HTTP，服务负责业务，runtime/core 负责执行语义，contracts 负责共享约束。** 不要把复杂新功能继续堆进 `server.py`，也不要让底层模块反向导入 `shadowflow.server`。

### 新增 Python 功能的八步流程

#### 1. 确定功能归属

先检查 `shadowflow/api/`、`shadowflow/services/` 和对应测试。已有领域优先扩展现有模块，新领域才创建新模块。同时检查 `server/src/index.ts`，避免和 Node 已有路由冲突。

#### 2. 先定义接口契约

写实现前明确：

- 请求路径、方法、路径参数和查询参数。
- 请求字段、类型、默认值和取值范围。
- 成功响应、状态码和列表元数据。
- 404、409、422、503 等错误语义及稳定错误码。
- 是否影响旧客户端、SSE、存储格式或前端生成类型。

#### 3. 把业务逻辑放进服务层

复杂逻辑放入 `services/`、`runtime/` 或相应核心模块。路由函数只负责：

```text
校验输入 → 调用服务 → 转换响应 → 处理预期错误
```

业务函数尽量接收明确参数并返回明确模型，不依赖 FastAPI `Request`。新增依赖必须写入 `pyproject.toml` 的 core 或合适 extra，并同步重新生成 `uv.lock`，不能只在本机执行 `pip install`。

#### 4. 使用 APIRouter 编写接口

新接口优先放在 `shadowflow/api/<domain>.py`，并遵守：

- 新对外路由必须带 `/api` 前缀，否则无法通过 Node 的 Python `proxyFallback` 访问。
- 使用明确的 Pydantic 请求模型和 `response_model`。
- 设置稳定、全局唯一的 `operation_id`。
- 新领域可以采用 `{"data": ..., "meta": ...}` 成功信封。
- 路由只做 HTTP 转换，不在模块 import 时启动任务或连接外部服务。
- `async def` 中不要直接执行长时间阻塞的文件、CPU 或同步网络操作。

纯 Python `/api/**` 接口不需要在 Node 中重复实现或挂载。

#### 5. 在 server.py 注册路由

在 `shadowflow/server.py` 导入并 `include_router`。注册时不能只是机械追加到末尾，必须检查同前缀路由顺序。例如：

```text
/api/agents/registry/packs
```

必须先于：

```text
/api/agents/{agent_id}
```

否则具体路径可能被动态路由截获。注册后同时验证 Python 直连路径和经 Node :8002 的实际前端路径。

#### 6. 补测试

至少覆盖：

- 正常成功路径及关键响应形状。
- 参数校验失败和边界值。
- 资源不存在、状态冲突及适用的依赖不可用分支。
- 路由顺序，确保新路径没有被动态路由吞掉。
- 经 Node 网关访问时是否符合同一契约。
- 文件和数据库测试是否使用 `tmp_path`、`monkeypatch` 或临时数据库隔离。

定向测试示例：

```bash
.venv/Scripts/python -m pytest tests/test_<domain>_api.py -q
.venv/Scripts/python -m pytest tests/test_openapi_contract.py -q
```

macOS/Linux 将 `.venv/Scripts/python` 换成 `.venv/bin/python`。不能通过删除断言、放宽异常匹配或跳过新测试来让套件变绿。

#### 7. 更新 OpenAPI 和前端契约

接口变化后：

1. 启动真实 Python 服务。
2. 从 `http://127.0.0.1:8000/openapi.json` 重新生成 `backend-openapi.json`，不要手工编造 schema。
3. 运行 `tests/test_openapi_contract.py`，检查 Operation ID 唯一性。
4. 检查 schema diff 只包含预期变化。
5. 更新 `新前端对接契约.md`，并按需更新示例和 `CHANGELOG.md`。
6. 验证结束后正常停止临时服务，不遗留占用 8000/8002 的进程。

从运行中服务保存快照的命令：

```bash
.venv/Scripts/python -c "import json, urllib.request; from pathlib import Path; schema=json.load(urllib.request.urlopen('http://127.0.0.1:8000/openapi.json')); Path('backend-openapi.json').write_text(json.dumps(schema, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')"
```

#### 8. 做兼容、安全和提交检查

提交前确认：

- 旧请求、旧响应和旧存储读取保持兼容，或已有明确迁移方案。
- 新依赖已写入元数据并更新锁文件。
- 相关定向测试、全量回归和跨端测试已按影响范围执行。
- 没有提交密钥、`.env`、SQLite、会话、缓存、虚拟环境或临时日志。
- `git diff --check` 通过，最终 diff 只包含本任务相关修改。
- 提交信息使用 Conventional Commits，例如 `feat(api): add domain item creation`。

### 修改现有接口的兼容性规则

以下变化通常属于破坏性变更：

| 变更 | 处理要求 |
|---|---|
| 删除、重命名字段或改变字段类型 | 保留旧字段/旧版本，或提供明确迁移方案 |
| 把可选字段改为必填 | 不能直接作为兼容更新发布 |
| 修改路径、方法或成功状态码 | 保留旧路由别名并补契约测试 |
| 修改错误码或错误信封 | 检查前端分支和 wire 测试 |
| 修改 SSE 帧名、事件顺序或终止语义 | 同时检查生产者、消费者和重连测试 |
| 修改存储键或持久化结构 | 提供旧数据读取兼容或迁移 |

新增可选请求字段并提供安全默认值通常可以兼容；新增响应字段也要确认严格客户端和 `response_model` 的行为。修改 `response_model` 时，要检查它是否会过滤或转换旧字段。

推荐修改顺序：

1. 先为现有行为补回归测试，明确什么不能变。
2. 实现最小改动，保留旧调用方式；必要时新增版本或新字段，而非原地替换。
3. 同时测试旧请求和新请求。
4. 更新 OpenAPI、前端契约和迁移说明。
5. 不为追求统一响应形状而顺手破坏存量接口。

### 文件、状态和安全底线

- 文件读写显式使用 UTF-8，时间使用带时区的 UTC。
- 用户提供的 ID、文件名和相对路径必须校验，解析后的路径必须仍位于允许根目录内。
- 重要 JSON 写入使用同目录临时文件和原子替换，失败时清理临时文件。
- 测试不得读写开发者真实 `.shadowflow/` 或依赖本机隐藏状态。
- 500 响应不得泄露异常堆栈、密钥、绝对路径或 SQL；详细异常写日志，并尽量提供 `trace_id`。
- 新增环境变量时更新 `.env.example`，只放安全占位值。
- 真实 Provider 密钥测试必须标记为 `requires_api_key`，不得成为默认测试的隐式依赖。

更完整的 APIRouter 骨架、错误响应说明、状态码约定、质量检查命令和提交清单见 [Python 后端开发规范](docs/PYTHON_BACKEND_DEVELOPMENT.md)。通用协作规则见 [CONTRIBUTING.md](CONTRIBUTING.md)，近期变化见 [CHANGELOG.md](CHANGELOG.md)。

## Security

Never commit `.env`, API keys, tokens, runtime SQLite databases, or `server/.shadowflow/`. Report vulnerabilities through [GitHub Security Advisories](https://github.com/Ravenveil/ShadowFlow/security/advisories).

## License

[MIT](LICENSE) © Ravenveil
