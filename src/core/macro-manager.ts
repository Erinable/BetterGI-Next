// src/core/macro-manager.ts
// 宏录制管理器 - 管理多个宏录制的存储、导入导出等

import { logger } from './logging/logger';
import { InputRecord } from './input';

/**
 * 宏录制数据结构
 */
export interface MacroRecording {
    id: string;
    name: string;
    createdAt: string;
    duration: number;      // 总时长 (ms)
    recordCount: number;   // 记录条数
    records: InputRecord[];
}

/**
 * 存储的宏数据
 */
interface MacroStorage {
    version: string;
    macros: { [id: string]: MacroRecording };
}

const STORAGE_KEY = 'bettergi_macros';
const STORAGE_VERSION = '1.0';

/**
 * 生成唯一 ID
 */
function generateId(): string {
    return `macro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化时长
 */
export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

class MacroManager {
    private _macros: Map<string, MacroRecording> = new Map();
    private _loaded: boolean = false;

    /**
     * 加载存储的宏数据
     */
    load(): void {
        if (this._loaded) return;

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data: MacroStorage = JSON.parse(raw);
                if (data.macros) {
                    for (const [id, macro] of Object.entries(data.macros)) {
                        this._macros.set(id, macro);
                    }
                }
                logger.info('macro', `加载了 ${this._macros.size} 个宏录制`);
            }
        } catch (e) {
            logger.error('macro', '加载宏数据失败', { error: e });
        }

        this._loaded = true;
    }

    /**
     * 保存到 localStorage
     */
    private save(): void {
        try {
            const data: MacroStorage = {
                version: STORAGE_VERSION,
                macros: Object.fromEntries(this._macros)
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            logger.error('macro', '保存宏数据失败', { error: e });
        }
    }

    /**
     * 列出所有宏
     */
    listMacros(): MacroRecording[] {
        this.load();
        return Array.from(this._macros.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    /**
     * 获取单个宏
     */
    getMacro(id: string): MacroRecording | undefined {
        this.load();
        return this._macros.get(id);
    }

    /**
     * 保存新宏
     */
    saveMacro(name: string, records: InputRecord[]): MacroRecording {
        this.load();

        const id = generateId();
        const duration = records.length > 1
            ? records[records.length - 1].t - records[0].t
            : 0;

        const macro: MacroRecording = {
            id,
            name,
            createdAt: new Date().toISOString(),
            duration,
            recordCount: records.length,
            records
        };

        this._macros.set(id, macro);
        this.save();

        logger.info('macro', `保存宏: ${name} (${records.length} 条记录)`);
        return macro;
    }

    /**
     * 重命名宏
     */
    renameMacro(id: string, newName: string): boolean {
        const macro = this._macros.get(id);
        if (!macro) return false;

        macro.name = newName;
        this.save();
        return true;
    }

    /**
     * 删除宏 (支持批量)
     */
    deleteMacros(ids: string[]): number {
        let deleted = 0;
        for (const id of ids) {
            if (this._macros.delete(id)) {
                deleted++;
            }
        }
        if (deleted > 0) {
            this.save();
            logger.info('macro', `删除了 ${deleted} 个宏`);
        }
        return deleted;
    }

    /**
     * 复制宏 (支持批量)
     */
    duplicateMacros(ids: string[]): MacroRecording[] {
        const copies: MacroRecording[] = [];

        for (const id of ids) {
            const original = this._macros.get(id);
            if (original) {
                const copy = this.saveMacro(
                    `${original.name} (副本)`,
                    [...original.records]
                );
                copies.push(copy);
            }
        }

        return copies;
    }

    /**
     * 导出宏 (支持批量)
     */
    exportMacros(ids: string[]): string {
        const macrosToExport: MacroRecording[] = [];

        for (const id of ids) {
            const macro = this._macros.get(id);
            if (macro) {
                macrosToExport.push(macro);
            }
        }

        return JSON.stringify({
            version: STORAGE_VERSION,
            exportedAt: new Date().toISOString(),
            count: macrosToExport.length,
            macros: macrosToExport
        }, null, 2);
    }

    /**
     * 导入宏 (支持批量)
     */
    importMacros(json: string): { success: boolean; count: number; error?: string } {
        try {
            const data = JSON.parse(json);

            if (!data || !Array.isArray(data.macros)) {
                return { success: false, count: 0, error: '无效的导入格式' };
            }

            let imported = 0;
            for (const macro of data.macros) {
                if (macro.records && Array.isArray(macro.records)) {
                    // 使用新 ID 避免冲突
                    const newMacro = this.saveMacro(
                        macro.name || '导入的宏',
                        macro.records
                    );
                    imported++;
                }
            }

            return { success: true, count: imported };

        } catch (e) {
            return { success: false, count: 0, error: `解析失败: ${e}` };
        }
    }

    /**
     * 获取宏总数
     */
    get count(): number {
        this.load();
        return this._macros.size;
    }
}

// 单例导出
export const macroManager = new MacroManager();
