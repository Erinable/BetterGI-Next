/// <reference lib="webworker" />

declare const cv: any;
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

// --- Interfaces ---

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface MatchConfig {
    threshold?: number;
    scales?: number[];
    downsample?: number;
    grayscale?: boolean;
    adaptiveScaling?: boolean;
    matchingMethod?: string;
    earlyTermination?: boolean;
    earlyExit?: boolean; // For batch match
    roi?: {
        enabled: boolean;
        regions: Rect[];
    };
}

interface PerformanceStats {
    duration: number;
    matchCount: number;
    averageTime: number;
}

interface MatchResult {
    score: number;
    x: number;
    y: number;
    scale?: number;     // Used for the final scale of the match
    bestScale?: number; // Alias often used
    usedROI: boolean;
    adaptiveScaling: boolean;
    cacheHit?: boolean;
    performance?: PerformanceStats;
    templateWidth?: number;
    templateHeight?: number;
}

interface BatchMatchResultItem {
    name: string;
    score: number;
    x: number;
    y: number;
    matched: boolean;
    duration: number;
    cacheHit: boolean;
    usedROI: boolean;
}

interface ProcessedImage {
    mat: any;
    scaleFactor: number;
    isGrayscale: boolean;
}

// --- Resource Management ---

class MatScope {
    private mats: any[] = [];

    // Register a Mat (or Size/Rect) to be cleaned up later
    add(mat: any): any {
        if (mat && typeof mat.delete === 'function') {
            this.mats.push(mat);
        }
        return mat;
    }

    // Execute a function within a scope, automatically cleaning up registered Mats
    static run<T>(fn: (scope: MatScope) => T): T {
        const scope = new MatScope();
        try {
            return fn(scope);
        } finally {
            scope.release();
        }
    }

    release() {
        for (const mat of this.mats) {
            try {
                if (mat && !mat.isDeleted()) {
                    mat.delete();
                }
            } catch (e) {
                // Ignore errors during deletion (e.g. already deleted)
            }
        }
        this.mats = [];
    }
}

// --- Caching ---

interface CachedTemplate {
    mat: any;
    width: number;
    height: number;
    timestamp: number;
}

class TemplateCache {
    private cache = new Map<string, CachedTemplate>();
    private maxSize: number;
    private expireTime: number;

    constructor(maxSize: number = 50, expireTime: number = 300000) {
        this.maxSize = maxSize;
        this.expireTime = expireTime;
    }

    get(key: string): CachedTemplate | undefined {
        const item = this.cache.get(key);
        if (item) {
            item.timestamp = Date.now();
            return item;
        }
        return undefined;
    }

    set(key: string, item: CachedTemplate) {
        if (this.cache.size >= this.maxSize) {
            this.clean();
        }
        this.cache.set(key, item);
    }

    clean() {
        const now = Date.now();
        // Remove expired items
        for (const [key, val] of this.cache.entries()) {
            if (now - val.timestamp > this.expireTime) {
                this.delete(key);
            }
        }

        // If still too big, remove LRU
        if (this.cache.size >= this.maxSize) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;

            for (const [key, val] of this.cache.entries()) {
                if (val.timestamp < oldestTime) {
                    oldestTime = val.timestamp;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                this.delete(oldestKey);
            }
        }
    }

    delete(key: string) {
        const item = this.cache.get(key);
        if (item) {
            try {
                if (item.mat && !item.mat.isDeleted()) item.mat.delete();
            } catch (e) {}
            this.cache.delete(key);
        }
    }

    clear() {
        for (const key of this.cache.keys()) {
            this.delete(key);
        }
    }

    get size() {
        return this.cache.size;
    }
}

// --- Logic ---

class CVWorkerController {
    private templateCache = new TemplateCache(50);

    private stats = {
        matchCount: 0,
        totalTime: 0
    };

    constructor() {
        // Bind message handler
        self.onmessage = this.handleMessage.bind(this);
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) {
        self.postMessage({ type: 'WORKER_LOG', level, message, data });
    }

    // Wait for OpenCV initialization
    private async waitForCV(): Promise<void> {
        if (typeof cv !== 'undefined' && cv.Mat) return;

        return new Promise((resolve) => {
            if (typeof cv !== 'undefined' && cv.onRuntimeInitialized) {
                resolve();
            } else {
                const check = () => {
                    if (typeof cv !== 'undefined' && cv.Mat) {
                        resolve();
                    } else {
                        setTimeout(check, 10);
                    }
                };

                if (typeof (self as any).cv === 'undefined') {
                     (self as any).Module = {
                        onRuntimeInitialized: resolve
                    };
                } else {
                    check();
                }
            }
        });
    }

