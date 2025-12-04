/**
 * 日志和数据存储管理器
 */

import { LogEntry, LogStorage, LogFilter, LogExportOptions } from '../logging/types';
import { PerformanceMetrics, MatchRecord, FrameRecord, CacheRecord } from '../performance/types';
import { logger } from '../logging/logger';

export interface StorageConfig {
  // 存储位置
  useLocalStorage: boolean;
  useIndexedDB: boolean;
  useFileSystem: boolean;

  // 存储限制
  maxLogEntries: number;
  maxPerformanceRecords: number;
  maxFileSize: number; // MB

  // 清理策略
  cleanupInterval: number; // 分钟
  retentionDays: number;
  autoCleanup: boolean;

  // 压缩
  enableCompression: boolean;
  compressionLevel: number;

  // 备份
  enableBackup: boolean;
  backupInterval: number; // 小时
  backupLocation: string;
}

export interface StorageStats {
  totalSize: number;
  usedSpace: number;
  availableSpace: number;
  logEntries: number;
  performanceRecords: number;
  oldestRecord?: Date;
  newestRecord?: Date;
  lastBackup?: Date;
  compressionRatio?: number;
}

export interface BackupInfo {
  id: string;
  timestamp: number;
  size: number;
  records: number;
  type: 'full' | 'incremental';
  location: string;
  compressed: boolean;
}

export class StorageManager {
  private config: StorageConfig;
  private isInitialized: boolean = false;
  private dbName: string = 'BetterGI_Logs';
  private dbVersion: number = 1;
  private db?: IDBDatabase;

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      useLocalStorage: true,
      useIndexedDB: true,
      useFileSystem: false, // Electron环境下可启用
      maxLogEntries: 50000,
      maxPerformanceRecords: 10000,
      maxFileSize: 100, // 100MB
      cleanupInterval: 60, // 1小时
      retentionDays: 30,
      autoCleanup: true,
      enableCompression: false,
      compressionLevel: 6,
      enableBackup: true,
      backupInterval: 24, // 24小时
      backupLocation: './backups',
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      if (this.config.useIndexedDB && 'indexedDB' in window) {
        await this.initializeIndexedDB();
      }

      if (this.config.useLocalStorage) {
        this.initializeLocalStorage();
      }

      // 启动自动清理
      if (this.config.autoCleanup) {
        this.startAutoCleanup();
      }

      // 启动自动备份
      if (this.config.enableBackup) {
        this.startAutoBackup();
      }

