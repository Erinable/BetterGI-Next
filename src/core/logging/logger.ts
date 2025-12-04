/**
 * 核心日志系统实现
 */

import { LogEntry, LogLevel, LoggerConfig, LogStorage, PerformanceLogEntry } from './types';

export class Logger {
  private config: LoggerConfig;
  private storage: LogStorage;
  private sessionId: string;
  private static instance: Logger;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableStorage: true,
      maxStorageEntries: 10000,
      categories: [],
      enablePerformanceLogging: true,
      structuredOutput: false,
      ...config
    };

    this.storage = {
      entries: [],
      maxSize: this.config.maxStorageEntries,
      lastCleanup: Date.now()
    };

    this.sessionId = this.generateSessionId();
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldLog(category: string, level: LogLevel): boolean {
    if (level < this.config.level) return false;
    if (this.config.categories.length > 0 && !this.config.categories.includes(category)) return false;
    return true;
  }

  private createLogEntry(level: LogLevel, category: string, message: string, data?: any, tags?: string[]): LogEntry {
    return {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
      tags: tags || [],
      source: this.getCallerInfo(),
      sessionId: this.sessionId
    };
  }

  private getCallerInfo(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';

    const lines = stack.split('\n');
    // 跳过当前函数调用栈，找到实际调用者
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (line && !line.includes('logger.ts')) {
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
        if (match) {
          return `${match[2]}:${match[3]}`;
        }
      }
    }
    return 'unknown';
  }

  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.category, entry.level)) return;

    // 控制台输出
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // 存储日志
    if (this.config.enableStorage) {
      this.addToStorage(entry);
    }

    // 触发日志事件
    this.emitLogEvent(entry);
  }

  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelStr = LogLevel[entry.level];
    const prefix = this.config.structuredOutput
      ? `[${timestamp}] [${levelStr}] [${entry.category}]`
      : `[${levelStr}] [${entry.category}]`;

    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(message, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(message, entry.data || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(message, entry.data || '');
        break;
      default:
        console.log(message, entry.data || '');
    }
  }

  private addToStorage(entry: LogEntry): void {
    this.storage.entries.push(entry);

    // 定期清理旧日志
    if (this.storage.entries.length > this.storage.maxSize) {
      this.cleanupStorage();
    }

    // 每5分钟清理一次过期日志
    const now = Date.now();
    if (now - this.storage.lastCleanup > 5 * 60 * 1000) {
      this.cleanupStorage();
      this.storage.lastCleanup = now;
    }
  }

  private cleanupStorage(): void {
    // 保留最新的90%日志
    const keepCount = Math.floor(this.storage.maxSize * 0.9);
    this.storage.entries = this.storage.entries.slice(-keepCount);
  }

  private emitLogEvent(entry: LogEntry): void {
    // 触发全局日志事件，供UI组件监听
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('logEntry', {
        detail: entry
      }));
    }
  }

  // 公共API方法
  debug(category: string, message: string, data?: any, tags?: string[]): void {
    this.log(this.createLogEntry(LogLevel.DEBUG, category, message, data, tags));
  }

  info(category: string, message: string, data?: any, tags?: string[]): void {
    this.log(this.createLogEntry(LogLevel.INFO, category, message, data, tags));
  }

  warn(category: string, message: string, data?: any, tags?: string[]): void {
    this.log(this.createLogEntry(LogLevel.WARN, category, message, data, tags));
  }

  error(category: string, message: string, data?: any, tags?: string[]): void {
    this.log(this.createLogEntry(LogLevel.ERROR, category, message, data, tags));
  }

  fatal(category: string, message: string, data?: any, tags?: string[]): void {
    this.log(this.createLogEntry(LogLevel.FATAL, category, message, data, tags));
  }

  // 性能日志专用方法
  startPerformanceLog(operation: string, category: string = 'performance'): () => PerformanceLogEntry {
    const startTime = performance.now();
    const startTimestamp = Date.now();

    const startEntry: PerformanceLogEntry = this.createLogEntry(
      LogLevel.DEBUG,
      category,
      `Starting operation: ${operation}`,
      { operation, phase: 'start' }
    ) as PerformanceLogEntry;
    startEntry.operation = operation;
    startEntry.startTimestamp = startTimestamp;
    startEntry.memoryUsage = this.getMemoryUsage();

    this.log(startEntry);

    return (): PerformanceLogEntry => {
      const endTime = performance.now();
      const endTimestamp = Date.now();
      const duration = endTime - startTime;

      const endEntry: PerformanceLogEntry = this.createLogEntry(
        LogLevel.DEBUG,
        category,
        `Completed operation: ${operation}`,
        {
          operation,
          phase: 'end',
          duration,
          startTime,
          endTime
        }
      ) as PerformanceLogEntry;

      endEntry.operation = operation;
      endEntry.duration = duration;
      endEntry.startTimestamp = startTimestamp;
      endEntry.endTimestamp = endTimestamp;
      endEntry.memoryUsage = this.getMemoryUsage();

      this.log(endEntry);
      return endEntry;
    };
  }

  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  // 配置管理
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.storage.maxSize = this.config.maxStorageEntries;
  }

  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  // 日志查询和导出
  getEntries(filter?: any): LogEntry[] {
    let entries = [...this.storage.entries];

    if (filter) {
      if (filter.levels) {
        entries = entries.filter(entry => filter.levels.includes(entry.level));
      }
      if (filter.categories) {
        entries = entries.filter(entry => filter.categories.includes(entry.category));
      }
      if (filter.tags) {
        entries = entries.filter(entry =>
          filter.tags.some((tag: string) => entry.tags?.includes(tag))
        );
      }
      if (filter.startTime) {
        entries = entries.filter(entry => entry.timestamp >= filter.startTime);
      }
      if (filter.endTime) {
        entries = entries.filter(entry => entry.timestamp <= filter.endTime);
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        entries = entries.filter(entry =>
          entry.message.toLowerCase().includes(searchLower) ||
          entry.category.toLowerCase().includes(searchLower)
        );
      }
    }

    return entries;
  }

  getStorage(): LogStorage {
    return { ...this.storage, entries: [...this.storage.entries] };
  }

  clearStorage(): void {
    this.storage.entries = [];
    this.storage.lastCleanup = Date.now();
  }

  exportLogs(format: 'json' | 'csv' | 'txt' = 'json', filter?: any): string {
    const entries = this.getEntries(filter);

    switch (format) {
      case 'json':
        return JSON.stringify(entries, null, 2);

      case 'csv':
        const headers = ['timestamp', 'level', 'category', 'message', 'source', 'tags'];
        const csvRows = [
          headers.join(','),
          ...entries.map(entry => [
            entry.timestamp,
            LogLevel[entry.level],
            entry.category,
            `"${entry.message.replace(/"/g, '""')}"`,
            entry.source || '',
            `"${(entry.tags || []).join(';')}"`
          ].join(','))
        ];
        return csvRows.join('\n');

      case 'txt':
        return entries.map(entry => {
          const timestamp = new Date(entry.timestamp).toISOString();
          const level = LogLevel[entry.level];
          const tags = entry.tags ? ` [${entry.tags.join(', ')}]` : '';
          return `[${timestamp}] [${level}] [${entry.category}]${tags} ${entry.message}`;
        }).join('\n');

      default:
        return JSON.stringify(entries, null, 2);
    }
  }

  // 统计信息
  getStats() {
    const entries = this.storage.entries;
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const entriesByLevel: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.FATAL]: 0
    };

    const entriesByCategory: Record<string, number> = {};
    let recentEntries = 0;

    entries.forEach(entry => {
      entriesByLevel[entry.level]++;
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;
      if (entry.timestamp >= oneMinuteAgo) {
        recentEntries++;
      }
    });

    return {
      totalEntries: entries.length,
      entriesByLevel,
      entriesByCategory,
      averageEntriesPerMinute: recentEntries,
      oldestEntry: entries.length > 0 ? new Date(entries[0].timestamp) : undefined,
      newestEntry: entries.length > 0 ? new Date(entries[entries.length - 1].timestamp) : undefined,
      storageUsage: JSON.stringify(this.storage.entries).length
    };
  }
}

// 导出单例实例
export const logger = Logger.getInstance();