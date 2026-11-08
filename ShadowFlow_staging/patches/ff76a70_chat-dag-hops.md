# ff76a70_chat-dag-hops.diff 说明

来源：上游 ff76a7050112fa74b20cd006b2daccec35bfa674（PR #31） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：07/20 ｜ 状态：STAGED

## 作用

DAG hop 播报收口、approve 回归防线与悬空 hop 终态清扫。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/ff76a70_chat-dag-hops.diff
git apply patches/ff76a70_chat-dag-hops.diff
```

## 暂存适配与验证

仅保留后端与测试。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
