# ShadowFlow 新功能暂存台账

- 扫描日期：2026-11-07
- 上游：`Ravenveil/ShadowFlow`，扫描 HEAD `695f96261828c0a9bf67611ac5d05f06b56214ec`
- 起点：`bd68389`（已在上游完整历史中验证存在）
- 对照基准：`qxbsoul/ShadowFlow_backend` 快照 `911164c3220bf87784d8878195bddecdc68ec671`
- 范围：`shadowflow/`、`server/`、`tests/`、`config/`、`templates/`；前端、Tauri、e2e 与纯仓库/部署杂项不进入产物。
- 状态说明：`STAGED` 按 SOP 表示静态校验通过且补丁可按序套用，不代表完整 Vitest 全绿；已知测试冲突见文末。

| 日期 | 上游 SHA/PR | 类型 | 对象 | 动作 | 状态 |
|---|---|---|---|---|---|
| 2026-11-07 | ac28fb7 | 重复 | 建群即建编队 | 最终后端内容并入 1af9842，不重复出补丁 | SKIPPED |
| 2026-11-07 | df34f0c | 无关 | `_local/` 仓库约定 | 非功能后端，跳过 | SKIPPED |
| 2026-11-07 | c3c7fce | 无关 | BYOK 自定义 provider 前端设置 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | f9828fc | 重复/前端 | 总经理显示名、欢迎语与头像 | 后端最终内容并入 1af9842，前端跳过 | SKIPPED |
| 2026-11-07 | eda61a9 | 重复 | 对话框知识库接记忆库 | 最终后端内容并入 1af9842 | SKIPPED |
| 2026-11-07 | 8cb2ff3 | 无关 | Docker 启动与部署 | 非本次后端功能范围，跳过 | SKIPPED |
| 2026-11-07 | 283e4b0 | 无关 | thinking 卡前端收口 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 62ff81e | 重构 | server 按域归位 | 重构不抽取 | SKIPPED |
| 2026-11-07 | ddc8a64 PR#27 | 补丁 | timeline hop_update 回放 | `ddc8a64_timeline-hop-replay.diff` | STAGED |
| 2026-11-07 | 2d2777f PR#26 | 补丁 | 渠道获客经济性 | `2d2777f_merchant-channel-economics.diff`，仅后端 | STAGED |
| 2026-11-07 | 724cb0f PR#28 | 补丁 | 产品贡献与定价 | `724cb0f_merchant-product-pricing.diff`，仅后端 | STAGED |
| 2026-11-07 | c057404 PR#29 | 补丁 | 单聊多产物与归属 | `c057404_dm-artifacts.diff`，仅后端 | STAGED |
| 2026-11-07 | 1af9842 PR#25 | 补丁 | 记忆库检索注入提示词 | `1af9842_memory-bank-integration.diff`，吸收前序重复提交 | STAGED |
| 2026-11-07 | aa3fcdd | 无关 | DAG 编辑器交互 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 2b4dd70 | 无关 | DAG roster 画布同步 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | b25f2a4 | 无关 | 知识库左侧边栏 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 8631083 PR#30 | 补丁 | 客户贡献与复购 | `8631083_merchant-customer-repeat.diff`，仅后端 | STAGED |
| 2026-11-07 | ff76a70 PR#31 | 补丁 | DAG hop 播报与终态清扫 | `ff76a70_chat-dag-hops.diff` | STAGED |
| 2026-11-07 | 435c64d PR#32 | 补丁 | 过程卡 thinking 标签剥离 | `435c64d_thinking-strip.diff` | STAGED |
| 2026-11-07 | 44ebc3c PR#33 | 补丁 | 群 SSE 断线续传 | `44ebc3c_group-sse-replay.diff` | STAGED |
| 2026-11-07 | 4fdddf0 PR#34 | 补丁 | 经验召回与入职链路 | `4fdddf0_memory-lessons-onboarding.diff` | STAGED |
| 2026-11-07 | 56bbc03 PR#35 | 无关 | busy roster 三态 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 8188a31 PR#37 | 补丁 | 后端测试并行 flaky | `8188a31_conversation-test-flaky.diff` | STAGED |
| 2026-11-07 | 11fc438 PR#38 | 补丁 | 群交接包幂等 | `11fc438_handoff-idempotency.diff` | STAGED |
| 2026-11-07 | bfd7664 | 补丁/前端 | 群聊体验简洁化 | 后端存 `bfd7664_group-chat-simplification.diff`，剔除重复 hop_update；前端跳过 | STAGED |
| 2026-11-07 | 0936b72 PR#36 | 重构 | routes 九域归位 | 重构不抽取，补丁已适配基准扁平路由 | SKIPPED |
| 2026-11-07 | 390e265 | 重构 | 知识库实现归并 | 重构不抽取 | SKIPPED |
| 2026-11-07 | 4b7f9f8 PR#42 | 无关 | Neo 前端与 Docker 占位 | 非后端功能，跳过 | SKIPPED |
| 2026-11-07 | f7d86a4 PR#39 | 无关 | 图谱前端测试时序 | 纯前端测试，跳过 | SKIPPED |
| 2026-11-07 | eb543f0 PR#41 | 补丁 | run event 终态清扫 | `eb543f0_run-event-terminal-sweep.diff` | STAGED |
| 2026-11-07 | 9b909b6 | 无关 | 群消息 GFM 表格 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 8185932 | 无关 | 群消息 GFM 表格续修 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 5c5d4d9 PR#40 | 补丁 | whole-thread 回放保真 | `5c5d4d9_whole-thread-replay.diff` | STAGED |
| 2026-11-07 | ea382f9 PR#43 | 补丁 | @ 提及解析边界 | `ea382f9_mention-boundaries.diff` | STAGED |
| 2026-11-07 | d0d476e PR#44 | 无关 | 入职问卷触发面 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 176f101 PR#45 | 新功能/前端 | 社交发布域 | 后端抽入 `modules/social-publish`，前端跳过 | STAGED |
| 2026-11-07 | 4770393 | 无关 | DAG 编辑器边连接 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | bc12e86 | 补丁 | 群聊意图与策略矩阵 | `bc12e86_group-chat-strategy.diff`；有 3 项上游测试契约冲突，合入前须裁决 | STAGED |
| 2026-11-07 | 7950e1b | 无关 | Docker public 占位 | 非后端功能，跳过 | SKIPPED |
| 2026-11-07 | 81fe7d2 | 重构 | Python API 九域归位 | 重构不抽取 | SKIPPED |
| 2026-11-07 | aea875c | 新功能/前端 | 产品盈利看板 | 后端抽入 `modules/craft-profit`，前端跳过 | STAGED |
| 2026-11-07 | d28ac49 | 无关 | 盈利看板排版 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | f47459b | 无关 | 看板提交按钮换行 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | d59d10d | 无关 | 看板按钮颜色 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 04fdcfb | 新功能/前端 | 语音输入与 Whisper 转写 | 后端抽入 `modules/asr`，前端跳过 | STAGED |
| 2026-11-07 | a25159a PR#46 | 新功能/前端 | 代运营编排与快递履约 | 后端抽入 `modules/ops`，前端跳过 | STAGED |
| 2026-11-07 | 6479765 PR#47 | 新功能 | 六平台 real 发布接线 | 并入 `modules/social-publish` 及随行测试 | STAGED |
| 2026-11-07 | 04f1b66 | 补丁 | 平台工具与能力技能 | `04f1b66_platform-tools.diff`，仅服务端与模板 | STAGED |
| 2026-11-07 | 9cade15 | 新功能 | MiMo chat-audio 转写 | 并入 `modules/asr`；密钥仅取专用 provider 请求头 | STAGED |
| 2026-11-07 | a4094ce | 新功能 | 代卖运营智能体 | 并入 `modules/craft-profit` | STAGED |
| 2026-11-07 | 3c43463 | 无关 | 知识库导航 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 4101142 | 无关 | 看板样式类名冲突 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | 6bc74bc | 无关 | 首页 hero 下线 | 纯前端，跳过 | SKIPPED |
| 2026-11-07 | d5bbaa3 | 新功能/补丁/前端 | 代卖团队、协议标记与资料同步 | 新文件入 `modules/craft-profit`；现有群聊挂钩入 `d5bbaa3_craft-group-hooks.diff`；前端跳过 | STAGED |
| 2026-11-07 | aaa944b | 合并 | memorybank 分支合并 | 合并提交不重复抽取 | SKIPPED |
| 2026-11-07 | 3a00b85 PR#48 | 重复 | NO_API_KEY 契约 | 基准已有等价 NO_API_KEY、免 key provider 与 ACP_UNREACHABLE 实现 | SKIPPED |
| 2026-11-07 | 6f4096b PR#49 | 补丁 | BYOK 自定义 API 地址透传 | `6f4096b_byok-base-url.diff` | STAGED |
| 2026-11-07 | 63d3406 PR#51 | 无关 | 代运营看板前端 | 纯前端，跳过；保留 `⏳ 前端未接入` | SKIPPED |
| 2026-11-07 | 4ce6ff4 | 合并 | memorybank 冲突合并 | 合并提交不重复抽取 | SKIPPED |
| 2026-11-07 | 7bb7130 | 合并 | memorybank 分支合并 | 合并提交不重复抽取 | SKIPPED |
| 2026-11-07 | 21cca62 | 合并 | memorybank 分支合并 | 合并提交不重复抽取 | SKIPPED |
| 2026-11-07 | 695f962 PR#50 | 合并 | memorybank PR 合并 | 已记为本次扫描 HEAD，不重复抽取 | SKIPPED |

