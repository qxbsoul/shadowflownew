# 6f4096b_byok-base-url.diff 说明

来源：上游 6f4096b1ae8a7af191035cef7e96b895f21b52cf（PR #49） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：20/20 ｜ 状态：STAGED

## 作用

BYOK 自定义 API 地址透传到 byok:* 执行器。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/6f4096b_byok-base-url.diff
git apply patches/6f4096b_byok-base-url.diff
```

## 暂存适配与验证

仅保留后端与测试。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
