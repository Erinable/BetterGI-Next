// 定义配置的形状
export interface AppConfig {
    threshold: number;
    autoSkip: boolean;
    debugMode: boolean;
    loopInterval: number;
}

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
    threshold: 0.8,
    autoSkip: false,
    debugMode: false,
    loopInterval: 1000,
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
