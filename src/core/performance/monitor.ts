/**
 * 性能监控核心实现
 */

import { PerformanceMetrics, MatchRecord, FrameRecord, CacheRecord, PerformanceAlert, PerformanceRecommendation, PerformanceConfig } from './types';
import { logger } from '../logging/logger';

export class PerformanceMonitor {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics;
  private matchRecords: MatchRecord[] = [];
  private frameRecords: FrameRecord[] = [];
  private cacheRecords: CacheRecord[] = [];
  private alerts: PerformanceAlert[] = [];
  private sessionStartTime: number;
  private lastCleanupTime: number;
  private measurementStack: Map<string, number> = new Map();
  private memoryBaseline: number = 0;

  constructor(config?: Partial<PerformanceConfig>) {
    this.config = {
      enabled: true,
      realTimeMonitoring: true,
      detailedLogging: true,
      thresholds: {
        matchTime: { warning: 200, critical: 500 },
        memoryUsage: { warning: 100 * 1024 * 1024, critical: 200 * 1024 * 1024 }, // 100MB, 200MB
        cacheHitRate: { warning: 50, critical: 30 },
        frameRate: { warning: 30, critical: 15 }
      },
      maxRecords: {
        matches: 1000,
        frames: 500,
        cache: 1000,
        alerts: 100
      },
      autoOptimization: true,
      adaptiveThresholds: true,
      enableReports: true,
      reportInterval: 30, // 30分钟
      enableAlerts: true,
      ...config
    };

    this.sessionStartTime = Date.now();
    this.lastCleanupTime = Date.now();
    this.memoryBaseline = this.getCurrentMemoryUsage();
    this.metrics = this.initializeMetrics();

    // 启动定期清理和报告
    this.startPeriodicTasks();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      matchCount: 0,
      totalMatchTime: 0,
      averageMatchTime: 0,
      bestMatchTime: Infinity,
      worstMatchTime: 0,
      frameCount: 0,
      averageFrameTime: 0,
      droppedFrames: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      roiMatches: 0,
      fullScreenMatches: 0,
      adaptiveScalingAttempts: 0,
      adaptiveScalingSuccesses: 0,
      memoryUsage: 0,
      peakMemoryUsage: 0,
      timestamp: Date.now(),
      sessionStartTime: this.sessionStartTime
    };
  }

  private startPeriodicTasks(): void {
    // 每30秒更新一次指标
    setInterval(() => {
      if (this.config.enabled) {
        this.updateMetrics();
        this.checkThresholds();
      }
    }, 30000);

    // 每5分钟清理一次旧记录
    setInterval(() => {
      if (this.config.enabled) {
        this.cleanupRecords();
      }
    }, 5 * 60 * 1000);

    // 定期生成报告
    if (this.config.enableReports) {
      setInterval(() => {
        if (this.config.enabled) {
          this.generateReport();
        }
      }, this.config.reportInterval * 60 * 1000);
    }
  }

  // 性能测量方法
  startMeasurement(operation: string, category: string = 'general'): () => void {
    const startTime = performance.now();
    const startMemory = this.getCurrentMemoryUsage();
    const key = `${category}:${operation}`;

    this.measurementStack.set(key, startTime);

    logger.debug('performance', `Starting measurement: ${operation}`, {
      category,
      startMemory,
      timestamp: Date.now()
    }, ['measurement']);

    return (): void => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      const endMemory = this.getCurrentMemoryUsage();
      const memoryDelta = endMemory - startMemory;

      this.measurementStack.delete(key);

      this.recordOperation({
        operation,
        category,
        duration,
        memoryDelta,
        timestamp: Date.now()
      });

      logger.debug('performance', `Completed measurement: ${operation}`, {
        category,
        duration,
        memoryDelta,
        timestamp: Date.now()
      }, ['measurement']);

      // 检查是否超过阈值
      if (operation.includes('match') && duration > this.config.thresholds.matchTime.warning) {
        this.createAlert('warning', 'Match Performance', `Slow match detected: ${duration.toFixed(2)}ms`, 'matchTime', this.config.thresholds.matchTime.warning, duration);
      }
    };
  }

  private recordOperation(record: any): void {
    if (record.category === 'vision' && record.operation.includes('match')) {
      this.recordMatch({
        timestamp: record.timestamp,
        duration: record.duration,
        score: 0, // 需要从实际匹配结果中获取
        scale: 1.0,
        useROI: false,
        templateSize: { width: 0, height: 0 },
        usedAdaptiveScaling: false,
        operation: record.operation,
        category: record.category
      });
    }
  }

  // 匹配性能记录
  recordMatch(record: Omit<MatchRecord, 'timestamp'>): void {
    const matchRecord: MatchRecord = {
      timestamp: Date.now(),
      ...record
    };

    this.matchRecords.push(matchRecord);
    this.metrics.matchCount++;
    this.metrics.totalMatchTime += record.duration;
    this.metrics.averageMatchTime = this.metrics.totalMatchTime / this.metrics.matchCount;
    this.metrics.bestMatchTime = Math.min(this.metrics.bestMatchTime, record.duration);
    this.metrics.worstMatchTime = Math.max(this.metrics.worstMatchTime, record.duration);

    if (record.useROI) {
      this.metrics.roiMatches++;
    } else {
      this.metrics.fullScreenMatches++;
    }

    if (record.usedAdaptiveScaling) {
      this.metrics.adaptiveScalingAttempts++;
      // 假设成功使用了自适应缩放
      this.metrics.adaptiveScalingSuccesses++;
    }

    // 更新内存使用
    this.updateMemoryUsage();

    logger.debug('performance', 'Match recorded', {
      duration: record.duration,
      score: record.score,
      useROI: record.useROI,
      totalMatches: this.metrics.matchCount
    }, ['match']);

    // 检查记录数量限制
    if (this.matchRecords.length > this.config.maxRecords.matches) {
      this.matchRecords = this.matchRecords.slice(-this.config.maxRecords.matches);
    }
  }

  // 帧性能记录
  recordFrame(record: Omit<FrameRecord, 'timestamp'>): void {
    const frameRecord: FrameRecord = {
      timestamp: Date.now(),
      ...record
    };

    this.frameRecords.push(frameRecord);
    this.metrics.frameCount++;
    this.metrics.averageFrameTime = (this.metrics.averageFrameTime * (this.metrics.frameCount - 1) + record.processTime) / this.metrics.frameCount;

    if (record.duplicate) {
      logger.debug('performance', 'Duplicate frame detected', {
        captureTime: record.captureTime,
        processTime: record.processTime,
        hash: record.hash
      }, ['frame', 'duplicate']);
    }

    // 检查记录数量限制
    if (this.frameRecords.length > this.config.maxRecords.frames) {
      this.frameRecords = this.frameRecords.slice(-this.config.maxRecords.frames);
    }
  }

  // 缓存性能记录
  recordCacheHit(type: 'template' | 'frame' | 'result', key: string, accessTime?: number): void {
    this.metrics.cacheHits++;
    this.updateCacheHitRate();

    const cacheRecord: CacheRecord = {
      timestamp: Date.now(),
      type,
      hit: true,
      key,
      accessTime
    };

    this.cacheRecords.push(cacheRecord);

    logger.debug('performance', `Cache hit: ${type}`, { key, accessTime }, ['cache', 'hit']);

    if (this.cacheRecords.length > this.config.maxRecords.cache) {
      this.cacheRecords = this.cacheRecords.slice(-this.config.maxRecords.cache);
    }
  }

  recordCacheMiss(type: 'template' | 'frame' | 'result', key: string): void {
    this.metrics.cacheMisses++;
    this.updateCacheHitRate();

    const cacheRecord: CacheRecord = {
      timestamp: Date.now(),
      type,
      hit: false,
      key
    };

    this.cacheRecords.push(cacheRecord);

    logger.debug('performance', `Cache miss: ${type}`, { key }, ['cache', 'miss']);

    if (this.cacheRecords.length > this.config.maxRecords.cache) {
      this.cacheRecords = this.cacheRecords.slice(-this.config.maxRecords.cache);
    }
  }

  private updateCacheHitRate(): void {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
  }

  private getCurrentMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  private updateMemoryUsage(): void {
    const currentUsage = this.getCurrentMemoryUsage();
    this.metrics.memoryUsage = currentUsage - this.memoryBaseline;
    this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, this.metrics.memoryUsage);
  }

  private updateMetrics(): void {
    this.updateMemoryUsage();
    this.metrics.timestamp = Date.now();
  }

  // 阈值检查
  private checkThresholds(): void {
    if (!this.config.enableAlerts) return;

    // 检查匹配时间
    if (this.metrics.averageMatchTime > this.config.thresholds.matchTime.critical) {
      this.createAlert('error', 'Match Performance Critical', `Average match time is critically slow: ${this.metrics.averageMatchTime.toFixed(2)}ms`, 'matchTime', this.config.thresholds.matchTime.critical, this.metrics.averageMatchTime);
    } else if (this.metrics.averageMatchTime > this.config.thresholds.matchTime.warning) {
      this.createAlert('warning', 'Match Performance Warning', `Average match time is slow: ${this.metrics.averageMatchTime.toFixed(2)}ms`, 'matchTime', this.config.thresholds.matchTime.warning, this.metrics.averageMatchTime);
    }

    // 检查内存使用
    if (this.metrics.memoryUsage > this.config.thresholds.memoryUsage.critical) {
      this.createAlert('error', 'Memory Usage Critical', `Memory usage is critically high: ${(this.metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`, 'memoryUsage', this.config.thresholds.memoryUsage.critical, this.metrics.memoryUsage);
    } else if (this.metrics.memoryUsage > this.config.thresholds.memoryUsage.warning) {
      this.createAlert('warning', 'Memory Usage Warning', `Memory usage is high: ${(this.metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`, 'memoryUsage', this.config.thresholds.memoryUsage.warning, this.metrics.memoryUsage);
    }

    // 检查缓存命中率
    if (this.metrics.cacheHitRate < this.config.thresholds.cacheHitRate.critical) {
      this.createAlert('error', 'Cache Hit Rate Critical', `Cache hit rate is critically low: ${this.metrics.cacheHitRate.toFixed(1)}%`, 'cacheHitRate', this.config.thresholds.cacheHitRate.critical, this.metrics.cacheHitRate);
    } else if (this.metrics.cacheHitRate < this.config.thresholds.cacheHitRate.warning) {
      this.createAlert('warning', 'Cache Hit Rate Warning', `Cache hit rate is low: ${this.metrics.cacheHitRate.toFixed(1)}%`, 'cacheHitRate', this.config.thresholds.cacheHitRate.warning, this.metrics.cacheHitRate);
    }
  }

  private createAlert(level: 'info' | 'warning' | 'error', title: string, message: string, metric: string, threshold: number, currentValue: number): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      title,
      message,
      metric,
      threshold,
      currentValue,
      suggestions: this.generateSuggestions(metric, currentValue, threshold)
    };

    this.alerts.push(alert);

    logger.warn('performance', `Performance alert: ${title}`, {
      level,
      metric,
      threshold,
      currentValue,
      suggestions: alert.suggestions
    }, ['alert']);

    // 触发警报事件
    this.dispatchEvent('performanceAlert', alert);

    if (this.alerts.length > this.config.maxRecords.alerts) {
      this.alerts = this.alerts.slice(-this.config.maxRecords.alerts);
    }
  }

  private generateSuggestions(metric: string, currentValue: number, threshold: number): string[] {
    const suggestions: string[] = [];

    switch (metric) {
      case 'matchTime':
        suggestions.push(
          'Consider reducing template image size',
          'Enable adaptive scaling',
          'Use ROI (Region of Interest) matching',
          'Optimize matching algorithm parameters'
        );
        break;
      case 'memoryUsage':
        suggestions.push(
          'Reduce cache size',
          'Clear unused templates',
          'Enable more aggressive cleanup',
          'Reduce frame buffer size'
        );
        break;
      case 'cacheHitRate':
        suggestions.push(
          'Increase cache size',
          'Optimize cache key generation',
          'Review cache invalidation strategy',
          'Consider different caching strategy'
        );
        break;
    }

    return suggestions;
  }

  private dispatchEvent(eventType: string, data: any): void {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    }
  }

  // 生成性能建议
  generateRecommendations(): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    // 匹配性能建议
    if (this.metrics.averageMatchTime > 150) {
      recommendations.push({
        id: `rec_${Date.now()}_match_performance`,
        type: 'performance',
        priority: this.metrics.averageMatchTime > 300 ? 'high' : 'medium',
        title: 'Optimize Match Performance',
        description: 'Average match time is higher than optimal. Consider enabling adaptive scaling and ROI matching.',
        expectedImpact: 'Reduce average match time by 40-60%',
        implementation: 'Enable adaptiveScaling and useRegionOfInterest in configuration',
        metrics: {
          before: this.metrics.averageMatchTime,
          after: this.metrics.averageMatchTime * 0.5,
          improvement: 50
        }
      });
    }

    // 缓存性能建议
    if (this.metrics.cacheHitRate < 60) {
      recommendations.push({
        id: `rec_${Date.now()}_cache_optimization`,
        type: 'cache',
        priority: this.metrics.cacheHitRate < 40 ? 'high' : 'medium',
        title: 'Improve Cache Hit Rate',
        description: 'Cache hit rate is below optimal. Consider increasing cache size and optimizing cache keys.',
        expectedImpact: 'Improve cache hit rate to 70-80%',
        implementation: 'Increase templateCacheSize and enable frame caching'
      });
    }

    // 内存使用建议
    if (this.metrics.memoryUsage > 50 * 1024 * 1024) { // 50MB
      recommendations.push({
        id: `rec_${Date.now()}_memory_optimization`,
        type: 'memory',
        priority: this.metrics.memoryUsage > 100 * 1024 * 1024 ? 'high' : 'medium',
        title: 'Reduce Memory Usage',
        description: 'Memory usage is high. Consider reducing cache sizes and enabling more frequent cleanup.',
        expectedImpact: 'Reduce memory usage by 30-50%',
        implementation: 'Reduce cache sizes and enable aggressive cleanup'
      });
    }

    return recommendations;
  }

  // 清理记录
  private cleanupRecords(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // 清理一小时前的记录
    this.matchRecords = this.matchRecords.filter(record => record.timestamp > oneHourAgo);
    this.frameRecords = this.frameRecords.filter(record => record.timestamp > oneHourAgo);
    this.cacheRecords = this.cacheRecords.filter(record => record.timestamp > oneHourAgo);

    this.lastCleanupTime = now;

    logger.debug('performance', 'Records cleaned up', {
      matchRecords: this.matchRecords.length,
      frameRecords: this.frameRecords.length,
      cacheRecords: this.cacheRecords.length
    }, ['cleanup']);
  }

  // 生成报告
  private generateReport(): void {
    // 实现报告生成逻辑
    logger.info('performance', 'Performance report generated', this.metrics);
  }

  // 公共API
  getMetrics(): PerformanceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  getMatchRecords(limit?: number): MatchRecord[] {
    return limit ? this.matchRecords.slice(-limit) : [...this.matchRecords];
  }

  getFrameRecords(limit?: number): FrameRecord[] {
    return limit ? this.frameRecords.slice(-limit) : [...this.frameRecords];
  }

  getCacheRecords(limit?: number): CacheRecord[] {
    return limit ? this.cacheRecords.slice(-limit) : [...this.cacheRecords];
  }

  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('performance', 'Performance monitor config updated', { config: this.config });
  }

  reset(): void {
    this.metrics = this.initializeMetrics();
    this.matchRecords = [];
    this.frameRecords = [];
    this.cacheRecords = [];
    this.alerts = [];
    this.sessionStartTime = Date.now();
    this.memoryBaseline = this.getCurrentMemoryUsage();

    logger.info('performance', 'Performance monitor reset');
  }

  // 获取最近的性能统计
  getRecentStats(minutes: number = 5): Partial<PerformanceMetrics> {
    const now = Date.now();
    const startTime = now - minutes * 60 * 1000;

    const recentMatches = this.matchRecords.filter(record => record.timestamp >= startTime);
    const recentFrames = this.frameRecords.filter(record => record.timestamp >= startTime);

    if (recentMatches.length === 0) {
      return {
        matchCount: 0,
        averageMatchTime: 0,
        cacheHitRate: this.metrics.cacheHitRate
      };
    }

    const totalMatchTime = recentMatches.reduce((sum, record) => sum + record.duration, 0);
    const averageMatchTime = totalMatchTime / recentMatches.length;

    return {
      matchCount: recentMatches.length,
      averageMatchTime,
      totalMatchTime,
      frameCount: recentFrames.length
    };
  }
}

// 导出单例实例
export const performanceMonitor = new PerformanceMonitor();