    private async handleMessage(e: MessageEvent) {
        const { id, type, payload } = e.data;

        try {
            await this.waitForCV();

            if (type === 'INIT') {
                self.postMessage({ type: 'INIT_DONE' });
            }
            else if (type === 'MATCH') {
                const result = this.handleSingleMatch(payload);
                self.postMessage({ id, type: 'MATCH_RESULT', result });
            }
            else if (type === 'BATCH_MATCH') {
                const result = this.handleBatchMatch(payload);
                self.postMessage({ id, type: 'BATCH_MATCH_RESULT', result });
            }
            else if (type === 'CLEAR_CACHE') {
                this.templateCache.clear();
                self.postMessage({ type: 'CACHE_CLEARED' });
            }
            else if (type === 'GET_STATS') {
                self.postMessage({
                    type: 'STATS',
                    stats: {
                        cacheSize: this.templateCache.size,
                        matchCount: this.stats.matchCount,
                        averageTime: this.stats.matchCount > 0 ? this.stats.totalTime / this.stats.matchCount : 0,
                        totalTime: this.stats.totalTime
                    }
                });
            }
        } catch (err: any) {
            this.log('error', 'Worker Error', err.message);
            self.postMessage({ id, type: 'ERROR', error: err.message });
        }
    }

    private getTemplateMat(
        template: any,
        config: MatchConfig,
        scope: MatScope
    ): { mat: any; isCached: boolean } {
        const templateKey = this.generateTemplateKey(template, config);
        const cached = this.templateCache.get(templateKey);

        if (cached) {
            return { mat: cached.mat, isCached: true };
        }

        // 未命中：处理并缓存
        // 注意：preprocessImage 将 mat 加入了 scope，意味着当前 scope 结束时它会被销毁
        const templProc = this.preprocessImage(template, config, scope);

        // 必须 clone 一份持久化的存入缓存，不受 scope 管理
        const toCache = templProc.mat.clone();

        this.templateCache.set(templateKey, {
            mat: toCache,
            width: template.width,
            height: template.height,
            timestamp: Date.now()
        });

        return { mat: templProc.mat, isCached: false };
    }

    private handleSingleMatch(payload: any): MatchResult {
        const startTime = performance.now();
        const { image, template, config } = payload;

        return MatScope.run(scope => {
            const srcProc = this.preprocessImage(image, config, scope);
            // 使用提取的帮助函数
            const { mat: templMat, isCached } = this.getTemplateMat(template, config, scope);

            const result = this.runMatching(srcProc.mat, templMat, config, srcProc.scaleFactor, scope);

            const duration = performance.now() - startTime;
            this.stats.matchCount++;
            this.stats.totalTime += duration;

            return {
                ...result,
                cacheHit: isCached, // 使用返回的状态
                performance: {
                    duration: Math.round(duration * 100) / 100,
                    matchCount: this.stats.matchCount,
                    averageTime: Math.round((this.stats.totalTime / this.stats.matchCount) * 100) / 100
                },
                templateWidth: template.width,
                templateHeight: template.height
            };
        });
    }

