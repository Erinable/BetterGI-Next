import { bus, EVENTS } from '../utils/event-bus';
import { logger } from './logging/logger';

export class StreamObserver {
    constructor() {
        this.checkStreamQuality();
    }

    checkStreamQuality() {
        const video = document.querySelector('video');
        if (!video) return;

        // 监听视频卡顿/加载事件
        video.addEventListener('waiting', () => {
            logger.warn('stream', 'Stream buffering...');
            bus.emit(EVENTS.TASK_PAUSE); // 自动暂停任务
        });

        video.addEventListener('playing', () => {
            logger.info('stream', 'Stream resumed');
            bus.emit(EVENTS.TASK_RESUME); // 自动恢复任务
        });
        
        // 也可以检查 video.videoWidth 是否发生变化（分辨率自适应）
    }
}
