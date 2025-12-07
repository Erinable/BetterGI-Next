// src/modules/tasks/auto-pick-task.ts
// 实现依据: migration_logic_map.md §1 自动拾取
// Workspace: 在 UI 中配置拾取相关资产

import { BaseTask } from '../../core/base-task';
import { logger } from '../../core/logging/logger';
import { config as configManager, TaskAsset } from '../../core/config-manager';
import { bus, EVENTS } from '../../utils/event-bus';

/**
 * 自动拾取任务
 *
 * 资产声明 (来自 migration_logic_map.md):
 * - pickup_icon: Xbox 拾取提示 (X/RB)
 * - exclude_chat: 聊天气泡图标
 * - exclude_settings: 设置齿轮图标
 * - scroll_icon: 列表滚动提示 (可选)
 */
export class AutoPickTask extends BaseTask {
    private assetConfigs: Map<string, TaskAsset> = new Map();

    constructor() {
        super('自动拾取');
        this.interval = 200;
        this.priority = 10;
        this.isExclusive = false;

        // 声明需要的资产 (与 migration_logic_map.md 保持一致)
        this.requiredAssets = [
            { name: 'pickup_icon', description: 'Xbox 拾取提示 (X/RB)', required: true },
            { name: 'exclude_chat', description: '聊天气泡图标 (排除)', required: false },
            { name: 'exclude_settings', description: '设置齿轮图标 (排除)', required: false },
            { name: 'scroll_icon', description: '列表滚动提示', required: false },
        ];
    }

    async loadAssets(): Promise<void> {
        const configAssets = configManager.getTaskAssets(this.name);
        this.assetConfigs.clear();

        for (const schema of this.requiredAssets) {
            const configAsset = configAssets.find(a => a.name === schema.name);

            if (configAsset?.base64 && configAsset.base64.length > 50) {
                await this.ctx.algo.register(schema.name, configAsset.base64);
                this.assetConfigs.set(schema.name, configAsset);
                logger.debug('task', `${this.name}: 加载资产 ${schema.name}${configAsset.roi ? ' (含ROI)' : ''}`);
            } else if (schema.required) {
                logger.warn('task', `${this.name}: 缺少必要资产 ${schema.name}`);
            }
        }

        logger.info('task', `${this.name}: 资产加载完成`);
    }

    async onRegister(): Promise<void> {
        configManager.ensureTaskConfig(this.name);

        for (const schema of this.requiredAssets) {
            const existing = configManager.getTaskAssets(this.name).find(a => a.name === schema.name);
            if (!existing) {
                configManager.setTaskAsset(this.name, {
                    name: schema.name,
                    base64: ''
                });
            }
        }

        await this.loadAssets();

        bus.on(EVENTS.ASSETS_CHANGED, async (taskName: string) => {
            if (taskName === this.name) {
                logger.info('task', `${this.name}: 检测到资产变更，重新加载`);
                await this.loadAssets();
            }
        });
    }

    async onLoop(screen: ImageData): Promise<void> {
        const pickupConfig = this.assetConfigs.get('pickup_icon');
        if (!pickupConfig) return;

        // 收集所有需要匹配的资产
        const assetNames: string[] = [];
        const roiMap: Map<string, any> = new Map();

        for (const [name, config] of this.assetConfigs) {
            assetNames.push(name);
            if (config.roi) roiMap.set(name, config.roi);
        }

        // 批量匹配所有资产
        const results = await this.ctx.algo.findBatchAsync(screen, assetNames, {
            threshold: 0.8,
            earlyExit: false
        });

        // 解析结果
        let pickupResult = null;
        let hasExclude = false;
        let scrollResult = null;

        for (let i = 0; i < assetNames.length; i++) {
            const name = assetNames[i];
            const result = results[i];

            if (name === 'pickup_icon' && result) {
                pickupResult = result;
            } else if ((name === 'exclude_chat' || name === 'exclude_settings') && result) {
                hasExclude = true;
            } else if (name === 'scroll_icon' && result) {
                scrollResult = result;
            }
        }

        // 执行逻辑
        if (pickupResult && !hasExclude) {
            logger.info('task', `${this.name}: 拾取 (${pickupResult.x}, ${pickupResult.y})`);
            await this.ctx.input.tap('X');
            await this.sleep(100);
        } else if (scrollResult) {
            // 如果有滚动图标，可能需要滚动
            logger.debug('task', `${this.name}: 检测到滚动图标`);
        } else if (hasExclude) {
            logger.debug('task', `${this.name}: 跳过交互 (检测到排除图标)`);
        }
    }
}
