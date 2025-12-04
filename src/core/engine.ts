// src/core/engine.ts
import { InputSystem } from './input';
import { VisionSystem } from './vision';
import { AlgoSystem } from './algo';
import { BaseTask } from './base-task';
import { bus, EVENTS } from '../utils/event-bus';
import { config as configManager } from './config-manager';
import { logger } from './logging/logger';
import { performanceMonitor } from './performance/monitor';
import { storageManager } from './storage/manager';

export class Engine {
    // 三大核心系统
    input: InputSystem;
    vision: VisionSystem;
    algo: AlgoSystem;

    // 任务管理
    private tasks: Map<string, BaseTask> = new Map();
    private activeTask: BaseTask | null = null;

    // 使用配置管理器，保持向后兼容
    config = {
        threshold: configManager.get('threshold'),
        downsample: configManager.get('downsample'),
        scales: configManager.get('scales'),
        debug: configManager.get('debugMode'),
        // 新增性能配置
        adaptiveScaling: configManager.get('adaptiveScaling'),
        roiEnabled: configManager.get('roiEnabled'),
        roiRegions: configManager.get('roiRegions'),
        performanceMonitoring: configManager.get('performanceMonitoring'),
        frameCacheEnabled: configManager.get('frameCacheEnabled'),
        parallelMatching: configManager.get('parallelMatching'),
        maxWorkers: configManager.get('maxWorkers'),
        matchingMethod: configManager.get('matchingMethod'),
        earlyTermination: configManager.get('earlyTermination'),
        templateCacheSize: configManager.get('templateCacheSize')
    };

    constructor() {
        this.input = new InputSystem();
        this.vision = new VisionSystem();
        this.algo = new AlgoSystem(this.vision); // Algo 依赖 Vision
        // [关键修复] 必须在构造函数里立即监听事件，不要等待 InputSystem
        this.bindEvents();
        this.init();
    }

	private bindEvents() {
        // UI 控制事件
        bus.on(EVENTS.TASK_START, (name: string) => this.startTask(name));
        bus.on(EVENTS.TASK_STOP, () => this.stopTask());
        bus.on(EVENTS.CONFIG_UPDATE, (cfg: any) => this.updateConfig(cfg));

        // [关键] 截图请求现在无论 Input 是否就绪，都能被处理
        bus.on(EVENTS.CROP_REQUEST, (rect: any) => this.handleCrop(rect));
    }
    private async init() {
        const endMeasurement = performanceMonitor.startMeasurement('engine_init', 'system');

        try {
            // 初始化存储管理器
            await storageManager.initialize();
            logger.info('engine', 'Storage manager initialized');

            await this.input.init();
            logger.info('engine', 'Input system initialized');

            // 监听 UI 事件
            bus.on(EVENTS.TASK_START, (name: string) => this.startTask(name));
            bus.on(EVENTS.TASK_STOP, () => this.stopTask());
            bus.on(EVENTS.CONFIG_UPDATE, (cfg: any) => this.updateConfig(cfg));
            // [新增] 监听截图请求
            bus.on(EVENTS.CROP_REQUEST, (rect: any) => this.handleCrop(rect));

            bus.emit(EVENTS.ENGINE_READY);
            logger.info('engine', 'Engine Core v2.0 Ready');

        } catch (error) {
            logger.error('engine', 'Failed to initialize engine', { error });
            throw error;
        } finally {
            endMeasurement();
        }
    }

	/**
     * 注册任务
     */
    async registerTask(task: BaseTask) {
        const endMeasurement = performanceMonitor.startMeasurement(`register_task_${task.name}`, 'system');

        try {
            // 注入上下文
            task.ctx = {
                input: this.input,
                vision: this.vision,
                algo: this.algo,
                engine: this
            };
            this.tasks.set(task.name, task);

            logger.info('engine', `Registering task: ${task.name}`);

            // [新增] 自动调用初始化钩子
            try {
                await task.onRegister();
                logger.info('engine', `Task ${task.name} registered successfully`);
            } catch (e) {
                logger.error('engine', `Failed to register task ${task.name}`, { error: e });
            }

            // 通知 UI 更新
            bus.emit(EVENTS.TASK_LIST_UPDATE, Array.from(this.tasks.keys()));

        } catch (error) {
            logger.error('engine', `Failed to register task ${task.name}`, { error });
            throw error;
        } finally {
            endMeasurement();
        }
    }

