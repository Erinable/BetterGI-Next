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

    constructor() {
        // 加载配置，如果不存在则使用默认
        const saved = GM_getValue('BGI_CONFIG', null);
        this.config = saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    }

    // 泛型 getter
    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    // 泛型 setter，自动保存
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
        this.config[key] = value;
        this.save();
        // 通知其他模块配置已变更
        // bus.emit(EVENTS.CONFIG_UPDATE, this.config);
    }

    private save() {
        GM_setValue('BGI_CONFIG', JSON.stringify(this.config));
    }
}

// 导出单例
export const config = new ConfigManager();
