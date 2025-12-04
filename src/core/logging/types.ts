/**
 * 日志系统类型定义
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  tags?: string[];
  source?: string;
  sessionId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  maxStorageEntries: number;
  categories: string[];
  enablePerformanceLogging: boolean;
  structuredOutput: boolean;
}

export interface LogStorage {
  entries: LogEntry[];
  maxSize: number;
  lastCleanup: number;
}

export interface PerformanceLogEntry extends LogEntry {
  duration?: number;
  operation?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  memoryUsage?: number;
  metrics?: Record<string, number>;
}

export interface LogFilter {
  levels?: LogLevel[];
  categories?: string[];
  tags?: string[];
  startTime?: number;
  endTime?: number;
  search?: string;
}

export interface LogExportOptions {
  format: 'json' | 'csv' | 'txt';
  filter?: LogFilter;
  includeMetadata?: boolean;
}

export interface LoggerStats {
  totalEntries: number;
  entriesByLevel: Record<LogLevel, number>;
  entriesByCategory: Record<string, number>;
  averageEntriesPerMinute: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  storageUsage: number;
}