    // 【优化 1】嵌套 Scope 解决批量匹配内存堆积
    private handleBatchMatch(payload: any): any {
        const startTime = performance.now();
        const { image, templates, config } = payload;
        const results: BatchMatchResultItem[] = [];

        // 外层 Scope：只管理 Source Image，因为它在整个批量过程中都需要
        MatScope.run(srcScope => {
            const srcProc = this.preprocessImage(image, config, srcScope);

            for (let i = 0; i < templates.length; i++) {
                const template = templates[i];

                // 内层 Scope：管理单个模板匹配产生的临时内存 (Resized templates, masks, dsts)
                // 每次循环结束，立即释放这些内存
                MatScope.run(itemScope => {
                    const itemStartTime = performance.now();
                    const { mat: templMat, isCached } = this.getTemplateMat(template, config, itemScope);

                    let matchRes: any;

                    // 这里的逻辑保持不变，但传入的是 itemScope
                    if (template.roi && template.roi.x !== undefined) {
                        const sRoi = this.getScaledRoi(template.roi, srcProc.scaleFactor, srcProc.mat.size());
                        if (sRoi) {
                            matchRes = this.matchWithROI(srcProc.mat, templMat, sRoi, config, srcProc.scaleFactor, itemScope);
                        } else {
                            matchRes = this.optimizedMatchTemplate(srcProc.mat, templMat, config, srcProc.scaleFactor, itemScope);
                        }
                    } else if (config.roi && config.roi.enabled && config.roi.regions && config.roi.regions.length > 0) {
                        matchRes = this.runMatchingWithRegions(srcProc.mat, templMat, config, srcProc.scaleFactor, itemScope);
                    } else {
                        matchRes = this.optimizedMatchTemplate(srcProc.mat, templMat, config, srcProc.scaleFactor, itemScope);
                    }

                    results.push({
                        name: template.name || `template_${i}`,
                        score: matchRes.score,
                        x: matchRes.x,
                        y: matchRes.y,
                        matched: matchRes.score >= (config.threshold || 0.8),
                        duration: Math.round((performance.now() - itemStartTime) * 100) / 100,
                        cacheHit: isCached,
                        usedROI: matchRes.usedROI
                    });
                }); // itemScope 结束，单个模板的临时内存被回收

                // Early exit 逻辑 (注意：break 会跳出 for 循环，srcScope 正常在最后释放)
                const lastResult = results[results.length - 1];
                if (config.earlyExit && lastResult.matched) {
                    break;
                }
            }
        }); // srcScope 结束，源图像被回收

        // ... 统计代码 ...
        const totalDuration = performance.now() - startTime;
        this.stats.matchCount += templates.length;
        this.stats.totalTime += totalDuration;

        return {
            results,
            totalDuration: Math.round(totalDuration * 100) / 100,
            templateCount: templates.length,
            matchedCount: results.filter(r => r.matched).length
        };
    }

    private preprocessImage(rawImage: any, config: MatchConfig, scope: MatScope): ProcessedImage {
        let mat: any;

        if (rawImage instanceof ImageData || (rawImage.data && rawImage.width && rawImage.height)) {
            mat = scope.add(cv.matFromImageData(rawImage));
        } else {
            throw new Error("Invalid image data");
        }

        let scale = 1.0;
        let downsample = config.downsample || 1.0;

        // Smart downsample check
        if (downsample !== 1.0) {
             const projectedW = Math.floor(mat.cols * downsample);
             const projectedH = Math.floor(mat.rows * downsample);
             if (projectedW < 16 || projectedH < 16) {
                 downsample = 1.0;
             }
        }

        if (downsample !== 1.0) {
            let resized = scope.add(new cv.Mat());
            let size = scope.add(new cv.Size());
            cv.resize(mat, resized, size, downsample, downsample, cv.INTER_LINEAR);
            mat = resized;
            scale = downsample;
        }

        const useGrayscale = config.grayscale !== false;
        if (useGrayscale) {
            let gray = scope.add(new cv.Mat());
            if (mat.channels() === 4) {
                cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
            } else if (mat.channels() === 3) {
                cv.cvtColor(mat, gray, cv.COLOR_RGB2GRAY);
            } else {
                gray = mat;
            }
            if (gray !== mat) {
                 mat = gray;
            }
        }

        return { mat, scaleFactor: scale, isGrayscale: useGrayscale };
    }

    private generateTemplateKey(template: any, config: MatchConfig): string {
        const downsample = config.downsample || 1.0;
        const gray = config.grayscale !== false ? 'gray' : 'color';
        return `${template.width}x${template.height}_${downsample}_${gray}`;
    }

    private getScaledRoi(roi: Rect, scale: number, imageSize: any): Rect | null {
        const sRoi = {
            x: Math.floor(roi.x * scale),
            y: Math.floor(roi.y * scale),
            w: Math.floor(roi.w * scale),
            h: Math.floor(roi.h * scale)
        };

        if (sRoi.x < 0) sRoi.x = 0;
        if (sRoi.y < 0) sRoi.y = 0;

        if (sRoi.x >= imageSize.width || sRoi.y >= imageSize.height || sRoi.w <= 0 || sRoi.h <= 0) {
            return null;
        }

        if (sRoi.x + sRoi.w > imageSize.width) sRoi.w = imageSize.width - sRoi.x;
        if (sRoi.y + sRoi.h > imageSize.height) sRoi.h = imageSize.height - sRoi.y;

        return sRoi;
    }

