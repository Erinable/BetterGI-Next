/// <reference lib="webworker" />

declare const cv: any;
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

// 模板缓存
const templateCache = new Map<string, { mat: any, width: number, height: number, timestamp: number }>();
const CACHE_EXPIRE_TIME = 300000; // 5分钟
const MAX_CACHE_SIZE = 50;

// 性能统计
let matchCount = 0;
let totalTime = 0;

// 工具函数：生成模板键
function generateTemplateKey(template: ImageData, config: any): string {
    return `${template.width}x${template.height}_${config.downsample || 1.0}_${JSON.stringify(config.scales || [1.0])}`;
}

// 工具函数：清理过期缓存
function cleanCache() {
    const now = Date.now();
    for (const [key, value] of templateCache.entries()) {
        if (now - value.timestamp > CACHE_EXPIRE_TIME || templateCache.size > MAX_CACHE_SIZE) {
            value.mat.delete();
            templateCache.delete(key);
        }
    }
}

// 工具函数：获取匹配方法
function getMatchingMethod(method: string): number {
    switch (method) {
        case 'TM_SQDIFF_NORMED': return cv.TM_SQDIFF_NORMED;
        case 'TM_CCORR_NORMED': return cv.TM_CCORR_NORMED;
        case 'TM_CCOEFF_NORMED':
        default: return cv.TM_CCOEFF_NORMED;
    }
}

// 工具函数：转换为灰度图 (减少75%数据量，加速匹配)
function toGrayscale(mat: any): any {
    const gray = new cv.Mat();
    if (mat.channels() === 4) {
        cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    } else if (mat.channels() === 3) {
        cv.cvtColor(mat, gray, cv.COLOR_RGB2GRAY);
    } else {
        return mat.clone();
    }
    return gray;
}

// 灰度模板缓存
const grayTemplateCache = new Map<string, { mat: any, timestamp: number }>();

// 优化的多尺度匹配函数
function optimizedMatchTemplate(src: any, templ: any, config: any): { score: number, x: number, y: number, scale: number, adaptiveScaling: boolean, usedROI?: boolean } {
    let bestRes: { score: number, x: number, y: number, scale: number, adaptiveScaling: boolean, usedROI?: boolean } = { score: -1, x: 0, y: 0, scale: 1.0, adaptiveScaling: false };
    const scales = config.scales || [1.0];
    const method = getMatchingMethod(config.matchingMethod || 'TM_CCOEFF_NORMED');
    const threshold = config.threshold || 0.8;
    const earlyTermination = config.earlyTermination !== false;

    // 自适应尺度策略：先用默认尺度快速匹配
    if (config.adaptiveScaling && scales.length === 1) {
        const defaultScale = scales[0];
        let sTempl = defaultScale !== 1.0 ? new cv.Mat() : templ.clone();

        if (defaultScale !== 1.0) {
            cv.resize(templ, sTempl, new cv.Size(), defaultScale, defaultScale, cv.INTER_LINEAR);
        }

        if (sTempl.cols <= src.cols && sTempl.rows <= src.rows) {
            let dst = new cv.Mat(), mask = new cv.Mat();
            cv.matchTemplate(src, sTempl, dst, method, mask);
            let res = cv.minMaxLoc(dst, mask);

            // 对于SQDIFF方法，值越小越好
            const score = method === cv.TM_SQDIFF_NORMED ? 1 - res.minVal : res.maxVal;

            if (score >= threshold) {
                bestRes = { score, x: res.maxLoc.x, y: res.maxLoc.y, scale: defaultScale, adaptiveScaling: true };
            }

            dst.delete(); mask.delete();
        }

        if (defaultScale !== 1.0) {
            sTempl.delete();
        }

        // 如果找到高置信度匹配且启用早期终止，直接返回
        if (bestRes.score >= threshold && earlyTermination) {
            return bestRes;
        }
    }

    // 标准多尺度匹配
    for (let s of scales) {
        let sTempl = new cv.Mat();
        if (s !== 1.0) cv.resize(templ, sTempl, new cv.Size(), s, s, cv.INTER_LINEAR);
        else sTempl = templ.clone();

        if (sTempl.cols <= src.cols && sTempl.rows <= src.rows) {
            let dst = new cv.Mat(), mask = new cv.Mat();
            cv.matchTemplate(src, sTempl, dst, method, mask);
            let res = cv.minMaxLoc(dst, mask);

            // 对于SQDIFF方法，值越小越好
            const score = method === cv.TM_SQDIFF_NORMED ? 1 - res.minVal : res.maxVal;

            if (score > bestRes.score) {
                bestRes = { score, x: res.maxLoc.x, y: res.maxLoc.y, scale: s, adaptiveScaling: false };
            }

            dst.delete(); mask.delete();

            // 早期终止：如果找到高置信度匹配
            if (score >= threshold && earlyTermination && score > 0.95) {
                sTempl.delete();
                break;
            }
        }
        sTempl.delete();
    }

    return bestRes;
}

