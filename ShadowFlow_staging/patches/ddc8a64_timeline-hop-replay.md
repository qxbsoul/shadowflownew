# ddc8a64_timeline-hop-replay.diff 说明

来源：上游 ddc8a6493dbd66fcaded22306287cb44e0ad18ce（PR #27） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：02/20 ｜ 状态：STAGED

## 作用

timeline replay 增加 hop_update 分支，修复刷新后 hop 卡长期 pending。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/ddc8a64_timeline-hop-replay.diff
git apply patches/ddc8a64_timeline-hop-replay.diff
```

## 暂存适配与验证

无额外适配。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
