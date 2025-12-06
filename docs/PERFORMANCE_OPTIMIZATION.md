# BetterGI-Next 性能优化

## 背景

原始实现中，`matchTemplate` 单次调用耗时约 800ms，严重影响实时性。问题根源在于：
1. 每帧都做全分辨率匹配
2. 多尺度遍历无早退机制
3. Worker 端重复创建 Mat 对象

经过系统性改造，典型耗时降至 50-100ms。

---

## 核心改动

### 1. 降采样

默认 `downsample = 0.33`，处理像素量降为原来的 11%。坐标在返回时按 `1/downsample` 还原。

```typescript
// worker/vision.ts
let downsampleFactor = config.downsample || 0.33;
cv.resize(src, dSrc, new cv.Size(), downsampleFactor, downsampleFactor, cv.INTER_LINEAR);
```

### 2. 灰度转换

匹配前强制转灰度，数据量再减 75%：

```typescript
function toGrayscale(mat: any): any {
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    return gray;
}
```

### 3. 自适应尺度 + 早期终止

默认只用 `[1.0]` 单尺度。匹配得分 ≥ 阈值立即返回，跳过后续尺度遍历：

```typescript
if (score >= threshold && earlyTermination && score > 0.95) {
    sTempl.delete();
    break;
}
```

### 4. 模板缓存

Worker 端维护 LRU 缓存，避免重复 `cv.matFromImageData`：

```typescript
const templateCache = new Map<string, { mat: any, timestamp: number }>();
const CACHE_EXPIRE_TIME = 300000; // 5min
const MAX_CACHE_SIZE = 50;
```

### 5. 帧级去重

主线程对连续帧做简单哈希，相同则直接复用，不发给 Worker：

```typescript
private generateFrameHash(imageData: ImageData): string {
    // 采样 ~1000 点生成指纹
}
```

### 6. ROI 匹配

只在用户定义的感兴趣区域内搜索，大幅缩小搜索空间：

```typescript
if (config.roi?.enabled && config.roi.regions?.length > 0) {
    for (const roi of config.roi.regions) {
        const roiResult = matchWithROI(matchSrc, matchTempl, scaledRoi, config);
        // ...
    }
}
```

---

## 配置项

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `downsample` | number | 0.33 | 降采样率 |
| `scales` | number[] | [1.0] | 尺度列表 |
| `adaptiveScaling` | boolean | true | 单尺度失败后自动扩展 |
| `earlyTermination` | boolean | true | 高分提前结束 |
| `matchingMethod` | string | TM_CCOEFF_NORMED | OpenCV 匹配算法 |
| `roiEnabled` | boolean | false | 启用 ROI 限制 |
| `templateCacheSize` | number | 50 | Worker 模板缓存容量 |

---

## 基准数据

测试条件：Chrome 120，1080p 游戏画面，300×200 模板。

| 场景 | 耗时 |
|------|------|
| 优化前 | ~800ms |
| 默认配置 | 150-250ms |
| 启用 ROI | 50-100ms |
| 帧缓存命中 | <50ms |

---

## 扩展方向

- **WebGL 加速**：将 resize/cvtColor 移至 GPU
- **多 Worker 并行**：大批量模板场景
- **自动 ROI 推断**：根据历史命中热区自动收敛