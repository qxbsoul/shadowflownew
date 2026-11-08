# Changelog

All notable changes to ShadowFlow are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Older frontend-heavy history is available through Git history.

## [Unreleased] — 2026-11-07（纯后端仓库剥离）

### Changed

- 删除旧 React/Vite 前端、Tauri 桌面壳、前端测试与部署残留；新前端通过 HTTP 独立对接。
- 明确保留双后端：Python FastAPI(:8000) 负责业务 API，Node Express(:8002) 负责网关、Node 路由与 Python 兜底反代。
- Node 测试运行器及 vitest / supertest / tsx / typescript 依赖迁入 `server/`，不再依赖根 `package.json`。
- `scripts/dev.mjs` 只启动 Python 与 Node，缺失 Python 依赖时明确失败；`--no-python` 仅用于显式网关调试。
- CI 删除前端 lint / test / E2E / 镜像，恢复 pytest，并构建两个后端镜像。
- Docker Compose 只保留 `shadowflow-api` 与 `shadowflow-node`；Python 镜像携带后端运行时读取的配置、模板和示例。
- README、CONTRIBUTING 与分层 AGENTS 文档改为纯后端口径。

### Added

- 从原指导附录 B 抽出 `新前端对接契约.md`；B.7 已补齐后端可验证的页面映射、审批闭环与错误语义。
- 完整保存原存储键白名单 `tests/wire-contract-allowlist.original.txt`。
- 增加 Python OpenAPI 快照、Operation ID 唯一性测试与验证输出归档。

### Fixed

- Python `[server]` / `[all]` 依赖补充 FastAPI 表单与上传路由必需的 `python-multipart`。
- Agent Pack 测试改为验证注册表与真实 manifest 一一对应，不再硬编码历史数量。
- LLM 兼容层恢复缺少 BYOK 时的 `NO_API_KEY` / HTTP 401 契约。
- ACP 支持绝对路径可执行文件，测试子进程固定使用当前 Node 运行时。
- OpenAPI 为 runs projection 分配稳定唯一的 Operation ID，消除重复警告。
- SQLite 升级到 `better-sqlite3` 12，并明确使用标准 Node.js 22 安装和运行。
- Windows CLI 子进程测试显式使用 UTF-8，避免系统 GBK 编码导致 stdout 丢失。

## [Unreleased] — 2026-11-06（根目录结构合并）

### Changed

- `backend-poc/` 移入 `examples/backend-poc/`，作为独立参考实现保留。
- `data/` 归入 `scripts/data/`，相关脚本改为按脚本位置解析路径。
- Docker 文件统一收进 `docker/`，Compose 的 build context、env_file 与 volume 同步调整。
- 该历史条目描述当时的目录迁移；其中旧前端目录随后在 2026-11-07 的后端剥离中删除。

## [Unreleased] — 2026-11-06（仓库瘦身）

### Removed

- 解除本地设计截图、旧 PM 文档、vendored BMAD-METHOD 与 0G 时代残留的跟踪。
- 清理内部 sprint / 竞品笔记与个人材料，补充 `.gitignore` 防止再次误提交。
- 第三方方法论与运行缓存不随源码分发，需要时由相应工具重新获取。

## [Unreleased] — 2026-11-03（团队协作策略）

### Changed

- 团队 DAG 支持就地编辑，协作策略改为 roster × roster 三态矩阵。
- 策略状态与 DAG 节点染色联动，保存时持久化到后端 policy API。
- 当时对应的前端实现已随纯后端剥离移除；后端 DAG 与 policy 契约继续保留。

## [1.1.0] — 2026-05-09

### Added

- RunSession goal-to-team-assembly pipeline 与可重放 SSE 流。
- FastAPI RunSession / IntentRouter 后端。
- Claude Code、Codex、MCP、ACP 等 agent runtime 的插件化接入基础。

### Security

- `goal` 限制为 2000 字符，清理蓝图 YAML 注入与 SSE 内部异常细节。

## [1.0.0] — initial release

- Initial ShadowFlow release.
