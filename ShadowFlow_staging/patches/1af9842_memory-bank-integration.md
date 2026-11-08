# 1af9842_memory-bank-integration.diff 说明

来源：上游 1af984264bd4fc88a5cd620856079b97098b82a7（PR #25） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：01/20 ｜ 状态：STAGED

## 作用

对话框知识库接入多模态记忆库，检索命中后注入 Agent 提示词；包含 ac28fb7、f9828fc、eda61a9 的最终后端内容，避免重复套用。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/1af9842_memory-bank-integration.diff
git apply patches/1af9842_memory-bank-integration.diff
```

## 暂存适配与验证

已按基准目录结构调整；三个早期 SHA 不另出补丁。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