    /**
     * 启动指定任务
     */
    async startTask(name: string) {
        const endMeasurement = performanceMonitor.startMeasurement(`start_task_${name}`, 'system');

        try {
            const task = this.tasks.get(name);
            if (!task) {
                logger.error('engine', `Task not found: ${name}`);
                return;
            }

            logger.info('engine', `Starting task: ${name}`);

            if (this.activeTask) {
                logger.info('engine', `Stopping previous task: ${this.activeTask.name}`);
                this.activeTask.stop();
            }

            this.activeTask = task;
            // 可以在这里预加载任务所需的素材
            // await task.preload();

            task.start();
            bus.emit(EVENTS.STATUS_UPDATE, `运行中: ${task.name}`);

            logger.info('engine', `Task ${name} started successfully`);

        } catch (error) {
            logger.error('engine', `Failed to start task ${name}`, { error });
            throw error;
        } finally {
            endMeasurement();
        }
    }

    /**
     * 停止当前任务
     */
    stopTask() {
        if (this.activeTask) {
            const taskName = this.activeTask.name;
            logger.info('engine', `Stopping task: ${taskName}`);

            this.activeTask.stop();
            this.activeTask = null;

            logger.info('engine', `Task ${taskName} stopped successfully`);
        }
        // [新增] 停止任务时，立即清理屏幕上的绿框
        bus.emit(EVENTS.DEBUG_CLEAR);
        bus.emit(EVENTS.STATUS_UPDATE, '已停止');
    }

    updateConfig(cfg: any) {
        const endMeasurement = performanceMonitor.startMeasurement('config_update', 'system');

        try {
            logger.info('engine', 'Updating configuration', { config: cfg });

            // 更新配置管理器
            Object.keys(cfg).forEach(key => {
                if (cfg[key] !== undefined) {
                    configManager.set(key as any, cfg[key]);
                }
            });

            // 同步到本地config
            this.config = {
                threshold: configManager.get('threshold'),
                downsample: configManager.get('downsample'),
                scales: configManager.get('scales'),
                debug: configManager.get('debugMode'),
                adaptiveScaling: configManager.get('adaptiveScaling'),
                roiEnabled: configManager.get('roiEnabled'),
                roiRegions: configManager.get('roiRegions'),
                performanceMonitoring: configManager.get('performanceMonitoring'),
                frameCacheEnabled: configManager.get('frameCacheEnabled'),
                parallelMatching: configManager.get('parallelMatching'),
                maxWorkers: configManager.get('maxWorkers'),
                matchingMethod: configManager.get('matchingMethod'),
                earlyTermination: configManager.get('earlyTermination'),
                templateCacheSize: configManager.get('templateCacheSize')
            };

            logger.info('engine', 'Configuration updated successfully', { config: this.config });

            // 更新性能监控配置
            if (this.config.performanceMonitoring) {
                performanceMonitor.updateConfig({
                    enabled: true,
                    realTimeMonitoring: true,
                    detailedLogging: this.config.debug
                });
            } else {
                performanceMonitor.updateConfig({
                    enabled: false
                });
            }

            // [新增] 如果用户关闭了 debug，立即清除屏幕上的残留
            if (cfg.debugMode === false || cfg.debug === false) {
                bus.emit(EVENTS.DEBUG_CLEAR);
                logger.debug('engine', 'Debug cleared via config update');
            }

        } catch (error) {
            logger.error('engine', 'Failed to update configuration', { error });
            throw error;
        } finally {
            endMeasurement();
        }
    }

