// src/core/algo.ts
import { VisionSystem } from './vision';
import { logger } from './logging/logger';

interface Asset {
    name: string;
    template: ImageData; // 用于 Worker 匹配
    // width/height 可以从 template 获取
}

export class AlgoSystem {
    private _vision: VisionSystem;
    private assets: Map<string, Asset> = new Map();

    // 公开只读访问器
    get vision(): VisionSystem { return this._vision; }

    constructor(vision: VisionSystem) {
        this._vision = vision;
    }

    /**
     * 注册图片素材 (Base64 -> ImageData)
     * @param name 素材名称
     * @param base64 Base64 编码的图片数据
     */
    async register(name: string, base64: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error(`Canvas context error while registering asset: ${name}`));
                    return;
                }

                ctx.drawImage(img, 0, 0);
                const template = ctx.getImageData(0, 0, img.width, img.height);

                this.assets.set(name, { name, template });
                resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load image asset: ${name}`));
            img.src = base64;
        });
    }

    /**
     * 获取已注册的素材
     * @param name 素材名称
     */
    getAsset(name: string): Asset | undefined {
        return this.assets.get(name);
    }

    /**
     * 异步查找目标
     * @param screen 当前屏幕截图
     * @param name 素材名称
     * @param options 匹配参数 (支持 roi)
     */
    async findAsync(
        screen: ImageData,
        name: string,
        options: {
            threshold?: number;
            downsample?: number;
            roi?: { x: number; y: number; w: number; h: number };
        } = {}
    ) {
        const asset = this.assets.get(name);
        if (!asset) {
            logger.warn('algo', `Asset not found: ${name}`);
            return null;
        }

        // 构建匹配选项
        const matchOptions: any = { ...options };

        // 如果有 ROI，转换为 vision.match 需要的格式
        if (options.roi && options.roi.w > 0 && options.roi.h > 0) {
            matchOptions.roiEnabled = true;
            matchOptions.roiRegions = [options.roi];
        }

        // 调用 VisionSystem (最终传给 Worker) 进行匹配
        const result = await this._vision.match(screen, asset.template, matchOptions);

        // 阈值判断
        const threshold = options.threshold || 0.8;
        if (result && result.score >= threshold) {
            return {
                ...result,
                w: asset.template.width,
                h: asset.template.height
            };
        }

        return null;
    }

    /**
     * 批量异步查找多个目标 - 共用一个源图像，大幅提升性能
     * @param screen 当前屏幕截图
     * @param names 素材名称数组
     * @param options 匹配参数
     * @returns 匹配结果数组
     */
    async findBatchAsync(
        screen: ImageData,
        names: string[],
        options: {
            threshold?: number;
            downsample?: number;
            earlyExit?: boolean;
            useROI?: boolean;
            roiRegions?: Array<{ x: number, y: number, w: number, h: number, name?: string }>;
        } = {}
    ): Promise<Array<{
        name: string;
        score: number;
        x: number;
        y: number;
        w: number;
        h: number;
        matched: boolean;
    } | null>> {
        // 收集有效的模板
        const templates: Array<{ name: string; data: ImageData }> = [];
        const assetMap = new Map<string, { width: number; height: number }>();

        for (const name of names) {
            const asset = this.assets.get(name);
            if (asset) {
                templates.push({ name, data: asset.template });
                assetMap.set(name, { width: asset.template.width, height: asset.template.height });
            } else {
                logger.warn('algo', `Asset not found: ${name}`);
            }
        }

        if (templates.length === 0) {
            return names.map(() => null);
        }

        // 调用批量匹配
        const result = await this._vision.batchMatch(screen, templates, {
            threshold: options.threshold || 0.8,
            downsample: options.downsample || 0.33,
            earlyExit: options.earlyExit || false,
            useROI: options.useROI,
            roiRegions: options.roiRegions
        });

        // 转换结果格式
        const resultMap = new Map(result.results.map(r => [r.name, r]));

        return names.map(name => {
            const matchResult = resultMap.get(name);
            if (!matchResult || !matchResult.matched) {
                return null;
            }
            const asset = assetMap.get(name);
            return {
                name,
                score: matchResult.score,
                x: matchResult.x,
                y: matchResult.y,
                w: asset?.width || 0,
                h: asset?.height || 0,
                matched: true
            };
        });
    }

    /**
     * 批量异步查找 - 支持模板级 ROI (每个模板指定自己的搜索区域)
     * @param screen 当前屏幕截图
     * @param targets 目标数组 [{name, roi?: {x,y,w,h}}]
     * @param options 匹配参数
     * @returns 匹配结果数组
     */
    async findBatchWithROIAsync(
        screen: ImageData,
        targets: Array<{
            name: string;
            roi?: { x: number, y: number, w: number, h: number };
        }>,
        options: { threshold?: number; downsample?: number; earlyExit?: boolean } = {}
    ): Promise<Array<{
        name: string;
        score: number;
        x: number;
        y: number;
        w: number;
        h: number;
        matched: boolean;
        usedROI: boolean;
    } | null>> {
        // 收集有效的模板
        const templates: Array<{
            name: string;
            data: ImageData;
            roi?: { x: number, y: number, w: number, h: number };
        }> = [];
        const assetMap = new Map<string, { width: number; height: number }>();

        for (const target of targets) {
            const asset = this.assets.get(target.name);
            if (asset) {
                templates.push({
                    name: target.name,
                    data: asset.template,
                    roi: target.roi  // 模板级 ROI
                });
                assetMap.set(target.name, { width: asset.template.width, height: asset.template.height });
            } else {
                logger.warn('algo', `Asset not found: ${target.name}`);
            }
        }

        if (templates.length === 0) {
            return targets.map(() => null);
        }

        // 调用批量匹配
        const result = await this._vision.batchMatch(screen, templates, {
            threshold: options.threshold || 0.8,
            downsample: options.downsample || 0.33,
            earlyExit: options.earlyExit || false
        });

        // 转换结果格式
        const resultMap = new Map(result.results.map(r => [r.name, r]));

        return targets.map(target => {
            const matchResult = resultMap.get(target.name);
            if (!matchResult || !matchResult.matched) {
                return null;
            }
            const asset = assetMap.get(target.name);
            return {
                name: target.name,
                score: matchResult.score,
                x: matchResult.x,
                y: matchResult.y,
                w: asset?.width || 0,
                h: asset?.height || 0,
                matched: true,
                usedROI: matchResult.usedROI || false
            };
        });
    }
}
