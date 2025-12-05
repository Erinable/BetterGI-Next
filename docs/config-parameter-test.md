# 配置参数测试指南

## 🎯 问题描述

修复前，demo-task 中的模板匹配使用硬编码的阈值 `0.9`，不响应 UI 面板上的参数调整。

## 🔧 修复内容

### 修复前的问题
```typescript
// ❌ 硬编码阈值，UI 面板参数无效
const res = await this.ctx.algo.findAsync(screen, 'auto_skip_dialog_icon', {
    threshold: 0.9  // 固定值
});
```

### 修复后的代码
```typescript
// ✅ 使用 UI 面板配置的参数
const res = await this.ctx.algo.findAsync(screen, 'auto_skip_dialog_icon', {
    threshold: this.ctx.engine.config.threshold,     // UI 面板阈值
    downsample: this.ctx.engine.config.downsample   // UI 面板降采样
});

// 日志中显示实际使用的参数，便于调试
logger.info('task', `Found dialog (confidence: ${score.toFixed(3)}, threshold: ${this.ctx.engine.config.threshold}, downsample: ${this.ctx.engine.config.downsample}), skipping...`);
```

## 🧪 测试方法

### 1. 调整 UI 面板参数
1. 打开 BetterGi UI 面板
2. 调整以下参数：
   - **阈值 (threshold)**: 尝试 0.7, 0.8, 0.9 等不同值
   - **降采样 (downsample)**: 尝试 2, 3, 4 等值

### 2. 观察日志输出
现在日志会显示：
```
Found dialog (confidence: 0.872, threshold: 0.8, downsample: 2), skipping...
```

### 3. 验证效果
- **降低阈值**: 应该更容易识别到对话框，可能增加误识别
- **提高阈值**: 应该更严格识别，减少误识别
- **调整降采样**: 影响匹配性能和精度

## 🎮 UI 面板参数说明

### 阈值 (threshold)
- **范围**: 0.0 - 1.0
- **含义**: 匹配置信度阈值
- **推荐值**: 0.7-0.9
- **效果**:
  - 0.7: 更宽松，容易识别
  - 0.9: 更严格，减少误报

### 降采样 (downsample)
- **范围**: 1-4
- **含义**: 图像缩放比例
- **推荐值**: 2-3
- **效果**:
  - 1: 原始分辨率，慢但精确
  - 4: 1/4分辨率，快但粗糙

## 📊 预期行为

现在 demo-task 会：
1. ✅ **响应 UI 面板参数**: 阈值和降采样变化会影响匹配行为
2. ✅ **显示配置信息**: 日志中明确显示使用的参数值
3. ✅ **提供调试信息**: 包含置信度、阈值、降采样等关键信息

## 🔍 故障排除

如果参数调整无效：
1. **检查日志**: 确认日志中显示的参数值与 UI 面板一致
2. **检查初始化**: 确保任务正确注册和启动
3. **检查模板**: 确认模板图片已正确加载

---

**结论**: demo-task 现在完全响应 UI 面板参数配置！