      this.isInitialized = true;
      logger.info('storage', 'Storage manager initialized successfully', { config: this.config });

    } catch (error) {
      logger.error('storage', 'Failed to initialize storage manager', { error });
      throw error;
    }
  }

  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建日志存储
        if (!db.objectStoreNames.contains('logs')) {
          const logStore = db.createObjectStore('logs', { keyPath: 'id' });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
          logStore.createIndex('level', 'level', { unique: false });
          logStore.createIndex('category', 'category', { unique: false });
        }

        // 创建性能记录存储
        if (!db.objectStoreNames.contains('performance')) {
          const perfStore = db.createObjectStore('performance', { keyPath: 'id' });
          perfStore.createIndex('timestamp', 'timestamp', { unique: false });
          perfStore.createIndex('type', 'type', { unique: false });
        }

        // 创建匹配记录存储
        if (!db.objectStoreNames.contains('matches')) {
          const matchStore = db.createObjectStore('matches', { keyPath: 'id' });
          matchStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 创建备份信息存储
        if (!db.objectStoreNames.contains('backups')) {
          const backupStore = db.createObjectStore('backups', { keyPath: 'id' });
          backupStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private initializeLocalStorage(): void {
    // 检查localStorage可用性并初始化结构
    try {
      const metadata = localStorage.getItem('bettergi_storage_metadata');
      if (!metadata) {
        const initialMetadata = {
          version: '1.0.0',
          created: Date.now(),
          lastCleanup: Date.now(),
          compressionEnabled: this.config.enableCompression
        };
        localStorage.setItem('bettergi_storage_metadata', JSON.stringify(initialMetadata));
      }
    } catch (error) {
      logger.warn('storage', 'localStorage not available or full', { error });
    }
  }

  // 日志存储方法
  async storeLogs(logs: LogEntry[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.config.useIndexedDB && this.db) {
        await this.storeLogsIndexedDB(logs);
      } else if (this.config.useLocalStorage) {
        this.storeLogsLocalStorage(logs);
      }

      logger.debug('storage', `Stored ${logs.length} log entries`, { count: logs.length });
    } catch (error) {
      logger.error('storage', 'Failed to store logs', { error, logCount: logs.length });
      throw error;
    }
  }

  private async storeLogsIndexedDB(logs: LogEntry[]): Promise<void> {
    const transaction = this.db!.transaction(['logs'], 'readwrite');
    const store = transaction.objectStore('logs');

    for (const log of logs) {
      const logWithId = {
        ...log,
        id: `${log.timestamp}_${Math.random().toString(36).substr(2, 9)}`
      };
      store.add(logWithId);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private storeLogsLocalStorage(logs: LogEntry[]): void {
    const existingLogs = this.getLogsLocalStorage();
    const combinedLogs = [...existingLogs, ...logs];

    // 限制存储条数
    const limitedLogs = combinedLogs.slice(-this.config.maxLogEntries);

    try {
      localStorage.setItem('bettergi_logs', JSON.stringify(limitedLogs));
    } catch (error) {
      // 如果存储失败，尝试清理更旧的日志
      const reducedLogs = limitedLogs.slice(-Math.floor(this.config.maxLogEntries * 0.8));
      localStorage.setItem('bettergi_logs', JSON.stringify(reducedLogs));

      logger.warn('storage', 'LocalStorage full, reduced log size', {
        originalSize: combinedLogs.length,
        reducedSize: reducedLogs.length
      });
    }
  }

  private getLogsLocalStorage(): LogEntry[] {
    try {
      const logs = localStorage.getItem('bettergi_logs');
      return logs ? JSON.parse(logs) : [];
    } catch (error) {
      logger.warn('storage', 'Failed to parse logs from localStorage', { error });
      return [];
    }
  }

  // 性能数据存储方法
  async storePerformanceData(type: 'matches' | 'frames' | 'cache', records: any[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.config.useIndexedDB && this.db) {
        await this.storePerformanceIndexedDB(type, records);
      } else if (this.config.useLocalStorage) {
        this.storePerformanceLocalStorage(type, records);
      }

      logger.debug('storage', `Stored ${records.length} ${type} records`, { count: records.length });
    } catch (error) {
      logger.error('storage', `Failed to store ${type} records`, { error, recordCount: records.length });
      throw error;
    }
  }

  private async storePerformanceIndexedDB(type: string, records: any[]): Promise<void> {
    const transaction = this.db!.transaction(['performance'], 'readwrite');
    const store = transaction.objectStore('performance');

    for (const record of records) {
      const recordWithId = {
        ...record,
        id: `${type}_${record.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        type
      };
      store.add(recordWithId);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private storePerformanceLocalStorage(type: string, records: any[]): void {
    const key = `bettergi_performance_${type}`;
    const existingRecords = this.getPerformanceLocalStorage(type);
    const combinedRecords = [...existingRecords, ...records];
    const limitedRecords = combinedRecords.slice(-this.config.maxPerformanceRecords);

    try {
      localStorage.setItem(key, JSON.stringify(limitedRecords));
    } catch (error) {
      const reducedRecords = limitedRecords.slice(-Math.floor(this.config.maxPerformanceRecords * 0.8));
      localStorage.setItem(key, JSON.stringify(reducedRecords));

      logger.warn('storage', `LocalStorage full, reduced ${type} records`, {
        originalSize: combinedRecords.length,
        reducedSize: reducedRecords.length
      });
    }
  }

  private getPerformanceLocalStorage(type: string): any[] {
    try {
      const key = `bettergi_performance_${type}`;
      const records = localStorage.getItem(key);
      return records ? JSON.parse(records) : [];
    } catch (error) {
      logger.warn('storage', `Failed to parse ${type} records from localStorage`, { error });
      return [];
    }
  }

  // 查询方法
  async getLogs(filter?: LogFilter, limit?: number): Promise<LogEntry[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.config.useIndexedDB && this.db) {
        return await this.getLogsIndexedDB(filter, limit);
      } else if (this.config.useLocalStorage) {
        return this.getLogsLocalStorageFiltered(filter, limit);
      }
      return [];
    } catch (error) {
      logger.error('storage', 'Failed to retrieve logs', { error });
      return [];
    }
  }

  private async getLogsIndexedDB(filter?: LogFilter, limit?: number): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['logs'], 'readonly');
      const store = transaction.objectStore('logs');
      const request = store.getAll();

      request.onsuccess = () => {
        let logs = request.result;

        // 应用过滤器
        if (filter) {
          logs = this.applyLogFilter(logs, filter);
        }

        // 应用限制
        if (limit) {
          logs = logs.slice(-limit);
        }

        resolve(logs);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private getLogsLocalStorageFiltered(filter?: LogFilter, limit?: number): LogEntry[] {
    let logs = this.getLogsLocalStorage();

    if (filter) {
      logs = this.applyLogFilter(logs, filter);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  private applyLogFilter(logs: LogEntry[], filter: LogFilter): LogEntry[] {
    return logs.filter(log => {
      if (filter.levels && !filter.levels.includes(log.level)) return false;
      if (filter.categories && !filter.categories.includes(log.category)) return false;
      if (filter.tags && !filter.tags.some(tag => log.tags?.includes(tag))) return false;
      if (filter.startTime && log.timestamp < filter.startTime) return false;
      if (filter.endTime && log.timestamp > filter.endTime) return false;
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        return log.message.toLowerCase().includes(searchLower) ||
               log.category.toLowerCase().includes(searchLower);
      }
      return true;
    });
  }

  // 导出方法
  async exportData(options: LogExportOptions): Promise<string> {
    try {
      const logs = await this.getLogs(options.filter);

      switch (options.format) {
        case 'json':
          return this.exportJSON(logs, options);
        case 'csv':
          return this.exportCSV(logs, options);
        case 'txt':
          return this.exportTXT(logs, options);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      logger.error('storage', 'Failed to export data', { error, options });
      throw error;
    }
  }

  private exportJSON(logs: LogEntry[], options: LogExportOptions): string {
    const data = options.includeMetadata ? {
      metadata: {
        exported: Date.now(),
        count: logs.length,
        version: '1.0.0'
      },
      logs
    } : logs;

    return JSON.stringify(data, null, 2);
  }

  private exportCSV(logs: LogEntry[], options: LogExportOptions): string {
    const headers = ['timestamp', 'level', 'category', 'message', 'source', 'tags'];
    const csvRows = [headers.join(',')];

    for (const log of logs) {
      const row = [
        log.timestamp,
        log.level,
        `"${log.category}"`,
        `"${log.message.replace(/"/g, '""')}"`,
        `"${log.source || ''}"`,
        `"${(log.tags || []).join(';')}"`
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

  private exportTXT(logs: LogEntry[], options: LogExportOptions): string {
    return logs.map(log => {
      const timestamp = new Date(log.timestamp).toISOString();
      const level = log.level;
      const tags = log.tags ? ` [${log.tags.join(', ')}]` : '';
      return `[${timestamp}] [${level}] [${log.category}]${tags} ${log.message}`;
    }).join('\n');
  }

  // 清理方法
  async cleanup(): Promise<void> {
    try {
      const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

      // 清理IndexedDB
      if (this.config.useIndexedDB && this.db) {
        await this.cleanupIndexedDB(cutoffTime);
      }

      // 清理localStorage
      if (this.config.useLocalStorage) {
        this.cleanupLocalStorage(cutoffTime);
      }

      logger.info('storage', 'Storage cleanup completed', { cutoffTime });

    } catch (error) {
      logger.error('storage', 'Failed to cleanup storage', { error });
      throw error;
    }
  }

  private async cleanupIndexedDB(cutoffTime: number): Promise<void> {
    const stores = ['logs', 'performance'];

    for (const storeName of stores) {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('timestamp');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }
  }

  private cleanupLocalStorage(cutoffTime: number): void {
    // 清理日志
    const logs = this.getLogsLocalStorage();
    const filteredLogs = logs.filter(log => log.timestamp > cutoffTime);
    localStorage.setItem('bettergi_logs', JSON.stringify(filteredLogs));

    // 清理性能数据
    const types = ['matches', 'frames', 'cache'];
    for (const type of types) {
      const records = this.getPerformanceLocalStorage(type);
      const filteredRecords = records.filter((record: any) => record.timestamp > cutoffTime);
      localStorage.setItem(`bettergi_performance_${type}`, JSON.stringify(filteredRecords));
    }
  }

  private startAutoCleanup(): void {
    setInterval(() => {
      this.cleanup().catch(error => {
        logger.error('storage', 'Auto cleanup failed', { error });
      });
    }, this.config.cleanupInterval * 60 * 1000);
  }

  private startAutoBackup(): void {
    setInterval(() => {
      this.createBackup().catch(error => {
        logger.error('storage', 'Auto backup failed', { error });
      });
    }, this.config.backupInterval * 60 * 60 * 1000);
  }

  private async createBackup(): Promise<void> {
    // 备份逻辑实现
    logger.info('storage', 'Creating backup...');
    // TODO: 实现完整的备份功能
  }

  // 获取存储统计信息
  async getStats(): Promise<StorageStats> {
    try {
      const logCount = (await this.getLogs()).length;
      const performanceCount = this.getPerformanceLocalStorage('matches').length +
                             this.getPerformanceLocalStorage('frames').length +
                             this.getPerformanceLocalStorage('cache').length;

      let totalSize = 0;
      if (this.config.useLocalStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('bettergi_')) {
            const value = localStorage.getItem(key);
            if (value) {
              totalSize += new Blob([value]).size;
            }
          }
        }
      }

      const allLogs = await this.getLogs();
      const oldestRecord = allLogs.length > 0 ? new Date(allLogs[0].timestamp) : undefined;
      const newestRecord = allLogs.length > 0 ? new Date(allLogs[allLogs.length - 1].timestamp) : undefined;

      return {
        totalSize: this.config.maxFileSize * 1024 * 1024, // MB to bytes
        usedSpace: totalSize,
        availableSpace: Math.max(0, (this.config.maxFileSize * 1024 * 1024) - totalSize),
        logEntries: logCount,
        performanceRecords: performanceCount,
        oldestRecord,
        newestRecord
      };

    } catch (error) {
      logger.error('storage', 'Failed to get storage stats', { error });
      return {
        totalSize: 0,
        usedSpace: 0,
        availableSpace: 0,
        logEntries: 0,
        performanceRecords: 0
      };
    }
  }

  // 配置管理
  updateConfig(newConfig: Partial<StorageConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('storage', 'Storage config updated', { config: this.config });
  }

  getConfig(): StorageConfig {
    return { ...this.config };
  }

  // 清空所有数据
  async clearAll(): Promise<void> {
    try {
      // 清空IndexedDB
      if (this.config.useIndexedDB && this.db) {
        const stores = ['logs', 'performance', 'backups'];
        for (const storeName of stores) {
          const transaction = this.db!.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          store.clear();
        }
      }

      // 清空localStorage
      if (this.config.useLocalStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('bettergi_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }

      logger.info('storage', 'All storage data cleared');

    } catch (error) {
      logger.error('storage', 'Failed to clear storage', { error });
      throw error;
    }
  }
}

// 导出单例实例
export const storageManager = new StorageManager();