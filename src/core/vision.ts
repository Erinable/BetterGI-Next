import { bus, EVENTS } from '../utils/event-bus';
import { performanceMonitor } from './performance/monitor';
import { logger } from './logging/logger';

interface FrameCache {
    data: ImageData;
    timestamp: number;
    hash: string;
}

export class VisionSystem {
    private _worker: Worker;
    private _video: HTMLVideoElement | null = null;
    private _canvas = document.createElement('canvas');
    private _ctx = this._canvas.getContext('2d', { willReadFrequently: true })!;
    private callbacks = new Map<number, Function>();
    private msgId = 0;

    // 性能优化相关
    private frameCache = new Map<string, FrameCache>();
    private maxCacheSize = 10;
    private cacheExpiryTime = 100; // 100ms
    private lastFrameHash = '';
    private performanceEnabled = true;

    // 定时器引用，用于销毁时清理
    private scanVideoIntervalId: number | null = null;
    private cleanCacheIntervalId: number | null = null;

    // 公开只读访问器
    get worker(): Worker { return this._worker; }
    get video(): HTMLVideoElement | null { return this._video; }
    get canvas(): HTMLCanvasElement { return this._canvas; }
    get ctx(): CanvasRenderingContext2D { return this._ctx; }

    constructor() {
        const blob = new Blob([__WORKER_CODE__], { type: 'application/javascript' });
        this._worker = new Worker(URL.createObjectURL(blob));

        // 发送初始化消息给Worker
        this._worker.postMessage({ type: 'INIT' });

        // Worker 错误处理
        this._worker.onerror = (e: ErrorEvent) => {
            logger.error('vision', 'Worker error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno
            });
        };

        this._worker.onmessage = (e) => {
            const { id, type, result } = e.data;
            if (type === 'INIT_DONE') {
                logger.info('vision', 'Worker ready');
                // 请求Worker统计信息
                this.getWorkerStats();
            } else if (type === 'MATCH_RESULT') {
                if (this.callbacks.has(id)) {
                    // 记录缓存命中/未命中
                    if (result.cacheHit) {
                        performanceMonitor.recordCacheHit();
                    } else {
                        performanceMonitor.recordCacheMiss();
                    }

                    // 结束性能测量
                    const performanceData = {
                        score: result.score,
                        bestScale: result.bestScale,
                        usedROI: result.usedROI,
                        templateWidth: result.templateWidth,
                        templateHeight: result.templateHeight,
                        adaptiveScaling: result.adaptiveScaling
                    };

                    performanceMonitor.recordMatchSimple(result.performance?.duration || 0, performanceData);

                    this.callbacks.get(id)!(result);
                    this.callbacks.delete(id);
                }
            } else if (type === 'BATCH_MATCH_RESULT') {
                // 批量匹配结果
                if (this.callbacks.has(id)) {
                    logger.debug('vision', 'Batch match completed', {
                        templateCount: result.templateCount,
                        matchedCount: result.matchedCount,
                        totalDuration: result.totalDuration
                    });
                    this.callbacks.get(id)!(result);
                    this.callbacks.delete(id);
                }
            } else if (type === 'STATS') {
                // Worker统计信息回调
                logger.debug('vision', 'Worker stats received', { stats: result.stats });
                bus.emit(EVENTS.PERFORMANCE_WORKER_STATS, result.stats);
            }
        };

        this.scanVideoIntervalId = window.setInterval(() => this.scanVideo(), 1000);

