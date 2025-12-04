/**
 * 性能监控类型定义
 */

export interface PerformanceMetrics {
  // 匹配性能指标
  matchCount: number;
  totalMatchTime: number;
  averageMatchTime: number;
  bestMatchTime: number;
  worstMatchTime: number;

  // 帧处理指标
  frameCount: number;
  averageFrameTime: number;
  droppedFrames: number;

  // 缓存指标
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;

  // 策略使用指标
  roiMatches: number;
  fullScreenMatches: number;
  adaptiveScalingAttempts: number;
  adaptiveScalingSuccesses: number;

  // 系统资源指标
  memoryUsage: number;
  peakMemoryUsage: number;
  cpuUsage?: number;

  // 时间戳
  timestamp: number;
  sessionStartTime: number;
}

export interface MatchRecord {
  timestamp: number;
  duration: number;
  score: number;
  scale: number;
  useROI: boolean;
  templateSize: { width: number; height: number };
  usedAdaptiveScaling: boolean;
  operation?: string;
  category?: string;
}

export interface FrameRecord {
  timestamp: number;
  captureTime: number;
  processTime: number;
  width: number;
  height: number;
  hash?: string;
  duplicate?: boolean;
}

export interface CacheRecord {
  timestamp: number;
  type: 'template' | 'frame' | 'result';
  hit: boolean;
  key: string;
  size?: number;
  accessTime?: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  metric: string;
  threshold: number;
  currentValue: number;
  suggestions?: string[];
}

export interface PerformanceRecommendation {
  id: string;
  type: 'performance' | 'memory' | 'cache' | 'algorithm';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  expectedImpact: string;
  implementation: string;
  metrics?: {
    before?: number;
    after?: number;
    improvement?: number;
  };
}

export interface PerformanceConfig {
  // 监控开关
  enabled: boolean;
  realTimeMonitoring: boolean;
  detailedLogging: boolean;

  // 性能阈值
  thresholds: {
    matchTime: { warning: number; critical: number };
    memoryUsage: { warning: number; critical: number };
    cacheHitRate: { warning: number; critical: number };
    frameRate: { warning: number; critical: number };
  };

  // 数据保留
  maxRecords: {
    matches: number;
    frames: number;
    cache: number;
    alerts: number;
  };

  // 自动优化
  autoOptimization: boolean;
  adaptiveThresholds: boolean;

  // 报告设置
  enableReports: boolean;
  reportInterval: number; // 分钟
  enableAlerts: boolean;
}

export interface PerformanceReport {
  id: string;
  timestamp: number;
  period: { start: number; end: number };
  summary: PerformanceMetrics;
  trends: {
    matchTime: { trend: 'improving' | 'stable' | 'degrading'; change: number };
    memoryUsage: { trend: 'stable' | 'increasing' | 'decreasing'; change: number };
    cacheHitRate: { trend: 'improving' | 'stable' | 'degrading'; change: number };
  };
  alerts: PerformanceAlert[];
  recommendations: PerformanceRecommendation[];
  topOperations: Array<{
    operation: string;
    count: number;
    totalTime: number;
    averageTime: number;
  }>;
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  benchmarks: Benchmark[];
}

export interface Benchmark {
  name: string;
  description: string;
  setup?: () => void;
  teardown?: () => void;
  run: () => Promise<BenchmarkResult>;
  iterations?: number;
  warmupIterations?: number;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  medianTime: number;
  standardDeviation: number;
  operationsPerSecond: number;
  memoryDelta?: number;
  metadata?: Record<string, any>;
}