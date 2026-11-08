# 5c5d4d9_whole-thread-replay.diff 说明

来源：上游 5c5d4d9679748729792847762776409e84035918（PR #40） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：15/20 ｜ 状态：STAGED

## 作用

whole-thread 回放保真，turn 线程组装不再盲删末段。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/5c5d4d9_whole-thread-replay.diff
git apply patches/5c5d4d9_whole-thread-replay.diff
```

## 暂存适配与验证

新建测试的 mock/import 已适配基准扁平层级。完整套件中两项双 agent 断言会被后续 bc12e86 策略收缩影响，见台账。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
