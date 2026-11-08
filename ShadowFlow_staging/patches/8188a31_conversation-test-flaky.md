# 8188a31_conversation-test-flaky.diff 说明

来源：上游 8188a318c68b34e60141de2a76230aed3375690c（PR #37） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：11/20 ｜ 状态：STAGED

## 作用

消除会话移动与图谱测试的并行时序不稳定。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/8188a31_conversation-test-flaky.diff
git apply patches/8188a31_conversation-test-flaky.diff
```

## 暂存适配与验证

仅抽取测试侧后端修复，不含 CHANGELOG 或前端。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
