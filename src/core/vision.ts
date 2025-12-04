import { bus, EVENTS } from '../utils/event-bus';

export class VisionSystem {
    private worker: Worker;
    private video: HTMLVideoElement | null = null;
    private canvas = document.createElement('canvas');
    private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    private callbacks = new Map<number, Function>();
    private msgId = 0;

    constructor() {
        const blob = new Blob([__WORKER_CODE__], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        
        this.worker.onmessage = (e) => {
            const { id, type, result } = e.data;
            if (type === 'INIT_DONE') {
                console.log('[BGI] Vision Worker Ready');
            } else if (type === 'MATCH_RESULT') {
                if (this.callbacks.has(id)) {
                    this.callbacks.get(id)!(result);
                    this.callbacks.delete(id);
                }
            }
        };

        setInterval(() => this.scanVideo(), 1000);
    }

    private scanVideo() {
        if (this.video?.isConnected && this.video.videoWidth > 0) return;
        
        const v = document.querySelector('video');
        if (v && v.videoWidth > 0) {
            this.video = v;
            console.log(`[BGI] Locked Video: ${v.videoWidth}x${v.videoHeight}`);
        }
    }

    /**
     * [关键逻辑] 获取视觉基准信息
     * @returns source: 图像数据源(Video), visualRect: 屏幕显示区域
     */
    private getSourceContext() {
        const video = this.video;
        // 尝试寻找 Better-xCloud 的渲染 Canvas (仅用于获取位置和尺寸)
        const gameCanvas = document.querySelector('#game-stream canvas') || document.querySelector('canvas');
        
        // 1. 确定数据源：永远优先使用 Video，因为 Canvas 可能是 WebGL 且无法读取
        if (!video || video.videoWidth === 0) return null;
        
        // 2. 确定显示区域 (Visual Rect)
        // 优先用 Canvas 的 rect，因为 Video 可能被隐藏了 (width=0 或 opacity=0)
        let visualRect = video.getBoundingClientRect();
        
        if (gameCanvas && gameCanvas.getBoundingClientRect().width > 0) {
            // 如果 Canvas 存在且可见，它就是用户看到的画面
            visualRect = gameCanvas.getBoundingClientRect();
        } else if (visualRect.width === 0) {
            // 兜底：如果都不可见，假设全屏
            visualRect = { 
                left: 0, top: 0, 
                width: window.innerWidth, height: window.innerHeight,
                x: 0, y: 0, bottom: 0, right: 0, toJSON: ()=>{}
            };
        }

        return { source: video, visualRect };
    }

    /**
     * 获取当前画面 (主循环使用)
     * 策略：始终从 Video 读取像素，但调整 Canvas 尺寸以匹配 Video 的原始分辨率
     */
    getImageData() {
        const ctx = this.getSourceContext();
        if (!ctx) return null;
        const { source } = ctx;

        const w = source.videoWidth;
        const h = source.videoHeight;

        if (w === 0 || h === 0) return null;

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w; this.canvas.height = h;
        }

        try {
            this.ctx.drawImage(source, 0, 0, w, h);
            return this.ctx.getImageData(0, 0, w, h);
        } catch (e) {
            return null;
        }
    }

    /**
     * 截图取模
     */
    captureTemplate(rect: { x: number, y: number, w: number, h: number }) {
        const ctxInfo = this.getSourceContext();
        if (!ctxInfo) return null;
        const { source, visualRect } = ctxInfo;

        const sourceW = source.videoWidth;
        const sourceH = source.videoHeight;

        // 计算缩放比例：原始视频 / 屏幕显示
        const scaleX = sourceW / visualRect.width;
        const scaleY = sourceH / visualRect.height;

        // 坐标转换：UI坐标 -> Video原始坐标
        const realX = Math.floor((rect.x - visualRect.left) * scaleX);
        const realY = Math.floor((rect.y - visualRect.top) * scaleY);
        const realW = Math.floor(rect.w * scaleX);
        const realH = Math.floor(rect.h * scaleY);

        if (realW <= 0 || realH <= 0) return null;

        const tmpC = document.createElement('canvas');
        tmpC.width = realW;
        tmpC.height = realH;
        const ctx = tmpC.getContext('2d');
        if (!ctx) return null;

        try {
            // 从 Video (source) 中截取，确保能拿到像素
            ctx.drawImage(source, realX, realY, realW, realH, 0, 0, realW, realH);
            
            // 验证是否截取到了黑屏 (可选)
            // const check = ctx.getImageData(0, 0, realW, realH);
            // ... 检查 check.data ...

            const base64 = tmpC.toDataURL('image/png');
            GM_setClipboard(base64);
            console.log(`[Vision] Captured from Video: ${realW}x${realH} at (${realX},${realY})`);
            
            return ctx.getImageData(0, 0, realW, realH);
        } catch (e) {
            console.error('[Vision] Crop error:', e);
            return null;
        }
    }

    /**
     * 获取显示映射信息 (用于将识别结果映射回 UI)
     */
    getDisplayInfo() {
        const ctx = this.getSourceContext();
        if (!ctx) return null;
        const { source, visualRect } = ctx;

        return {
            scaleX: visualRect.width / source.videoWidth,
            scaleY: visualRect.height / source.videoHeight,
            offsetX: visualRect.left,
            offsetY: visualRect.top
        };
    }

    async match(screen: ImageData, template: ImageData, options: any) {
        if (!screen) return null;
        return new Promise<any>(resolve => {
            const id = ++this.msgId;
            this.callbacks.set(id, resolve);
            const transfer = [screen.data.buffer];
            this.worker.postMessage({
                id, type: 'MATCH',
                payload: { image: screen, template, config: options }
            }, transfer);
        });
    }
}
