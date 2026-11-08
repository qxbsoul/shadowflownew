# ShadowFlow 新功能暂存 SOP（暂存 agent 专用）

> **你的角色**：另一个 agent 正在现有项目里修基础功能，没空管上游新功能。你负责**只扫、只抽、只暂存**——在一个全新的空目录里工作，把上游新功能抽成模块包放好。合入不归你管：将来负责人会把你整个目录拷进项目根目录，由合入方照单合入。
> **你的世界里只有两样东西**：一个空的工作目录 + GitHub 只读访问。不需要、也不允许对任何已有项目目录做读写。
> **两个 GitHub 仓库，角色不同，别搞混**：
> - **新功能来源**：`https://github.com/Ravenveil/ShadowFlow` —— 没重构的原始仓库，新 PR 都合在这里。你只**从这里抽**
> - **对照基准**：`https://github.com/qxbsoul/ShadowFlow_backend` —— 重构后的剥离后端。判"是不是新功能"**对着它判断**；它只作为只读快照进 reference/，绝不写入
> **铁律**：
> 1. 只向你的工作目录写入；GitHub 只读
> 2. 前后端分开——产物里**零前端代码**（无 src/、无 Tauri、无 e2e），前端接入等负责人统一命令
> 3. 模块包必须自洽：合入时对项目现有文件只做**单行插入**，不许有"修改某段现有逻辑"的步骤

## 1. 工作目录布局（全新空目录，如 `ShadowFlow_staging/`）

```javascript
ShadowFlow_staging/                  # 你的全部世界，最终整个被拷进项目根目录
├── SYNC_STATE                       # 一行：上次扫到的上游 SHA
├── ledger.md                        # 台账
├── upstream/                        # git clone https://github.com/Ravenveil/ShadowFlow
│                                    # （要完整历史：bd68389..HEAD 的 diff 在这里做；只读）
├── reference/                       # 参照快照（只读，首次扫描时自建）
│   ├── backend-snapshot/            # git clone --depth 1 https://github.com/qxbsoul/ShadowFlow_backend
│   │                                # （只读参照：判新对照、import 核对都用它，绝不在其中改文件）
│   └── registered-modules.txt       # 从快照提取的注册清单（见 §2 第 2 步）
├── modules/
│   └── <功能名>/
│       ├── shadowflow/
│       │   ├── api/<模块>.py        # 路由，全部 /api 前缀
│       │   └── services/<模块>.py
│       ├── tests/test_<模块>.py
│       └── 接入步骤.md               # 合入时的唯一操作依据，见 §4
├── patches/                         # 补丁类（非新功能）的暂存
│   └── <SHA>_<简述>.diff + 同名 .md 说明
└── _verify/                         # 可选：快照的复制品，跑测试用，用完即删
```

**首次运行自建**：建目录、clone `upstream/`（Ravenveil/ShadowFlow，完整历史）和 `reference/backend-snapshot/`（qxbsoul/ShadowFlow_backend，`--depth 1` 即可）、`SYNC_STATE` 写入 `bd68389`（先验证该 SHA 在 upstream/ 里存在：`git cat-file -t bd68389`；不存在则改用树对比法并把实际基准记进 SYNC_STATE）、ledger.md 建空表头。

**GitHub 慢/超时自己解决**：直连 clone、fetch、拉 PR 列表卡顿或失败时，自己换加速渠道，哪个通用哪个，把可用的记进 ledger 备注（后续复用）：

- 代理前缀：`https://gh-proxy.com/`、`https://mirror.ghproxy.com/`、`https://ghproxy.net/` 等 + 原 GitHub URL（如 `git clone https://gh-proxy.com/https://github.com/...`）；这类站点时效性强，一个不通就换下一个
- zip 直装：`https://codeload.github.com/<owner>/<repo>/zip/refs/heads/main`（可同样套代理前缀），下载解压代替 clone——但 upstream/ 需要完整提交历史做 diff，不能用 zip，只能用代理前缀 clone
- 拉 PR 列表：GitHub API（api.github.com）同样可套代理前缀，或直接网页看 PR 编号

加速只用于下载，不改任何仓库内容。

## 2. 扫描与判新（每次标准流程，幂等）

```javascript
0. 自检工作目录（首次自建，含 reference/ 快照）
1. cd upstream && git fetch origin main 最新 + 拉取近期 PR 列表（编号/标题做备注）
2. 读 SYNC_STATE，取 bd68389..HEAD 的提交与树 diff（只看 shadowflow/ server/ tests/ config/ templates/）
3. 逐条分类（§3），ledger 里已出现的 SHA 跳过
4. 新功能 → 抽取成模块包放 modules/；补丁 → diff 放 patches/
5. 静态校验（§5），更新 ledger 与 SYNC_STATE
```

**第 2 步前置——刷新注册清单**：从 `reference/backend-snapshot/` 提取三样，存 `registered-modules.txt`：

- `backend-openapi.json` 里全部路径（`python3 -c "import json;print('\n'.join(sorted(json.load(open('backend-openapi.json'))['paths'])))"`）
- `shadowflow/server.py` 里所有 `app.include_router(...)` 行
- `server/src/index.ts` 里所有 `app.use('/api...` 行

**判"新功能"三重对照**（防把已有能力误判为新）：

1. 注册清单的路径里没有这套接口（如全新 `/api/xxx` 前缀）→ 新
2. include_router / index.ts 挂载表里没有对应模块 → 新
3. 快照的 `shadowflow/api|services/` 下无同名文件 → 新

