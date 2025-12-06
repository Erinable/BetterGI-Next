# 配置参数调试

## 问题

`demo-task.ts` 中模板匹配使用硬编码阈值 `0.9`，UI 面板调整参数不生效。

```typescript
// 问题代码
const res = await this.ctx.algo.findAsync(screen, 'auto_skip_dialog_icon', {
    threshold: 0.9  // 写死
});
```

---

## 修复

改为从 `engine.config` 读取：

```typescript
const res = await this.ctx.algo.findAsync(screen, 'auto_skip_dialog_icon', {
    threshold: this.ctx.engine.config.threshold,
    downsample: this.ctx.engine.config.downsample
});
```

日志输出实际使用的参数：

```typescript
logger.info('task', `Match score=${score.toFixed(3)}, threshold=${this.ctx.engine.config.threshold}`);
```

---

## 测试

1. 打开 UI 面板
2. 调整 **阈值** (0.7 / 0.8 / 0.9)
3. 观察日志中 `threshold=` 是否同步变化
4. 调整 **降采样** 观察识别速度变化

---

## 参数说明

| 参数 | 范围 | 默认 | 说明 |
|------|------|------|------|
| threshold | 0-1 | 0.8 | 匹配置信度阈值 |
| downsample | 0.1-1 | 0.33 | 降采样率，越低越快 |

---

## 预期行为

- 阈值调低 → 更容易命中，但误识别风险增加
- 阈值调高 → 更严格，漏识别风险增加
- 降采样调低 → 速度快，精度下降