	async handleCrop(rect: { x: number, y: number, w: number, h: number }) {
        logger.info('engine', 'Processing crop request', { rect });

        // 1. 尝试截图
        const templateData = await this.vision.captureTemplate(rect);

        // 2. 检查结果
        if (templateData) {
            // --- 成功分支 ---
            // 额外检查：如果截图全是透明或纯黑，可能是截到了无效区域
            // 这里简单检查一下 data 长度确保不是空的
            if (templateData.data.length > 0) {
                logger.info('engine', 'Crop successful, starting preview');
                bus.emit(EVENTS.STATUS_UPDATE, '截图成功! 已复制到剪贴板');
                this.startPreviewTask(templateData);
                return;
            }
        }

        // --- 失败分支 ---
        logger.warn('engine', 'Crop failed: No valid video stream found');
        bus.emit(EVENTS.STATUS_UPDATE, '截图失败 (无视频流)');

        // [关键修复] 移除 setTimeout，直接同步调用 alert
        // 浏览器的 "User Activation" 机制要求 alert 必须在用户操作的回调栈中直接调用
        alert('❌ 截图失败\n\n未检测到有效的游戏画面。\n请等待游戏完全加载并显示画面后再试。');
    }


	startPreviewTask(template: ImageData) {
        this.stopTask();

        const previewTask = {
            name: 'Preview',
            running: true,
            ctx: { vision: this.vision, algo: this.algo } as any,
            start: () => {
                logger.info('engine', 'Starting preview mode');

                const loop = async () => {
                    if (!previewTask.running) return;

                    const screen = this.vision.getImageData();
                    if (screen) {
                        const t0 = performance.now();

						// [关键修改] 使用 this.config 中的动态参数
                        const rawRes = await this.vision.match(screen, template, {
                            threshold: this.config.threshold,   // 动态阈值
                            downsample: this.config.downsample, // 动态降采样
                            scales: this.config.scales          // 动态多尺度
                        });

                        // [关键修复] Worker 不返回宽高，我们需要手动补全
                        // 从传入的 template (ImageData) 中获取宽高
                        const res = rawRes ? {
                            ...rawRes,
                            w: template.width,
                            h: template.height
                        } : null;

                        const cost = performance.now() - t0;

                        if (res && res.score >= (this.config.threshold)) {
                            const info = this.vision.getDisplayInfo();

                            if (info && this.config.debug) {
                                // 坐标映射
                                const screenX = info.offsetX + (res.x * info.scaleX);
                                const screenY = info.offsetY + (res.y * info.scaleY);
                                const screenW = res.w * info.scaleX;
                                const screenH = res.h * info.scaleY;

                                // 这里的 scaleX/Y 已经是最终缩放了 (Worker 内部处理了 downsample 和 scales 的反算)
                                // 但有一个细节：多尺度匹配(scales)返回的 res.w/h 是原始模板大小
                                // 如果匹配到了 1.2倍 的物体，视觉上框应该变大。
                                // 为了简单，目前画的框是固定大小的。
                                // 如果想要框跟随缩放变化，可以使用 res.bestScale (如果 Worker 返回了的话)
                                // Worker v31 代码里确实返回了 bestScale，所以我们可以利用它：
                                const matchScale = (res as any).bestScale || 1.0;
                                const finalW = screenW * matchScale;
                                const finalH = screenH * matchScale;
                                bus.emit(EVENTS.DEBUG_DRAW, {
                                    x: screenX + finalW/2,
                                    y: screenY + finalH/2,
                                    w: finalW,
                                    h: finalH,
                                    score: res.score,
                                    cost: cost,
                                    label: 'Preview'
                                });
                            }
                        }
                    }
                    if (previewTask.running) setTimeout(loop, 100);
                };
                loop();
            },
            stop: () => { previewTask.running = false; }
        };

        this.activeTask = previewTask as any;
        previewTask.start();
    }
}