三条都不沾的"候选" = 重构，归无关。前端目录（src/、src-tauri/、.github/、docs/、README、e2e）= 无关，直接跳过。**PR 里前后端混着的**（很常见）：只抽后端部分，PR 编号进 ledger 备注。

## 3. 抽取规范（四道加工，照搬上游代码 ≠ 完成）

1. **前缀修复**：上游路由不带 `/api` 一律改写加上（网关只代理 `/api/*` 且转发统一补前缀，裸前缀必 404，`/workflow/*` 是前科）。改完文件头注释注明
2. **import 核对**：上游模块 import 了快照里没有/已改名的内部模块，把那段逻辑收进自己的 services——**模块包必须自洽，零"需改项目现有文件"的步骤**
3. **依赖归拢**：新依赖写明进 pyproject 哪个 extra（服务端 `[server]`、测试 `[dev]`）
4. **测试随行**：上游对应 test 一并抽入；测试引用的缺失工具函数也收进包

红线（逐条核）：错误走 `ShadowflowError`/`HTTPException(detail={code,message})` 不自造格式；LLM 调用只从 `X-{Provider}-Key` 请求头取 key 不落库；包里零 .env/sqlite/.shadowflow/凭证；SSE 接口支持 `Last-Event-ID` 不设超时。

## 4. 《接入步骤.md》——合入的唯一依据（每包必带，照此写）

```markdown
# 模块 <名称> 接入步骤
来源：上游 <SHA / PR#> ｜ 抽取日期：<日期> ｜ 静态校验：<结果>

## 拷入
将本包内 shadowflow/、tests/ 目录按相同路径复制进项目（本暂存目录届时已位于项目根）。

## 缝合（共 N 处，全部单行插入）
1. shadowflow/server.py include_router 区，找 `app.include_router(_opc_api.router)`
   那行，其后加：app.include_router(_<模块>_api.router)
2. pyproject.toml [project.optional-dependencies] server 列表加："dep==x.y"

## 契约文档补丁（合入时照抄以下文字追加，含 ⏳ 标记）
- 新前端对接契约.md B.2 接口面追加：<一句话>
- B.5 错误码追加：<code> (<状态码>) <语义>
- B.7 相关条目后标注 `⏳ 前端未接入`

## 验证（合入方执行）
pytest -m "not requires_api_key" --tb=short
cd server && npx vitest run --maxWorkers=2
node scripts/dev.mjs --no-open && curl localhost:8002/api/<模块>/...  # 经网关冒烟
```

**关键**：你工作期间不碰项目，契约 ⏳ 标注没法现在打——契约补丁**以文本形式预写在这里**，合入方照抄即可，一条不漏。

## 5. 静态校验（不合入，但要把雷提前排掉）

对每个模块包执行，全过才标 STAGED：

```bash
# 1. 语法编译（不需要装任何依赖）
python3 -m py_compile <包内所有 .py>

# 2. /api 前缀扫描：router 文件里不允许裸路径装饰器
grep -nE '@router\.(get|post|put|delete)\("/' <api文件> | grep -v '"/api'
# 有输出 = 前缀没修干净，回 §3 第 1 条

# 3. import 自洽：包内 import shadowflow.* 的目标必须存在于 reference/backend-snapshot/
# 4. 禁物扫描：包内不得出现 .env、sqlite、.shadowflow、私钥字样
```

可选（推荐）：复制一份快照到 `_verify/`，按接入步骤机械缝合，跑 `pytest -m "not requires_api_key" --tb=short`——提前发现测试级问题，结果写进包的校验字段。用完即删；**_verify 是消耗品，不是工作区**。

## 6. 合入流程（不归你执行；写给将来的合入方）

负责人把本暂存目录**整个拷进项目根目录**后，合入方按以下操作；一批合完，整个暂存目录从项目里移除（或移到项目外存档）：

1. 读 ledger，按日期顺序处理 `STAGED` 模块
2. 照各包《接入步骤.md》拷入 + 单行缝合
3. 全量测试（pytest + vitest），一条不过 → 回退该模块全部改动，ledger 改 `BLOCKED` 附失败摘要
4. 过了 → 照步骤里的契约补丁文本更新《新前端对接契约.md》（含 ⏳）、必要时刷新 `backend-openapi.json`
5. `patches/` 里的 diff 逐个套用，同样过测试门禁
6. 一批合完，汇总输出所有 `FRONTEND-PENDING` 项——这是之后统一改前端的任务清单

## 7. 台账

`ledger.md` 每次扫描追加：

```javascript
| 日期 | 上游 SHA/PR | 类型 | 对象 | 动作 | 状态 |
| 2026-11-08 | a1b2c3 PR#233 | 新功能 | opc 结算模块 | 抽取暂存 | STAGED |
| 2026-11-08 | d4e5f6 PR#235 | 补丁 | groups SSE 重连修复 | diff 暂存 | STAGED |
| 2026-11-08 | g7h8i9 PR#240 | 无关 | 前端设置页改版 | 跳过 | SKIPPED |
```

状态机：`STAGED`（静态校验过）/ `BLOCKED_STATIC`（静态校验就没过，原因写入）/ `BLOCKED`（合入测试不过）/ `APPLIED` / `CONFLICT`（与项目现状分叉，交人裁决）。SYNC_STATE 丢了从 ledger 最后一个 SHA 恢复。

## 8. 红线汇总

- 只写工作目录；reference/ 快照只读；_verify 用完即删
- 产物零前端代码——前端接入只在合入后由负责人统