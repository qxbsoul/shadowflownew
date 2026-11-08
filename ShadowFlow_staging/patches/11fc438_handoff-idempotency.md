# 11fc438_handoff-idempotency.diff 说明

来源：上游 11fc43857030a7e0637738ff3c05fd12f0f74e4e（PR #38） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：12/20 ｜ 状态：STAGED

## 作用

群回合交接包去重防自环，shift_id 作为真实幂等锚。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/11fc438_handoff-idempotency.diff
git apply patches/11fc438_handoff-idempotency.diff
```

## 暂存适配与验证

适配基准扁平路由。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
