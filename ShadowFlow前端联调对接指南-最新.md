# ShadowFlow 工作台前端 · 联调对接指南

> **优先级声明**：本文档不重新定义任何契约。一切以 `qxbsoul/ShadowFlow_backend` 仓根的《新前端对接契约.md》和 `backend-openapi.json` 为准；两者冲突时以活后端实际行为为准。本文只解决一件事：**这套已生成的 React 工程（shadowflow-react）具体改哪里、怎么改、按什么顺序，才能接到后端上。**

适用对象：拿到 `shadowflow-react` 压缩包、要与 ShadowFlow 后端联调的前端 agent。

---

## 0. 这套前端现状（已验收的一期）

- Vite + React 18 + TypeScript（strict），依赖只有 react/react-dom，无路由库（store 切视图），无 UI 框架，样式全在 `src/styles.css`
- 6 个视图：工作台 / 组织架构 / 定时任务 / 交付成果 / 数据看板 / 知识库（「设计规范」屏未实现，二期不做）
- 假数据在 `src/data.ts`，业务逻辑和交互仿真全在 `src/store.ts`
- 唯一的网络请求：`store.ts` 里对 Gateway 的 `/health` 探测（显示侧边栏"Gateway 已连接 / 演示数据"状态灯）
- 一期红线已遵守：无自建后端、无假接口文件、图表纯 CSS/SVG

**联调 = 把 `store.ts` 里的仿真逻辑换成真 API 调用，视觉和组件结构一律不动。**

## 1. 联调前置改动（先做这 5 步，再做接口对接）

### 1.1 vite 代理（`vite.config.ts`）

```ts
server: {
  host: '0.0.0.0',
  port: 3007,
  proxy: {
    '/api': { target: 'http://localhost:8002', changeOrigin: true },
  },
},
```

### 1.2 health 探测改相对路径（`store.ts` 末尾的 useEffect）

```ts
const api = new URLSearchParams(window.location.search).get('api') ?? '';
fetch((api.replace(/\/$/, '')) + '/api/health', ...)
```

（`:8002/health` 被网关挂载在 `/api` 下，且默认空串走同源代理。`?api=` 覆盖参数保留。）

### 1.3 起一个 `src/api.ts`

集中放：base 拼接、fetch 封装（注入 BYOK header、解错误信封）、SSE/轮询客户端。`store.ts` 只调这里，不出现裸 fetch。

### 1.4 后端就绪顺序

```bash
# 后端仓（qxbsoul/ShadowFlow_backend）
pip install -e ".[server,dev]"   # Python 侧依赖
python -m uvicorn shadowflow.server:app --port 8000 &
cd server && npm install && npm run dev   # Node 网关 :8002
curl localhost:8002/api/health           # 通了就绪
```

首次跑业务前调一次 `POST /api/opc/seed` 初始化演示公司数据。

### 1.5 已知的后端缺口（绕过，不要自己修后端）

**`/api/workflow/runs/{run_id}/events`（契约 B.4 的 SSE）当前会 404**：Python 侧该路由注册为 `/workflow/runs/{run_id}/events`（无 `/api` 前缀），网关转发时又统一补回 `/api`，两端对不上；同理整个 `/workflow/*` 系列都有这个问题。这是后端要补的别名，前端**不要**调这个系列。工作台的全部需求用 `/api/opc/*` + `/api/schedules` + `/api/knowledge/packs` 即可满足（见第 2 节）。若联调后期确实需要 workflow 能力，找后端负责人在 Python 给这些路由加 `/api` 前缀的别名装饰器，前端再切换。

## 2. mock → 真实接口映射（按 store.ts 数据源逐项替换）

> openapi 快照对这些接口只标了 summary、**响应体没有 schema**。字段以活后端返回为准；必要时读后端仓 `shadowflow/api/opc.py`、`shadowflow/services/opc_*.py` 确认。

