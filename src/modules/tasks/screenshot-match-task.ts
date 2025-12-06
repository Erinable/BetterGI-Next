// src/modules/tasks/screenshot-match-task.ts
import { BaseTask } from '../../core/base-task';
import { bus, EVENTS } from '../../utils/event-bus';
import { logger } from '../../core/logging/logger';
import { config as configManager } from '../../core/config-manager';

/**
 * 截图匹配任务 - 基于用户截取的模板进行持续匹配
 */
export class ScreenshotMatchTask extends BaseTask {
    private template: ImageData;

    constructor(template: ImageData) {
        super('截图匹配');
        this.template = template;
        this.interval = 100; // 每 100ms 匹配一次
    }

    async onLoop(screen: ImageData): Promise<void> {
        const t0 = performance.now();

        // 获取 Preview 任务的 ROI 配置 (如果有)
        const previewRoi = configManager.getROIForTemplate('Preview');

        const result = await this.ctx.vision.match(screen, this.template, {
            threshold: this.ctx.engine.config.threshold,
            downsample: this.ctx.engine.config.downsample,
            scales: this.ctx.engine.config.scales,
            roiEnabled: !!previewRoi,
            roiRegions: previewRoi ? [{
                x: previewRoi.x,
                y: previewRoi.y,
                w: previewRoi.w,
                h: previewRoi.h
            }] : []
        });

        const cost = performance.now() - t0;

        if (!result) return;

        const info = this.ctx.vision.getDisplayInfo();
        if (!info) return;

        // 坐标映射
        const screenX = info.offsetX + (result.x * info.scaleX);
        const screenY = info.offsetY + (result.y * info.scaleY);
        const screenW = this.template.width * info.scaleX;
        const screenH = this.template.height * info.scaleY;

        const matchScale = result.bestScale || 1.0;
        const finalW = screenW * matchScale;
        const finalH = screenH * matchScale;

        // 始终发送 DEBUG_DRAW 以更新 HUD
        bus.emit(EVENTS.DEBUG_DRAW, {
            x: screenX + finalW / 2,
            y: screenY + finalH / 2,
            w: result.score >= this.ctx.engine.config.threshold ? finalW : 0,
            h: result.score >= this.ctx.engine.config.threshold ? finalH : 0,
            score: result.score,
            cost: cost,
            label: result.score >= this.ctx.engine.config.threshold ? '截图匹配' : '截图匹配 (低置信度)'
        });

        logger.debug('task', 'Screenshot match result', {
            score: result.score,
            cost,
            threshold: this.ctx.engine.config.threshold
        });
    }

    stop() {
        super.stop();
        // 停止时清空调试层
        bus.emit(EVENTS.DEBUG_CLEAR);
    }
}
