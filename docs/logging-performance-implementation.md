# 日志与性能监控系统

## 架构

```
src/core/
├── logging/
│   ├── types.ts   # LogLevel, LogEntry 类型定义
│   └── logger.ts  # Logger 单例
├── performance/
│   ├── types.ts   # PerformanceMetrics 类型
│   └── monitor.ts # PerformanceMonitor 单例
└── storage/
    └── manager.ts # IndexedDB/localStorage 封装
```

---

## 日志系统

### 级别

DEBUG < INFO < WARN < ERROR < FATAL

### 使用

```typescript
import { logger } from './core/logging/logger';

logger.info('vision', 'Video locked', { width: 1920, height: 1080 });
logger.error('engine', 'Task failed', { error });
```

### 性能日志

```typescript
const end = logger.startPerformanceLog('template_match', 'vision');
// ... do work
end(); // 自动记录耗时
```

### 输出格式

控制台输出带时间戳、类别、级别的结构化日志。生产环境可通过 `logger.setLevel()` 屏蔽 DEBUG。

---

## 性能监控

### 核心指标

```typescript
interface PerformanceMetrics {
    matchCount: number;
    avgMatchTime: number;
    cacheHitRate: number;
    roiUsageRate: number;
    adaptiveScalingSuccessRate: number;
}
```

### 采集入口

```typescript
import { performanceMonitor } from './core/performance/monitor';

// 记录单次匹配
performanceMonitor.recordMatchSimple(duration, { score, usedROI, ... });

// 记录缓存
performanceMonitor.recordCacheHit();
performanceMonitor.recordCacheMiss();
```

### 查询

```typescript
const stats = performanceMonitor.getPerformanceStats();
```

---

## 存储管理

### 策略

- 日志：保留 30 天，上限 50,000 条
- 性能数据：上限 10,000 条
- 过期数据每 5 分钟自动清理

### 导出

```typescript
import { storageManager } from './core/storage/manager';
const json = await storageManager.exportLogs('json');
```

---

## UI 集成

`PerformancePanel` 组件订阅 `EVENTS.PERFORMANCE_METRICS_UPDATE`，每 2 秒刷新：

- 平均匹配耗时
- 缓存命中率
- ROI 使用率
- 异常警报

`DebugLayer` 在画面上叠加实时 HUD，显示当前匹配得分和盒框。

---

## 事件

| 事件 | 触发时机 |
|------|----------|
| `PERFORMANCE_METRICS_UPDATE` | 指标变化 |
| `PERFORMANCE_WORKER_STATS` | Worker 统计返回 |
| `PERFORMANCE_CACHE_HIT` | 缓存命中 |
| `PERFORMANCE_CACHE_MISS` | 缓存未命中 |

---

## 开关

```typescript
// 关闭性能监控（减少开销）
performanceMonitor.setEnabled(false);

// 或通过配置
configManager.set('performanceMonitoring', false);
```