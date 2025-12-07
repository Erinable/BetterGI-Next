// src/core/config-manager.ts
import { logger } from './logging/logger';

// ROI 区域定义
export interface ROIRegion {
    id: string;              // 唯一标识
    name: string;            // 用户命名 (如: "对话框区域")
    x: number;
    y: number;
    w: number;
    h: number;
    scope: 'global' | string;  // 'global' 或任务名 (如 'Preview', 'AutoSkipTask')
    templateName?: string;     // 可选: 模板级 ROI (如 'auto_skip_dialog_icon')
}

// 任务资产定义
export interface TaskAsset {
    id: string;              // 唯一标识
    name: string;            // 资产名称 (如 'pickup_icon')
    base64: string;          // 模板图片 Base64
    roi?: {                  // 可选 ROI 限制匹配区域
        x: number;
        y: number;
        w: number;
        h: number;
    };
    threshold?: number;      // 可选阈值覆盖
}

// 任务配置定义
export interface TaskConfig {
    taskName: string;        // 任务名称 (如 '自动拾取')
    enabled: boolean;        // 是否启用
    assets: TaskAsset[];     // 该任务的模板资产列表
}

// 定义配置的形状
export interface AppConfig {
    threshold: number;
    autoSkip: boolean;
    debugMode: boolean;
    loopInterval: number;
    // 性能优化配置
    downsample: number;
    scales: number[];
    adaptiveScaling: boolean;
    roiEnabled: boolean;
    roiRegions: ROIRegion[];
    performanceMonitoring: boolean;
    frameCacheEnabled: boolean;
    parallelMatching: boolean;
    maxWorkers: number;
    // 算法优化配置
    matchingMethod: 'TM_CCOEFF_NORMED' | 'TM_SQDIFF_NORMED' | 'TM_CCORR_NORMED';
    earlyTermination: boolean;
    templateCacheSize: number;
    // 任务配置
    tasks: TaskConfig[];
}

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
    threshold: 0.8,
    autoSkip: false,
    debugMode: false,
    loopInterval: 1000,
    // 性能优化默认值
    downsample: 0.33,
    scales: [1.0],
    adaptiveScaling: true,
    roiEnabled: false,
    roiRegions: [],
    performanceMonitoring: true,
    frameCacheEnabled: true,
    parallelMatching: false,
    maxWorkers: 2,
    // 算法优化配置
    matchingMethod: 'TM_CCOEFF_NORMED',
    earlyTermination: true,
    templateCacheSize: 50,
    // 任务配置
    tasks: [],
};

export class ConfigManager {
    private config: AppConfig;
    private storageKey = 'BGI_CONFIG';

    constructor() {
        // 加载配置，优先使用 GM API，回退到 localStorage
        this.config = this.loadConfig();
    }

    private loadConfig(): AppConfig {
        let saved = null;

        try {
            // 优先尝试使用 Tampermonkey/Greasemonkey API
            if (typeof GM_getValue !== 'undefined') {
                saved = GM_getValue(this.storageKey, null);
            } else if (typeof localStorage !== 'undefined') {
                const localStorageData = localStorage.getItem(this.storageKey);
                saved = localStorageData ? localStorageData : null;
            }
        } catch (e) {
            logger.warn('config', 'Failed to load config from storage', { error: e });
        }

        // 如果有保存的配置，合并默认配置
        if (saved) {
            try {
                const parsedConfig = JSON.parse(saved);
                return { ...DEFAULT_CONFIG, ...parsedConfig };
            } catch (e) {
                logger.warn('config', 'Failed to parse saved config, using defaults', { error: e });
                return DEFAULT_CONFIG;
            }
        }

        return DEFAULT_CONFIG;
    }