| store.ts 状态 | 页面 | 换成 | 方式 |
|---|---|---|---|
| `messages` / `sendChat` / `ceoRespond`（关键词仿真） | 工作台对话 | `POST /api/opc/orders` 创建订单（payload 含需求描述），返回 `order_id` | 一次性 POST |
| `activities` / `startRun`（setInterval 假推进） | 公司现场「AI 在做什么」 | `GET /api/opc/orders/{order_id}/events?since=N` 增量拉事件，`since` 用已收到的条数，返回 `{order_id, status, items}` **JSON 轮询，不是 SSE** | 每 1.5~2s 轮询，订单 status 变终态即停 |
| `deliverables` / `seedDeliverables` | 交付成果 | `GET /api/opc/orders`（limit 参数） | 进入视图时拉 + 轮询/手动刷新 |
| `org` / 全部增删改（createDept/hire/fire 等） | 组织架构 | `GET /api/opc/companies` 拿 company_id → `GET /api/opc/company/{id}/org`（结构）+ `/roster`（花名册）；变更用 `POST .../departments`、`POST .../employees`、`POST .../employees/{eid}/fire` 等 | 读：进视图时；写：对应 mutation |
| `tasks` / `seedTasks` | 定时任务 | `GET /api/schedules`、`POST /api/schedules`、`DELETE /api/schedules/{id}` | 读：进视图时；写：对应操作 |
| `knowledge` | 知识库 | `GET /api/knowledge/packs` | 进视图时 |
| 看板 4 个 KPI / 图表 | 数据看板 | `GET /api/dashboard`（Node 网关路由，openapi 里没有是正常的）+ `GET /api/opc/company/{id}/pnl`、`/income` | 进视图时 |
| 工作台顶栏「模型」选择 | — | `GET /api/opc/models` | 启动时一次 |

替换纪律：

- `data.ts` 的 seed 保留作为"Gateway 未连接"时的演示回退（状态灯已有此语义），接口失败降级到 seed 并维持现有"演示数据"提示
- 轮询只在对应视图激活时跑，离开视图清定时器（参照现有 `view` 切换逻辑）
- 请求未成功前不得本地伪造成功状态（如审批、交付）；`createTask` 里写死的日期 `2026/11/08` 一并清掉

## 3. BYOK 接入（契约 B.3，安全红线）

工作台顶栏有模型选择（`mimo-v2.6-pro`），说明要发 LLM 请求。按契约：

- 14 个 provider 的 key 只存浏览器 localStorage：`sf_{provider}_key`（provider ∈ anthropic / openai / deepseek / zhipu / mimo / google / qwen / moonshot / mistral / groq / openrouter / ollama / lmstudio / azure），默认选择存 `sf_default_provider`
- **最小披露**：一个请求只带当前选中 provider 的那一个 header，格式 `X-{Provider}-Key`（如 `X-Mimo-Key`），key 永不上传服务器存储，后端即用即弃
- 在 `src/api.ts` 里用 fetch 拦截器统一注入，禁止逐请求手写 header

骨架（贴合本工程结构）：

```ts
const PROVIDERS = ['anthropic','openai','deepseek','zhipu','mimo','google','qwen',
  'moonshot','mistral','groq','openrouter','ollama','lmstudio','azure'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const provider = localStorage.getItem('sf_default_provider');
  const headers = new Headers(init.headers);
  if (provider && PROVIDERS.includes(provider)) {
    const key = localStorage.getItem(`sf_${provider}_key`);
    if (key) headers.set(`X-${cap(provider)}-Key`, key);  // 只发当前 provider 这一个
  }
  return fetch(path, { ...init, headers });
}
```

## 4. 错误与已知业务语义（契约 B.5 / B.7）

- 统一错误信封 `{"error":{"code","message","trace_id"}}`，`api.ts` 里解析后按 code 分发
- `PYTHON_BACKEND_UNAVAILABLE`（503）：显示"后端离线"，降级演示数据，不白屏（现有状态灯逻辑扩展）
- `NO_API_KEY`（401）：引导用户在设置里补当前 provider 的 key，**不要重试轰炸**；流式场景错误在错误帧里
- 429 限流 / `POLICY_VIOLATION`（403）/ `STATE_CONFLICT`（409）：正常业务状态，展示原因和下一步操作，不用无上下文弹窗——工作台右侧「错误与原因」面板就是给这个用的
- 审批闭环若后续接入：`GET /api/opc/company/{id}/approvals?status=pending` + `POST /api/opc/approvals/{id}/decide`；请求未成功前不得本地伪造 resolved

## 5. 二期边界（不要做的事）

- 不改视觉：配色/间距/全直角风格/`Space Grotesk` 标题字体维持现状
- 不加设计规范页、不加 login 页（访客即可用）
- 不引入路由库、不拆组件结构（一期已验收，别返工）
- 不直连 Python `:8000`，前端只认 `/api/**`（契约 B.1）
- 发现接口行为和文档不一致时，记录现象找后端负责人，不改后端
