// src/core/base-task.ts
import { InputSystem } from './input';
import { VisionSystem } from './vision';
import { AlgoSystem } from './algo';
import { Engine } from './engine';

export interface TaskContext {
    input: InputSystem;
    vision: VisionSystem;
    algo: AlgoSystem;
    engine: Engine;
}

export abstract class BaseTask {
    name: string;
    running: boolean = false;
    interval: number = 1000; // 默认循环间隔 (ms)
    ctx!: TaskContext;       // 由 Engine 注入

    constructor(name: string) {
        this.name = name;
    }

    /**
     * 任务启动逻辑（通常不需要重写，除非你有特殊需求）
     */
    start() {
        if (this.running) return;
        this.running = true;
        console.log(`[Task] ${this.name} Started`);

        const loop = async () => {
            if (!this.running) return;
            const t0 = performance.now();

            try {
                // 获取当前帧数据 (ImageData)
                // 注意：VisionSystem 需确保 getImageData 高效且不返回 null
                const imgData = this.ctx.vision.getImageData();
                
                if (imgData) {
                    // 执行一帧的业务逻辑
                    await this.onLoop(imgData);
                }
            } catch (e) {
                console.error(`[Task] ${this.name} Error:`, e);
            }

            const dt = performance.now() - t0;
            // 动态调整下一次执行时间，保持稳定的频率
            if (this.running) {
                setTimeout(loop, Math.max(10, this.interval - dt));
            }
        };
        
        loop(); // 启动循环
    }

    stop() {
        this.running = false;
        console.log(`[Task] ${this.name} Stopped`);
    }

    /**
     * 核心业务逻辑，子类必须实现
     * @param frame 当前屏幕截图数据
     */
    abstract onLoop(frame: ImageData): Promise<void>;

    /**
     * 辅助函数：休眠
     */
    async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
	async onRegister(): Promise<void> {
        // 默认不做任何事，子类可覆盖
    }
}