// ROI匹配函数
function matchWithROI(src: any, templ: any, roi: any, config: any): any {
    // 提取ROI区域
    const roiRect = new cv.Rect(roi.x, roi.y, roi.w, roi.h);
    const roiMat = src.roi(roiRect);

    // 在ROI内匹配
    const result = optimizedMatchTemplate(roiMat, templ, config);

    // 清理
    roiMat.delete();

    // 调整坐标到原图并标记使用了ROI
    if (result.score > 0) {
        result.x += roi.x;
        result.y += roi.y;
    }
    result.usedROI = true;

    return result;
}

self.onmessage = (e: MessageEvent) => {
    const { id, type, payload } = e.data;
    if (typeof cv === 'undefined') return;

    try {
        if (type === 'INIT') {
             // OpenCV 初始化检查
             if (cv.Mat) self.postMessage({ type: 'INIT_DONE' });
        }
        else if (type === 'MATCH') {
            const startTime = performance.now();
            const { image, template, config } = payload;

            let cacheHit = false;
            let cachedTemplate = null;
            const templateKey = generateTemplateKey(template, config);

            // 清理过期缓存
            cleanCache();

            // 检查模板缓存
            if (templateCache.has(templateKey)) {
                cachedTemplate = templateCache.get(templateKey)!;
                cacheHit = true;
            }

            // 接收主线程转移过来的 Buffer
            let src = cv.matFromImageData(image);
            let templ = cachedTemplate ? cachedTemplate.mat : cv.matFromImageData(template);

            // 1. 降采样 - 提高默认降采样率
            let downsampleFactor = config.downsample || 0.33;
            if (downsampleFactor !== 1.0) {
                let dSrc = new cv.Mat(), dTempl = new cv.Mat();
                cv.resize(src, dSrc, new cv.Size(), downsampleFactor, downsampleFactor, cv.INTER_LINEAR);

                if (!cacheHit) {
                    cv.resize(templ, dTempl, new cv.Size(), downsampleFactor, downsampleFactor, cv.INTER_LINEAR);
                } else {
                    dTempl = templ.clone();
                }

                src.delete();
                if (!cacheHit) templ.delete();
                src = dSrc;
                templ = dTempl;

                // 缓存降采样后的模板
                if (!cacheHit) {
                    templateCache.set(templateKey, {
                        mat: templ.clone(),
                        width: template.width,
                        height: template.height,
                        timestamp: Date.now()
                    });
                }
            }

            // 2. ROI或全屏匹配
            let bestRes: any;
            if (config.roi && config.roi.enabled && config.roi.regions && config.roi.regions.length > 0) {
                // ROI匹配：尝试所有ROI区域
                bestRes = { score: -1, x: 0, y: 0, scale: 1.0, usedROI: false };

                for (const roi of config.roi.regions) {
                    const roiResult = matchWithROI(src, templ, roi, config);
                    if (roiResult.score > bestRes.score) {
                        bestRes = roiResult;
                    }

                    // 早期终止：如果在ROI中找到高置信度匹配
                    if (config.earlyTermination && roiResult.score >= 0.95) {
                        break;
                    }
                }
            } else {
                // 全屏匹配
                bestRes = optimizedMatchTemplate(src, templ, config);
                bestRes.usedROI = false;
            }

            src.delete();
            if (!cacheHit) templ.delete();

            const factor = 1.0 / downsampleFactor;
            const duration = performance.now() - startTime;

            // 更新性能统计
            matchCount++;
            totalTime += duration;

            self.postMessage({
                id,
                type: 'MATCH_RESULT',
                result: {
                    score: bestRes.score,
                    x: bestRes.x * factor,
                    y: bestRes.y * factor,
                    bestScale: bestRes.scale,
                    usedROI: bestRes.usedROI,
                    adaptiveScaling: bestRes.adaptiveScaling,
                    cacheHit,
                    performance: {
                        duration: Math.round(duration * 100) / 100,
                        matchCount,
                        averageTime: Math.round((totalTime / matchCount) * 100) / 100
                    },
                    templateWidth: image.width,
                    templateHeight: image.height
                }
            });
        }
        // 批量匹配 - 多模板共用一个源图像，大幅减少开销
        else if (type === 'BATCH_MATCH') {
            const startTime = performance.now();
            const { image, templates, config } = payload;
            const results: any[] = [];

            // 只创建一次源图像
            let src = cv.matFromImageData(image);

            // 降采样
            const downsampleFactor = config.downsample || 0.33;
            if (downsampleFactor !== 1.0) {
                let dSrc = new cv.Mat();
                cv.resize(src, dSrc, new cv.Size(), downsampleFactor, downsampleFactor, cv.INTER_LINEAR);
                src.delete();
                src = dSrc;
            }

            // 转灰度 (加速匹配)
            const useGrayscale = config.grayscale !== false;
            let srcGray: any = null;
            if (useGrayscale) {
                srcGray = toGrayscale(src);
            }

            const matchSrc = useGrayscale ? srcGray : src;
            const threshold = config.threshold || 0.8;

            // 顺序匹配所有模板
            for (let i = 0; i < templates.length; i++) {
                const template = templates[i];
                const templateStartTime = performance.now();

                // 获取或创建灰度模板
                const templateKey = `gray_${template.width}x${template.height}_${downsampleFactor}`;
                let templ: any;
                let cacheHit = false;

                if (grayTemplateCache.has(template.name || templateKey)) {
                    templ = grayTemplateCache.get(template.name || templateKey)!.mat;
                    cacheHit = true;
                } else {
                    templ = cv.matFromImageData(template.data);

                    // 降采样模板
                    if (downsampleFactor !== 1.0) {
                        let dTempl = new cv.Mat();
                        cv.resize(templ, dTempl, new cv.Size(), downsampleFactor, downsampleFactor, cv.INTER_LINEAR);
                        templ.delete();
                        templ = dTempl;
                    }

                    // 转灰度
                    if (useGrayscale) {
                        const grayTempl = toGrayscale(templ);
                        templ.delete();
                        templ = grayTempl;
                    }

                    // 缓存
                    grayTemplateCache.set(template.name || templateKey, {
                        mat: templ.clone(),
                        timestamp: Date.now()
                    });
                }

                // 匹配
                const matchResult = optimizedMatchTemplate(matchSrc, templ, config);
                const templateDuration = performance.now() - templateStartTime;

                const factor = 1.0 / downsampleFactor;
                results.push({
                    name: template.name || `template_${i}`,
                    score: matchResult.score,
                    x: matchResult.x * factor,
                    y: matchResult.y * factor,
                    matched: matchResult.score >= threshold,
                    duration: Math.round(templateDuration * 100) / 100,
                    cacheHit
                });

                if (!cacheHit) {
                    templ.delete();
                }

                // 早期退出：如果配置了 earlyExit 且找到匹配
                if (config.earlyExit && matchResult.score >= threshold) {
                    break;
                }
            }

            // 清理
            if (srcGray) srcGray.delete();
            src.delete();

            const totalDuration = performance.now() - startTime;
            matchCount += templates.length;
            totalTime += totalDuration;

            self.postMessage({
                id,
                type: 'BATCH_MATCH_RESULT',
                result: {
                    results,
                    totalDuration: Math.round(totalDuration * 100) / 100,
                    templateCount: templates.length,
                    matchedCount: results.filter(r => r.matched).length
                }
            });
        }
        else if (type === 'CLEAR_CACHE') {
            // 清理缓存
            for (const [key, value] of templateCache.entries()) {
                value.mat.delete();
            }
            templateCache.clear();
            // 清理灰度缓存
            for (const [key, value] of grayTemplateCache.entries()) {
                value.mat.delete();
            }
            grayTemplateCache.clear();
            self.postMessage({ type: 'CACHE_CLEARED' });
        }
        else if (type === 'GET_STATS') {
            // 获取统计信息
            self.postMessage({
                type: 'STATS',
                stats: {
                    cacheSize: templateCache.size,
                    grayCacheSize: grayTemplateCache.size,
                    matchCount,
                    averageTime: matchCount > 0 ? Math.round((totalTime / matchCount) * 100) / 100 : 0,
                    totalTime: Math.round(totalTime * 100) / 100
                }
            });
        }
    } catch (err: any) {
        self.postMessage({ id, type: 'ERROR', error: err.message });
    }
};
