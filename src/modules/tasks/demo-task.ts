// src/modules/tasks/demo-task.ts
import { BaseTask } from '../../core/base-task';
import { logger } from '../../core/logging/logger';

export class AutoSkipTask extends BaseTask {
    constructor() {
        super('自动跳过剧情');
        this.interval = 500; // 每 500ms 检查一次
    }

    // 可选：初始化时注册图片
    async onRegister() {
        // 这是一个示例 Base64，实际开发中你需要用截图工具获取
        await this.ctx.algo.register('auto_skip_dialog_icon', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAlCAYAAAAwYKuzAAAABklEQVQDAFRfMJnDeIcFAAAAAElFTkSuQmCC');
        await this.ctx.algo.register('auto_skip_linxing_icon', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAWCAYAAAAinad/AAAABklEQVQDADWgnvXg5CljwAAAABJRU5ErkJggg==');
        logger.info('task', 'AutoSkipTask assets loaded');
    }

    async onLoop(screen: ImageData) {
        // 使用批量匹配 API - 一次性检查多个图标，大幅减少耗时
        const results = await this.ctx.algo.findBatchAsync(screen, [
            'auto_skip_dialog_icon',
            'auto_skip_linxing_icon'
        ], {
            threshold: this.ctx.engine.config.threshold,
            downsample: this.ctx.engine.config.downsample,
            earlyExit: true  // 找到任意一个就立即返回
        });

        // 查找第一个匹配的结果
        const matched = results.find(r => r !== null);

        if (matched) {
            logger.info('task', `Found ${matched.name} (score: ${matched.score.toFixed(3)}), skipping...`);

            // 按下 'A' 键（Xbox 手柄确认键）
            await this.ctx.input.tap('A');

            // 稍微等待，防止连点过快
            await this.sleep(200);
        }
    }
}
