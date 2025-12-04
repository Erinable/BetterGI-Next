import { bus, EVENTS } from '../utils/event-bus';

export class StreamObserver {
    constructor() {
        this.checkStreamQuality();
    }

    checkStreamQuality() {
        const video = document.querySelector('video');
        if (!video) return;

        // 监听视频卡顿/加载事件
        video.addEventListener('waiting', () => {
            console.warn('[BGI] Stream Buffering...');
            bus.emit(EVENTS.TASK_PAUSE); // 自动暂停任务
        });

        video.addEventListener('playing', () => {
            console.log('[BGI] Stream Resumed');
            bus.emit(EVENTS.TASK_RESUME); // 自动恢复任务
        });
        
        // 也可以检查 video.videoWidth 是否发生变化（分辨率自适应）
    }
}
