// src/core/base-task.ts
import { InputSystem } from './input';
import { VisionSystem } from './vision';
import { AlgoSystem } from './algo';
import { Engine } from './engine';
import { logger } from './logging/logger';

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

    // 新增: 生命周期管理
    private loopTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private loopInstanceId: number = 0; // 防止多个 loop 并行运行
    private isRegistered: boolean = false; // 防止重复注册资源

    constructor(name: string) {
        this.name = name;
    }

    /**
     * 安全注册 - 只会执行一次
     */
    async safeRegister(): Promise<void> {
        if (this.isRegistered) {
            logger.debug('task', `${this.name} already registered, skipping`);
            return;
        }
        await this.onRegister();
        this.isRegistered = true;
    }

    /**
     * 任务启动逻辑
     */
    start() {
        if (this.running) {
            logger.warn('task', `${this.name} is already running, ignoring start`);
            return;
        }

        this.running = true;
        this.loopInstanceId++; // 递增实例 ID，使旧的 loop 失效
        const currentInstanceId = this.loopInstanceId;

        logger.info('task', `${this.name} started (instance: ${currentInstanceId})`);

        const loop = async () => {
            // 检查是否仍然是当前实例 (防止多个 loop 并行)
            if (!this.running || this.loopInstanceId !== currentInstanceId) {
                logger.debug('task', `${this.name} loop terminated (instance mismatch or stopped)`);
                return;
            }

            const t0 = performance.now();

            try {
                const imgData = this.ctx.vision.getImageData();

                if (imgData) {
                    await this.onLoop(imgData);
                }
            } catch (e) {
                logger.error('task', `${this.name} error`, { error: e });
            }

            const dt = performance.now() - t0;

            // 再次检查是否应该继续
            if (this.running && this.loopInstanceId === currentInstanceId) {
                this.loopTimeoutId = setTimeout(loop, Math.max(10, this.interval - dt));
            }
        };

        loop(); // 启动循环
    }

    /**
     * 停止任务 - 清理所有资源
     */
    stop() {
        const wasRunning = this.running;
        this.running = false;

        // 清除待执行的定时器
        if (this.loopTimeoutId) {
            clearTimeout(this.loopTimeoutId);
            this.loopTimeoutId = null;
        }

        // 递增实例 ID 使任何进行中的 loop 失效
        this.loopInstanceId++;

        if (wasRunning) {
            logger.info('task', `${this.name} stopped`);
        }
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

    /**
     * 注册任务资源，子类可覆盖
     * 注意: 只会被调用一次
     */
    async onRegister(): Promise<void> {
        // 默认不做任何事
    }

    /**
     * 销毁任务，释放所有资源
     */
    destroy() {
        this.stop();
        this.isRegistered = false;
        logger.info('task', `${this.name} destroyed`);
    }
}

