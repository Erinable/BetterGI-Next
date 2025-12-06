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
     * 异步查找目标
     * @param screen 当前屏幕截图
     * @param name 素材名称
     * @param options 匹配参数
     */
    async findAsync(screen: ImageData, name: string, options: { threshold?: number, downsample?: number } = {}) {
        const asset = this.assets.get(name);
        if (!asset) {
            logger.warn('algo', `Asset not found: ${name}`);
            return null;
        }

        // 调用 VisionSystem (最终传给 Worker) 进行匹配
        const result = await this._vision.match(screen, asset.template, options);

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
}