## 补丁应用顺序（严格按序）

1. `1af9842_memory-bank-integration.diff`
2. `ddc8a64_timeline-hop-replay.diff`
3. `2d2777f_merchant-channel-economics.diff`
4. `724cb0f_merchant-product-pricing.diff`
5. `c057404_dm-artifacts.diff`
6. `8631083_merchant-customer-repeat.diff`
7. `ff76a70_chat-dag-hops.diff`
8. `435c64d_thinking-strip.diff`
9. `44ebc3c_group-sse-replay.diff`
10. `4fdddf0_memory-lessons-onboarding.diff`
11. `8188a31_conversation-test-flaky.diff`
12. `11fc438_handoff-idempotency.diff`
13. `bfd7664_group-chat-simplification.diff`
14. `eb543f0_run-event-terminal-sweep.diff`
15. `5c5d4d9_whole-thread-replay.diff`
16. `ea382f9_mention-boundaries.diff`
17. `bc12e86_group-chat-strategy.diff`
18. `04f1b66_platform-tools.diff`
19. `d5bbaa3_craft-group-hooks.diff`
20. `6f4096b_byok-base-url.diff`

## 暂存验证记录

- 四个模块共检查 119 个相对 TypeScript import，包内/基准依赖闭包与禁物扫描通过；产物不含前端、数据库或凭证文件。
- 最终 20 份补丁已在独立干净基准副本中按上表顺序逐份执行 `git apply --check` 与 `git apply`，全部成功。输出仅有上游文本已有的行尾空白警告，不影响套用。
- 验证副本中按接入步骤插入 4 个 import 和 4 个挂载后，TypeScript `tsc --noEmit` 通过。
- 四个模块的 9 个测试文件、98 个定向测试全部通过。
- 完整 Vitest 最终结果：157 个测试文件中 155 个通过、2 个失败；1083 个测试中 1080 个通过、3 个失败。
- 失败项：`groups-chat-lessons-system.test.ts` 1 项、`groups-chat-turn-thread.test.ts` 2 项，均因早期测试预期两个 agent 执行，而后续 `bc12e86` 策略矩阵将任务收缩为一个 agent。上游最终群聊实现与这些测试仍保留同一不一致；本次未擅改上游行为。合入 `bc12e86` 前必须确认应保留策略收缩还是恢复双 agent 契约，再同步实现与测试。
- 首轮完整测试另有 5 个 Claw 安装器失败，原因为独立 Node 22 未加入测试进程 `PATH`，报 `PM_NOT_FOUND`；修正测试运行环境后这 5 项全部通过，不属于代码或补丁失败。
- 网关冒烟需在真实项目合入后执行，暂存阶段未对真实项目做任何写入。

## FRONTEND-PENDING

`social-publish`、`ops`、`asr`、`craft-profit` 均保留 `⏳ 前端未接入`；混合 PR 仅抽后端，所有纯前端提交均未进入模块或补丁。