    private runMatching(src: any, templ: any, config: MatchConfig, scale: number, scope: MatScope): MatchResult {
        let bestRes: MatchResult = {
            score: -1, x: 0, y: 0, scale: 1.0, usedROI: false, adaptiveScaling: false
        };

        if (config.roi && config.roi.enabled && config.roi.regions && config.roi.regions.length > 0) {
            bestRes = this.runMatchingWithRegions(src, templ, config, scale, scope);
        } else {
            bestRes = this.optimizedMatchTemplate(src, templ, config, scale, scope);
        }

        const invScale = 1.0 / scale;
        return {
            ...bestRes,
            x: bestRes.x * invScale,
            y: bestRes.y * invScale
        };
    }

    private runMatchingWithRegions(src: any, templ: any, config: MatchConfig, currentScale: number, scope: MatScope): MatchResult {
        let bestRes: MatchResult = { score: -1, x: 0, y: 0, scale: 1.0, usedROI: false, adaptiveScaling: false };
        let validRegionFound = false;

        for (const roi of config.roi!.regions!) {
            const sRoi = this.getScaledRoi(roi, currentScale, src.size());

            if (!sRoi) continue;

            if (sRoi.w < templ.cols || sRoi.h < templ.rows) continue;

            validRegionFound = true;
            const res = this.matchWithROI(src, templ, sRoi, config, currentScale, scope);

            if (res.score > bestRes.score) {
                bestRes = res;
            }

            if (config.earlyTermination && bestRes.score >= 0.95) break;
        }

        if (!validRegionFound) {
            bestRes = this.optimizedMatchTemplate(src, templ, config, currentScale, scope);
            bestRes.usedROI = false;
        }

        return bestRes;
    }

    private matchWithROI(src: any, templ: any, roi: Rect, config: MatchConfig, currentScale: number, scope: MatScope): MatchResult {
        const roiRect = scope.add(new cv.Rect(roi.x, roi.y, roi.w, roi.h));
        const roiMat = scope.add(src.roi(roiRect));

        const res = this.optimizedMatchTemplate(roiMat, templ, config, currentScale, scope);

        if (res.score > 0) {
            res.x += roi.x;
            res.y += roi.y;
        }
        res.usedROI = true;
        return res;
    }

    // 【优化 2】复用 Dst 和 Mask，避免循环内分配
    private optimizedMatchTemplate(src: any, templ: any, config: MatchConfig, currentScale: number, scope: MatScope): MatchResult {
        let bestRes = { score: -1, x: 0, y: 0, scale: 1.0, adaptiveScaling: false, usedROI: false };

        const method = config.matchingMethod === 'TM_SQDIFF_NORMED' ? cv.TM_SQDIFF_NORMED :
                       config.matchingMethod === 'TM_CCORR_NORMED' ? cv.TM_CCORR_NORMED :
                       cv.TM_CCOEFF_NORMED;

        // 在循环外创建 Mat，复用内存
        const dst = scope.add(new cv.Mat());
        const mask = scope.add(new cv.Mat());

        const scales = config.scales || [1.0];

        for (const s of scales) {
             let sTempl = templ;
             // 只有当需要 resize 时才创建新的 Mat
             if (s !== 1.0) {
                 sTempl = scope.add(new cv.Mat());
                 // 使用 null 让 OpenCV 自动计算大小，或者复用 Size 对象
                 const size = scope.add(new cv.Size());
                 cv.resize(templ, sTempl, size, s, s, cv.INTER_LINEAR);
             }

             // 边界检查：如果模板比源图大，直接跳过
             if (src.cols < sTempl.cols || src.rows < sTempl.rows) {
                 continue;
             }

             // 执行匹配，复用 dst 和 mask
             cv.matchTemplate(src, sTempl, dst, method, mask);
             const res = cv.minMaxLoc(dst, mask);

             const score = method === cv.TM_SQDIFF_NORMED ? 1 - res.minVal : res.maxVal;

             if (score > bestRes.score) {
                 bestRes = { score, x: res.maxLoc.x, y: res.maxLoc.y, scale: s, adaptiveScaling: false, usedROI: false };
             }

             // Early termination
             if (config.earlyTermination && bestRes.score >= (config.threshold || 0.8) && bestRes.score > 0.95) {
                 break;
             }
        }

        return bestRes;
    }
}

const controller = new CVWorkerController();
