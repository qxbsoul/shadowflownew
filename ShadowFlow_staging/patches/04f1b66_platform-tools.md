# 04f1b66_platform-tools.diff 说明

来源：上游 04f1b6631b647f10a2c3484c07d69c41f19cd799 ｜ 抽取日期：2026-11-07 ｜ 应用顺序：18/20 ｜ 状态：STAGED

## 作用

补齐 WorkBuddy 八平台工具、web_search 增强与九项能力技能。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/04f1b66_platform-tools.diff
git apply patches/04f1b66_platform-tools.diff
```

## 暂存适配与验证

仅保留服务端工具、技能模板与后端测试。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
