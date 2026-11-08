# ShadowFlow 后端开发文档

本文档是后端协作者入口。用户安装与前端对接见 [README.md](README.md)，新前端协议见 [新前端对接契约.md](新前端对接契约.md)。Python 新功能、接口兼容与 OpenAPI 更新流程见 [Python 后端开发规范](docs/PYTHON_BACKEND_DEVELOPMENT.md)。修改局部代码前，同时阅读对应目录下的 `AGENTS.md`。

## 架构与边界

ShadowFlow 当前是**纯后端、双进程**仓库：

| 服务 | 位置 | 技术栈 | 端口 | 职责 |
|---|---|---|---:|---|
| Node 网关 | `server/` | Node 22 + TypeScript + Express + better-sqlite3 | 8002 | 前端统一入口、RunSession/SSE、技能、项目、设置、CLI/ACP、反代 |
| Python API | `shadowflow/` | Python ≥3.10 + FastAPI + Uvicorn | 8000 | 编排内核、契约、Agent/Team、策略、记忆、计划任务等领域 API |

请求链路：**新前端 → 同域 `/api` → Node :8002 → 未匹配路由反代 Python :8000**。

旧 `src/`、`src-tauri/` 和前端工具链已删除，不要恢复或新增对它们的依赖。Python 不是可删除的 legacy 服务；两个后端缺一不可。

## 目录结构

```text
ShadowFlow-backend/
├── shadowflow/           # Python 包与 FastAPI 入口
│   ├── server.py         # FastAPI 装配与部分业务路由
│   ├── api/              # 按域拆分的 REST 路由
│   ├── core/ assembly/   # 工作流图抽象 / 编译激活
│   ├── contracts/        # 契约模型与校验
│   ├── runtime/          # 执行、事件、检查点、循环等运行时
│   ├── memory/ services/ # 记忆与领域服务
│   └── mcp_server.py     # MCP 支持
├── server/               # Node 网关（独立依赖、测试与镜像）
│   ├── src/index.ts      # 路由挂载表 + Python proxyFallback
│   ├── src/routes/       # HTTP 路由
│   ├── src/lib/          # 业务内核与抽象
│   ├── src/storage/      # SQLite / JSON 持久化
│   └── src/workflow/     # DAG 执行
├── tests/                # pytest + wire / SSE / CLI 结构守卫
├── scripts/              # 双后端启动器及运行时相关脚本
├── config/ templates/    # 后端运行时读取的声明式数据
├── examples/             # 运行时契约示例与后端参考实现
├── docker/               # Python 镜像与双服务 Compose
└── .github/workflows/    # Python、Node、双镜像与密钥扫描 CI
```

`examples/backend-poc/` 是早期独立参考实现，不在主服务启动链路中。`config/`、`templates/`、`examples/runtime-contract/` 会被后端读取，不能按“示例”或“模板”名称误删。

## 环境搭建

```bash
python -m venv .venv
# Windows:
.venv/Scripts/python -m pip install -e ".[server,dev]"
# macOS / Linux:
# .venv/bin/python -m pip install -e ".[server,dev]"

cd server
npm ci
cd ..
node scripts/dev.mjs --no-open
```

启动器只启动 Python(:8000) 与 Node(:8002)，不打开浏览器。解释器探测顺序为 `SF_PYTHON` > 根目录 `.venv` > 系统 `python`。缺 Python 依赖时默认启动会失败；只有明确调试网关时才使用 `--no-python`。

## 修改规则

### 新增 Node 路由

1. 在 `server/src/routes/<name>.ts` 定义 Router。
2. 在 `server/src/index.ts` 挂载到 `/api/<name>`，且必须位于 `proxyFallback` 之前。
3. 路由只做 HTTP 形状转换；复杂业务放入 `src/lib/`、`src/workflow/` 或 `src/storage/`。
4. 为状态码、错误信封和 SSE 行为补充 Vitest。

### 新增 Python 路由

1. 优先在 `shadowflow/api/<domain>.py` 中使用 `APIRouter`。
2. 在 `shadowflow/server.py` 装配，保持 Pydantic 请求/响应模型明确。
3. 更新 OpenAPI 快照与相关 pytest；不要用手写文档替代真实 schema。
4. 文件持久化遵循 `.shadowflow/` 约定，测试必须使用临时目录隔离。

### 跨端契约

- 新前端只使用 Node :8002 的 `/api/**`，不得直连 Python :8000。
- 修改路由、SSE 帧、存储键或错误码时，同步检查 `新前端对接契约.md`、`tests/wire-contract.test.ts` 与 OpenAPI 快照。
- 附录 B.7 已记录可由后端验证的页面／接口映射与审批闭环；新增产品语义必须有项目负责人依据，不要自行猜测。
- CORS 默认保持现状；新前端推荐同域反代。

## 测试

```bash
# Python，仓库根目录
.venv/Scripts/python -m pytest -m "not requires_api_key" --tb=short

# Node，server/ 目录
cd server
npx tsc --noEmit
npx vitest run --maxWorkers=2

# 独立契约守卫
npm run test:wire
npm run test:fixtures
npm run test:cli

# 旧 script-style 测试（与 Vitest 分开记录结果）
npm run test:scripts
```

Node 测试运行器已包含在 `server/package.json`，不再依赖根目录 `package.json`。Vitest 配置位于 `server/vitest.config.ts`，应从 `server/` 启动。

不要为让测试变绿而删除断言或放宽契约。存量失败与本次改动引入的失败要分开记录。

## CI 与 Docker

CI 包含：

- Python：安装 `.[server,dev]`，运行无真实 API key 的 pytest。
- Node：在 `server/` 独立 `npm ci`、TypeScript 类型检查和 Vitest。
- Docker：在两个后端测试通过后构建 Python 与 Node 镜像。
- Secret scan：扫描提交差异中的已验证密钥。

本地容器命令：

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml config --services
docker compose -f docker/docker-compose.yml down
```

Compose 只能包含 `shadowflow-api` 与 `shadowflow-node`。移动 Dockerfile 时同步更新 Compose 与 CI。

## 提交与安全

- 使用 Conventional Commits，例如 `feat(gateway): add session replay`。
- 行为变化同步更新 README / CHANGELOG / 契约快照。
- 不提交 `.env`、真实 key、token、SQLite 运行库或 `server/.shadowflow/`。
- `.shadowflow/agents/*.agent.yaml` 与 `.shadowflow/teams/*.team.yaml` 是源数据，不要改名或当作运行缓存删除。
- 漏洞通过 GitHub Security Advisories 私密报告。

贡献即同意以 [MIT License](LICENSE) 授权。
