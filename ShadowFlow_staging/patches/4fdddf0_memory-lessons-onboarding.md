# 4fdddf0_memory-lessons-onboarding.diff 说明

来源：上游 4fdddf03397582ce2508b82c804a3e60dd80a1ed（PR #34） ｜ 抽取日期：2026-11-07 ｜ 应用顺序：10/20 ｜ 状态：STAGED

## 作用

记忆经验召回进入聊天提示词，并增强入职问卷助理链路。

## 应用

先按 `ledger.md` 的顺序套用前序补丁，再在项目根执行：

```bash
git apply --check patches/4fdddf0_memory-lessons-onboarding.diff
git apply patches/4fdddf0_memory-lessons-onboarding.diff
```

## 暂存适配与验证

适配基准扁平路由。完整套件中 groups-chat-lessons-system 的 DAG 双 agent 断言会被后续 bc12e86 策略收缩影响，见台账。

已于 2026-11-07 从干净基准按 20 份补丁的既定顺序完成 `git apply --check` 与 `git apply` 复验，TypeScript `--noEmit` 通过。完整 Vitest 为 1080 个测试通过、3 个失败；三项均为群聊策略路由与早期双 agent 断言的上游契约冲突，不能宣称完整测试全绿。