    private saveConfig() {
        try {
            const configString = JSON.stringify(this.config);

            // 优先尝试使用 Tampermonkey/Greasemonkey API
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(this.storageKey, configString);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.storageKey, configString);
            }
        } catch (e) {
            logger.warn('config', 'Failed to save config to storage', { error: e });
        }
    }

    // 泛型 getter
    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    // 获取完整配置
    getAll(): AppConfig {
        return { ...this.config };
    }

    // 泛型 setter，自动保存
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
        this.config[key] = value;
        this.saveConfig();
        // 通知其他模块配置已变更
        // bus.emit(EVENTS.CONFIG_UPDATE, this.config);
    }

    // 批量更新配置
    update(config: Partial<AppConfig>) {
        this.config = { ...this.config, ...config };
        this.saveConfig();
    }

    // 重置到默认配置
    reset() {
        this.config = { ...DEFAULT_CONFIG };
        this.saveConfig();
    }

    // 导出配置
    export() {
        return JSON.stringify(this.config, null, 2);
    }

    // 导入配置
    import(configString: string) {
        try {
            const importedConfig = JSON.parse(configString);
            this.config = { ...DEFAULT_CONFIG, ...importedConfig };
            this.saveConfig();
            return true;
        } catch (e) {
            logger.error('config', 'Failed to import config', { error: e });
            return false;
        }
    }

    // ========== ROI 管理方法 ==========

    /**
     * 添加 ROI 区域
     */
    addROI(region: Omit<ROIRegion, 'id'>): ROIRegion {
        const newRegion: ROIRegion = {
            ...region,
            id: `roi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        this.config.roiRegions.push(newRegion);
        this.saveConfig();
        logger.info('config', 'Added ROI region', { region: newRegion });
        return newRegion;
    }

    /**
     * 删除 ROI 区域
     */
    removeROI(id: string): boolean {
        const index = this.config.roiRegions.findIndex(r => r.id === id);
        if (index !== -1) {
            const removed = this.config.roiRegions.splice(index, 1)[0];
            this.saveConfig();
            logger.info('config', 'Removed ROI region', { region: removed });
            return true;
        }
        return false;
    }

    /**
     * 清空所有 ROI 区域
     */
    clearAllROI(): void {
        this.config.roiRegions = [];
        this.saveConfig();
        logger.info('config', 'Cleared all ROI regions');
    }

    /**
     * 获取指定模板/任务的 ROI，支持多级 fallback
     * 优先级: 模板级 ROI > 任务级 ROI > 全局 ROI
     * @param taskName 任务名 (如 'Preview', 'AutoSkipTask')
     * @param templateName 可选，模板名 (如 'auto_skip_dialog_icon')
     */
    getROIForTemplate(taskName: string, templateName?: string): ROIRegion | null {
        const regions = this.config.roiRegions;

        // 1. 模板级 ROI (最高优先)
        if (templateName) {
            const templateROI = regions.find(r =>
                r.scope === taskName && r.templateName === templateName
            );
            if (templateROI) return templateROI;
        }

        // 2. 任务级 ROI
        const taskROI = regions.find(r =>
            r.scope === taskName && !r.templateName
        );
        if (taskROI) return taskROI;

        // 3. 全局 ROI (最低优先)
        const globalROI = regions.find(r => r.scope === 'global');
        return globalROI || null;
    }

    /**
     * 获取任务的所有 ROI 区域 (包含全局)
     */
    getROIsForTask(taskName: string): ROIRegion[] {
        return this.config.roiRegions.filter(r =>
            r.scope === taskName || r.scope === 'global'
        );
    }

    /**
     * 按 scope 分组获取 ROI
     */
    getROIsGroupedByScope(): Map<string, ROIRegion[]> {
        const grouped = new Map<string, ROIRegion[]>();
        for (const region of this.config.roiRegions) {
            const scope = region.scope;
            if (!grouped.has(scope)) {
                grouped.set(scope, []);
            }
            grouped.get(scope)!.push(region);
        }
        return grouped;
    }

    // ========== 任务资产管理方法 ==========

    /**
     * 获取任务配置
     */
    getTaskConfig(taskName: string): TaskConfig | undefined {
        return this.config.tasks.find(t => t.taskName === taskName);
    }

    /**
     * 获取任务资产列表
     */
    getTaskAssets(taskName: string): TaskAsset[] {
        const taskConfig = this.getTaskConfig(taskName);
        return taskConfig?.assets || [];
    }

    /**
     * 获取所有任务配置
     */
    getAllTasks(): TaskConfig[] {
        return this.config.tasks;
    }

    /**
     * 设置任务启用状态
     */
    setTaskEnabled(taskName: string, enabled: boolean): void {
        let taskConfig = this.getTaskConfig(taskName);
        if (!taskConfig) {
            // 如果任务配置不存在，创建一个新的
            taskConfig = { taskName, enabled, assets: [] };
            this.config.tasks.push(taskConfig);
        } else {
            taskConfig.enabled = enabled;
        }
        this.saveConfig();
        logger.info('config', `Task ${taskName} enabled: ${enabled}`);
    }

    /**
     * 检查任务是否启用
     */
    isTaskEnabled(taskName: string): boolean {
        const taskConfig = this.getTaskConfig(taskName);
        return taskConfig?.enabled ?? true; // 默认启用
    }

    /**
     * 添加或更新任务资产
     */
    setTaskAsset(taskName: string, asset: Omit<TaskAsset, 'id'> & { id?: string }): TaskAsset {
        let taskConfig = this.getTaskConfig(taskName);
        if (!taskConfig) {
            taskConfig = { taskName, enabled: true, assets: [] };
            this.config.tasks.push(taskConfig);
        }

        const assetId = asset.id || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const existingIndex = taskConfig.assets.findIndex(a => a.id === asset.id || a.name === asset.name);

        const newAsset: TaskAsset = {
            id: assetId,
            name: asset.name,
            base64: asset.base64,
            roi: asset.roi,
            threshold: asset.threshold,
        };

        if (existingIndex !== -1) {
            taskConfig.assets[existingIndex] = newAsset;
        } else {
            taskConfig.assets.push(newAsset);
        }

        this.saveConfig();
        logger.info('config', `Task asset updated: ${taskName}/${asset.name}`);
        return newAsset;
    }

    /**
     * 删除任务资产
     */
    removeTaskAsset(taskName: string, assetId: string): boolean {
        const taskConfig = this.getTaskConfig(taskName);
        if (!taskConfig) return false;

        const index = taskConfig.assets.findIndex(a => a.id === assetId);
        if (index !== -1) {
            taskConfig.assets.splice(index, 1);
            this.saveConfig();
            logger.info('config', `Task asset removed: ${taskName}/${assetId}`);
            return true;
        }
        return false;
    }

    /**
     * 初始化任务配置 (如果不存在)
     */
    ensureTaskConfig(taskName: string): TaskConfig {
        let taskConfig = this.getTaskConfig(taskName);
        if (!taskConfig) {
            taskConfig = { taskName, enabled: true, assets: [] };
            this.config.tasks.push(taskConfig);
            this.saveConfig();
        }
        return taskConfig;
    }
}

// 导出单例
export const config = new ConfigManager();

