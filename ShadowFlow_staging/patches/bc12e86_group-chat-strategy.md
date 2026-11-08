# bc12e86_group-chat-strategy.diff 说明

来源：上游 bc12e86fcbe4eaca46d28f71fa59a6bc5451597a ｜ 抽取日期：2026-11-07 ｜ 应用顺序：17/20 ｜ 状态：STAGED

## 作用

群聊意图识别与策略矩阵路由，按 DAG/矩阵拆工单并收缩执行 agent。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/bc12e86_group-chat-strategy.diff
git apply patches/bc12e86_group-chat-strategy.diff
```

## 暂存适配与验证

适配基准扁平路由及测试 import。上游最终代码仍保留 3 个早期双 agent 断言与策略收缩的冲突；本次未擅改上游行为，完整测试 1080/1083 通过，合入方需先裁决该契约。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
