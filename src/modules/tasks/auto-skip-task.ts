// src/modules/tasks/auto-skip-task.ts
// 实现依据: migration_logic_map.md §2 自动剧情
// Workspace: 在 UI 中配置剧情跳过相关资产

import { BaseTask } from '../../core/base-task';
import { logger } from '../../core/logging/logger';
import { config as configManager, TaskAsset } from '../../core/config-manager';
import { bus, EVENTS } from '../../utils/event-bus';

/**
 * 自动剧情跳过任务
 *
 * 资产声明 (来自 migration_logic_map.md):
 * - autoplay_icon: 对话自动播放状态图标
 * - option_arrow: 选项箭头/高亮
 * - option_orange: 橙色/金色高亮选项
 * - popup_close: 弹窗关闭 X 按钮
 */
export class AutoSkipTask extends BaseTask {
    private assetConfigs: Map<string, TaskAsset> = new Map();

    constructor() {
        super('自动剧情');
        this.interval = 500;
        this.priority = 5;
        this.isExclusive = true;

        // 声明需要的资产 (与 migration_logic_map.md 保持一致)
        this.requiredAssets = [
            { name: 'autoplay_icon', description: '对话自动播放状态图标', required: true },
            { name: 'option_arrow', description: '选项箭头/高亮', required: false },
            { name: 'option_orange', description: '橙色/金色高亮选项', required: false },
            { name: 'popup_close', description: '弹窗关闭 X 按钮', required: false },
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
                await this.loadAssets();
            }
        });
    }

    async onLoop(screen: ImageData): Promise<void> {
        // 收集所有需要匹配的资产
        const assetNames: string[] = [];
        for (const [name] of this.assetConfigs) {
            assetNames.push(name);
        }

        if (assetNames.length === 0) return;

        // 批量匹配 (earlyExit: true - 找到任意一个即可行动)
        const results = await this.ctx.algo.findBatchAsync(screen, assetNames, {
            threshold: 0.8,
            earlyExit: true
        });

        // 解析结果
        let autoplayResult = null;
        let optionResult = null;
        let orangeResult = null;
        let closeResult = null;

        for (let i = 0; i < assetNames.length; i++) {
            const name = assetNames[i];
            const result = results[i];

            if (name === 'autoplay_icon' && result) autoplayResult = result;
            else if (name === 'option_arrow' && result) optionResult = result;
            else if (name === 'option_orange' && result) orangeResult = result;
            else if (name === 'popup_close' && result) closeResult = result;
        }

        // 执行逻辑 (与 migration_logic_map.md 伪代码一致)
        if (autoplayResult) {
            logger.debug('task', `${this.name}: 推进对话`);
            await this.ctx.input.tap('A');
            return;
        }

        if (optionResult) {
            if (orangeResult) {
                logger.info('task', `${this.name}: 选择橙色选项`);
            }
            await this.ctx.input.tap('A');
            return;
        }

        if (closeResult) {
            logger.info('task', `${this.name}: 关闭弹窗`);
            await this.ctx.input.tap('B');
        }
    }
}
