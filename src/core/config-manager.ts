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
    roiRegions: Array<{ x: number, y: number, w: number, h: number, name: string }>;
    performanceMonitoring: boolean;
    frameCacheEnabled: boolean;
    parallelMatching: boolean;
    maxWorkers: number;
    // 算法优化配置
    matchingMethod: 'TM_CCOEFF_NORMED' | 'TM_SQDIFF_NORMED' | 'TM_CCORR_NORMED';
    earlyTermination: boolean;
    templateCacheSize: number;
}

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
    threshold: 0.8,
    autoSkip: false,
    debugMode: false,
    loopInterval: 1000,
    // 性能优化默认值
    downsample: 0.33, // 提高降采样率从 0.5 到 0.33
    scales: [1.0], // 默认单尺度，失败后自适应扩展
    adaptiveScaling: true, // 启用自适应尺度
    roiEnabled: false, // 默认关闭ROI
    roiRegions: [],
    performanceMonitoring: true, // 启用性能监控
    frameCacheEnabled: true, // 启用帧缓存
    parallelMatching: false, // 默认关闭并行匹配
    maxWorkers: 2, // 最大Worker数量
    // 算法优化配置
    matchingMethod: 'TM_CCOEFF_NORMED',
    earlyTermination: true, // 启用早期终止
    templateCacheSize: 50, // 模板缓存大小
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
            console.warn('[ConfigManager] Failed to load config from storage:', e);
        }

        // 如果有保存的配置，合并默认配置
        if (saved) {
            try {
                const parsedConfig = JSON.parse(saved);
                return { ...DEFAULT_CONFIG, ...parsedConfig };
            } catch (e) {
                console.warn('[ConfigManager] Failed to parse saved config, using defaults:', e);
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
            console.warn('[ConfigManager] Failed to save config to storage:', e);
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
            console.error('[ConfigManager] Failed to import config:', e);
            return false;
        }
    }
}

// 导出单例
export const config = new ConfigManager();