        // 定期清理缓存
        this.cleanCacheIntervalId = window.setInterval(() => this.cleanFrameCache(), 5000);
    }

    private scanVideo() {
        if (this._video?.isConnected && this._video.videoWidth > 0) return;

        const v = document.querySelector('video');
        if (v && v.videoWidth > 0) {
            this._video = v;
            logger.info('vision', `Video locked: ${v.videoWidth}x${v.videoHeight}`);
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
     * 生成帧哈希
     */
    private generateFrameHash(imageData: ImageData): string {
        // 简单的哈希算法：采样部分像素
        const data = imageData.data;
        let hash = '';
        const step = Math.max(1, Math.floor(data.length / 1000)); // 采样1000个点

        for (let i = 0; i < data.length; i += step * 4) {
            hash += data[i].toString(16).padStart(2, '0');
        }

        return hash;
    }

    /**
     * 清理过期帧缓存
     */
    private cleanFrameCache() {
        const now = Date.now();
        for (const [key, frame] of this.frameCache.entries()) {
            if (now - frame.timestamp > this.cacheExpiryTime || this.frameCache.size > this.maxCacheSize) {
                this.frameCache.delete(key);
            }
        }
    }

    /**
     * 获取当前画面 (主循环使用)
     * 策略：支持帧缓存以提高性能
     */
    getImageData() {
        const ctx = this.getSourceContext();
        if (!ctx) return null;
        const { source } = ctx;

        const w = source.videoWidth;
        const h = source.videoHeight;

        if (w === 0 || h === 0) return null;

        // 记录帧捕获
        if (this.performanceEnabled) {
            performanceMonitor.recordFrameSimple();
        }

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w; this.canvas.height = h;
        }

        try {
            this.ctx.drawImage(source, 0, 0, w, h);
            const imageData = this.ctx.getImageData(0, 0, w, h);

            // 检查缓存
            const frameHash = this.generateFrameHash(imageData);
            if (this.lastFrameHash === frameHash) {
                // 帧未变化，返回缓存（如果启用缓存）
                const cachedFrame = Array.from(this.frameCache.values()).find(
                    f => f.hash === frameHash && Date.now() - f.timestamp < this.cacheExpiryTime
                );
                if (cachedFrame) {
                    return cachedFrame.data;
                }
            }

            this.lastFrameHash = frameHash;

            // 添加到缓存
            if (this.frameCache.size < this.maxCacheSize) {
                this.frameCache.set(frameHash, {
                    data: imageData,
                    timestamp: Date.now(),
                    hash: frameHash
                });
            }

            return imageData;
        } catch (e) {
            return null;
        }
    }

    /**
     * 截图取模
     */
    async captureTemplate(rect: { x: number, y: number, w: number, h: number }) {
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

            // 尝试复制到剪贴板
            try {
                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(base64);
                } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    // 使用现代 Clipboard API
                    await navigator.clipboard.writeText(base64);
                } else {
                    logger.warn('vision', 'Unable to copy to clipboard - no clipboard API available');
                }
            } catch (e) {
                logger.warn('vision', 'Failed to copy to clipboard', { error: e });
            }

            logger.debug('vision', `Captured from video: ${realW}x${realH} at (${realX},${realY})`);

            return ctx.getImageData(0, 0, realW, realH);
        } catch (e) {
            logger.error('vision', 'Crop error', { error: e });
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

        // 开始性能测量
        const perfMeasurement = this.performanceEnabled ? performanceMonitor.startMatch() : null;

        return new Promise<any>(resolve => {
            const id = ++this.msgId;
            this.callbacks.set(id, (result: any) => {
                // 结束性能测量
                if (perfMeasurement) {
                    perfMeasurement.end(result);
                }
                resolve(result);
            });

            // 构建增强的配置对象
            const enhancedConfig = {
                ...options,
                // ROI配置
                roi: {
                    enabled: options.roiEnabled || false,
                    regions: options.roiRegions || []
                },
                // 性能配置
                adaptiveScaling: options.adaptiveScaling !== false,
                earlyTermination: options.earlyTermination !== false,
                matchingMethod: options.matchingMethod || 'TM_CCOEFF_NORMED',
                // 缓存配置
                cacheEnabled: options.frameCacheEnabled !== false
            };

            // 安全的ArrayBuffer传输 - 创建副本避免重复传输问题
            const screenDataClone = new Uint8ClampedArray(screen.data);
            const screenClone = new ImageData(
                screenDataClone,
                screen.width,
                screen.height
            );

            // 同样为template创建安全副本
            const templateDataClone = new Uint8ClampedArray(template.data);
            const templateClone = new ImageData(
                templateDataClone,
                template.width,
                template.height
            );

            const transfer = [screenDataClone.buffer, templateDataClone.buffer];
            this.worker.postMessage({
                id, type: 'MATCH',
                payload: { image: screenClone, template: templateClone, config: enhancedConfig }
            }, transfer);
        });
    }

    /**
     * 获取Worker统计信息
     */
    getWorkerStats() {
        this.worker.postMessage({ type: 'GET_STATS' });
    }

    /**
     * 清理Worker缓存
     */
    clearWorkerCache() {
        this.worker.postMessage({ type: 'CLEAR_CACHE' });
    }

    /**
     * 启用/禁用性能监控
     */
    setPerformanceEnabled(enabled: boolean) {
        this.performanceEnabled = enabled;
        performanceMonitor.setEnabled(enabled);
    }

    /**
     * 获取性能指标
     */
    getPerformanceMetrics() {
        return performanceMonitor.getPerformanceStats();
    }

    /**
     * 重置性能指标
     */
    resetPerformanceMetrics() {
        performanceMonitor.reset();
        this.cleanFrameCache();
        this.clearWorkerCache();
    }

    /**
     * 设置ROI区域
     */
    setROIRegions(regions: Array<{ x: number, y: number, w: number, h: number, name: string }>) {
        // ROI配置通过match方法的options参数传递
        bus.emit(EVENTS.CONFIG_UPDATE, { roiRegions: regions });
    }

    /**
     * 批量匹配 - 多个模板共用一个源图像，大幅减少开销
     * @param screen 屏幕截图
     * @param templates 模板数组 [{name, data: ImageData, roi?: {x,y,w,h}}] - 每个模板可指定自己的ROI
     * @param options 匹配配置
     * @returns 匹配结果数组
     */
    batchMatch(
        screen: ImageData,
        templates: Array<{
            name: string;
            data: ImageData;
            roi?: { x: number, y: number, w: number, h: number };  // 模板级 ROI
        }>,
        options: {
            threshold?: number;
            downsample?: number;
            grayscale?: boolean;
            earlyExit?: boolean;
            useROI?: boolean;  // 全局 ROI 开关
            roiRegions?: Array<{ x: number, y: number, w: number, h: number, name?: string }>;  // 全局 ROI
        } = {}
    ): Promise<{
        results: Array<{
            name: string;
            score: number;
            x: number;
            y: number;
            matched: boolean;
            duration: number;
            usedROI?: boolean;
        }>;
        totalDuration: number;
        matchedCount: number;
    }> {
        return new Promise((resolve, reject) => {
            const id = this.msgId++;

            const timeoutId = setTimeout(() => {
                this.callbacks.delete(id);
                reject(new Error('Batch match timeout'));
            }, 30000);

            this.callbacks.set(id, (result: any) => {
                clearTimeout(timeoutId);
                resolve(result);
            });

            // 创建安全副本
            const screenDataClone = new Uint8ClampedArray(screen.data);
            const screenClone = new ImageData(screenDataClone, screen.width, screen.height);

            // 模板副本 - 包含模板级 ROI
            const templatesClone = templates.map(t => {
                const dataClone = new Uint8ClampedArray(t.data.data);
                return {
                    name: t.name,
                    data: new ImageData(dataClone, t.data.width, t.data.height),
                    width: t.data.width,
                    height: t.data.height,
                    roi: t.roi  // 模板级 ROI (可选)
                };
            });

            const transfer = [screenDataClone.buffer, ...templatesClone.map(t => t.data.data.buffer)];

            this._worker.postMessage({
                id,
                type: 'BATCH_MATCH',
                payload: {
                    image: screenClone,
                    templates: templatesClone,
                    config: {
                        threshold: options.threshold || 0.8,
                        downsample: options.downsample || 0.33,
                        grayscale: options.grayscale !== false,
                        earlyExit: options.earlyExit || false,
                        roi: options.useROI ? {
                            enabled: true,
                            regions: options.roiRegions || []
                        } : { enabled: false, regions: [] }
                    }
                }
            }, transfer);
        });
    }

    /**
     * 销毁视觉系统，清理所有资源
     */
    destroy() {
        // 清理定时器
        if (this.scanVideoIntervalId !== null) {
            clearInterval(this.scanVideoIntervalId);
            this.scanVideoIntervalId = null;
        }
        if (this.cleanCacheIntervalId !== null) {
            clearInterval(this.cleanCacheIntervalId);
            this.cleanCacheIntervalId = null;
        }

        // 终止 Worker
        this._worker.terminate();

        // 清理缓存
        this.frameCache.clear();
        this.callbacks.clear();

        // 清理视频引用
        this._video = null;

        logger.info('vision', 'VisionSystem destroyed');
    }
}

