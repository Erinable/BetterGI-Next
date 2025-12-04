// src/core/algo.ts
import { VisionSystem } from './vision';

interface Asset {
    name: string;
    template: ImageData; // 用于 Worker 匹配
    // width/height 可以从 template 获取
}

export class AlgoSystem {
    private vision: VisionSystem;
    private assets: Map<string, Asset> = new Map();

    constructor(vision: VisionSystem) {
        this.vision = vision;
    }

    /**
     * 注册图片素材 (Base64 -> ImageData)
     */
    async register(name: string, base64: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Canvas context error');
                
                ctx.drawImage(img, 0, 0);
                const template = ctx.getImageData(0, 0, img.width, img.height);
                
                this.assets.set(name, { name, template });
                resolve();
            };
            img.onerror = reject;
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
            console.warn(`[Algo] Asset not found: ${name}`);
            return null;
        }

        // 调用 VisionSystem (最终传给 Worker) 进行匹配
        const result = await this.vision.match(screen, asset.template, options);
        
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
