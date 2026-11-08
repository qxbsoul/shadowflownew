# bfd7664_group-chat-simplification.diff 说明

来源：上游 bfd76641e2e4cdb62f2e8c2aff40fbd0434ba24e ｜ 抽取日期：2026-11-07 ｜ 应用顺序：13/20 ｜ 状态：STAGED

## 作用

群聊寒暄单人应答、后台过程折叠的服务端逻辑。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/bfd7664_group-chat-simplification.diff
git apply patches/bfd7664_group-chat-simplification.diff
```

## 暂存适配与验证

已剔除与 ddc8a64 重复的 hop_update 实现，仅保留 text_finalize 等新增内容；前端未抽取。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
