# eb543f0_run-event-terminal-sweep.diff 说明

来源：上游 eb543f041fbaa8032f0a4c831423709866129220（PR #41） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：14/20 ｜ 状态：STAGED

## 作用

运行事件终态清扫收口 plan 卡任务行，避免崩溃恢复后持续转圈。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/eb543f0_run-event-terminal-sweep.diff
git apply patches/eb543f0_run-event-terminal-sweep.diff
```

## 暂存适配与验证

仅保留后端与测试。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
