# ShadowFlow 后端剥离验证记录

验证日期：2026-11-07（本机 Windows，Git Bash）。

## 环境

- Python 3.12.15，项目内 `.venv`，安装 `.[server,dev]`。
- Node.js 22.23.4。系统 Node 24 缺少本机 C++ 编译工具链，因此验证使用 Node 22 和 better-sqlite3 预构建绑定。
- Docker CLI 不可用；没有执行镜像构建或容器启动。

## 最终结果汇总

| 验证项 | 结果 | 最终输出 |
|---|---|---|
| Python 全量 pytest | **2380 passed，8 skipped，0 failed** | `python-pytest-fixed.txt` |
| Node TypeScript 类型检查 | 通过，无输出 | `node-typecheck-fixed.txt` |
| Node Vitest | **133 files / 730 tests，全部通过** | `node-vitest-fixed.txt` |
| Node 旧 script-style 测试 | **62 通过 / 0 失败** | `node-script-tests-fixed.txt` |
| 存储键 wire guard | 通过；0 个未放行异常 | `wire-contract-fixed.txt` |
| SSE parser fixtures | 12 passed / 0 failed | `sse-fixtures-fixed.txt` |
| CLI 本机探测 | 0 fail；22 个 CLI 因未安装而 skip | `cli-spawn-fixed.txt` |
| 双后端真实启动 | 仅 `[py]`、`[gw]`，健康检查通过，清理后无监听进程 | `dev-servers-fixed.txt`、两个 health JSON |
| Python OpenAPI | 210 paths；256 个 Operation ID 全部唯一；无重复警告 | 根目录 `backend-openapi.json` |
| 前端路径与 Compose 静态检查 | 通过 | `structure-check.txt` |
| 对接契约 B.7 | 已补齐后端可验证的页面映射、审批闭环与错误语义 | 根目录 `新前端对接契约.md` |
| Docker | 未运行；CLI 不存在 | `docker-validation.txt` |

修复前的日志继续保留在原文件名中，最终日志统一使用 `*-fixed.txt`，两类结果不得混报。

## 本轮已修复

1. Agent Pack 测试不再要求历史上的至少 5 个 Pack，改为验证 `registry-index.yaml` 与真实 manifest 一一对应。
2. LLM 兼容层在缺少当前 provider 密钥时恢复 `NO_API_KEY`；非流式路由因此返回 HTTP 401，不再返回 500 / `PROVIDER_ERROR`。
3. ACP 检测支持绝对路径可执行文件；测试中的 Node 子进程统一使用 `process.execPath`，ACP / MCP / JSON-RPC 真实链路均通过。
4. Runs projection 使用稳定且唯一的 Operation ID，并新增 OpenAPI 唯一性回归测试。
5. Windows 中文环境下的 CLI 子进程测试显式使用 UTF-8，修复 GBK 解码导致的 4 个失败。
6. SQLite 升级为 `better-sqlite3` 12；安装和运行固定使用标准 Node.js 22，避免 Electron 内嵌 Node 的 ABI 混用。

## 运行验证说明

执行统一启动器后：

- `http://127.0.0.1:8002/health` 返回 `status=ok`。
- `http://127.0.0.1:8000/` 返回 `status=running`。
- `http://127.0.0.1:8000/openapi.json` 返回 200，快照已更新并提交。
- 日志没有 Vite/Web 进程，也没有重复 Operation ID 警告。
- 验证结束后 `:8000`、`:8002` 均不可连接，没有保留后台服务。
- Python 全量测试仍报告 26 个非失败警告，主要是 FastAPI / Pydantic / 测试依赖的弃用提示；不影响本次零失败结果。

CLI smoke 的 22 个 skip 只表示本机没有相应第三方可执行文件，不代表这些第三方 CLI 已通过真实运行验证。

## Docker 边界

Compose YAML 已静态验证只包含 `shadowflow-api` 与 `shadowflow-node`，两个 Dockerfile 和 `.dockerignore` 已检查。由于本机没有 Docker 命令，不能声称镜像可构建或容器可运行；应在有 Docker 的环境执行 `docker compose -f docker/docker-compose.yml up -d` 做部署验证。本地双后端启动已真实通过，不依赖 Docker。
