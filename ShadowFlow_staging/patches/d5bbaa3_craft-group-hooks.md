# d5bbaa3_craft-group-hooks.diff 说明

来源：上游 d5bbaa34625bc7141adbbd04c2613201db678755 ｜ 抽取日期：2026-11-07 ｜ 应用顺序：19/20 ｜ 状态：STAGED

## 作用

将代卖协议标记与产品资料同步挂钩接入既有群聊逻辑。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/d5bbaa3_craft-group-hooks.diff
git apply patches/d5bbaa3_craft-group-hooks.diff
```

## 暂存适配与验证

上下文已缩小以适配基准扁平路由及前置补丁；模块新增文件在 modules/craft-profit，本补丁只含现有文件挂钩。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
