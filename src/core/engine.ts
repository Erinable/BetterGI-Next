// src/core/engine.ts
import { InputSystem } from './input';
import { VisionSystem } from './vision';
import { AlgoSystem } from './algo';
import { BaseTask } from './base-task';
import { bus, EVENTS } from '../utils/event-bus';
import { config as configManager } from './config-manager';

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
        await this.input.init();

        // 监听 UI 事件
        bus.on(EVENTS.TASK_START, (name: string) => this.startTask(name));
        bus.on(EVENTS.TASK_STOP, () => this.stopTask());
        bus.on(EVENTS.CONFIG_UPDATE, (cfg: any) => this.updateConfig(cfg));
		// [新增] 监听截图请求
        bus.on(EVENTS.CROP_REQUEST, (rect: any) => this.handleCrop(rect));

        bus.emit(EVENTS.ENGINE_READY);
        console.log('[BetterGi] Engine Core v2.0 Ready');
    }

	/**
     * 注册任务
     */
    async registerTask(task: BaseTask) {
        // 注入上下文
        task.ctx = {
            input: this.input,
            vision: this.vision,
            algo: this.algo,
            engine: this
        };
        this.tasks.set(task.name, task);

        // [新增] 自动调用初始化钩子
        try {
            await task.onRegister();
        } catch (e) {
            console.error(`[Engine] Failed to register task ${task.name}:`, e);
        }

        // 通知 UI 更新
        bus.emit(EVENTS.TASK_LIST_UPDATE, Array.from(this.tasks.keys()));
    }

    /**
     * 启动指定任务
     */
    async startTask(name: string) {
        const task = this.tasks.get(name);
        if (!task) {
            console.error(`[Engine] Task not found: ${name}`);
            return;
        }

        if (this.activeTask) {
            this.activeTask.stop();
        }

        this.activeTask = task;
        // 可以在这里预加载任务所需的素材
        // await task.preload();

        task.start();
        bus.emit(EVENTS.STATUS_UPDATE, `运行中: ${task.name}`);
    }

    /**
     * 停止当前任务
     */
    stopTask() {
        if (this.activeTask) {
            this.activeTask.stop();
            this.activeTask = null;
        }
        // [新增] 停止任务时，立即清理屏幕上的绿框
        bus.emit(EVENTS.DEBUG_CLEAR);
        bus.emit(EVENTS.STATUS_UPDATE, '已停止');
    }

    updateConfig(cfg: any) {
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

		console.log('[Engine] Config updated:', this.config);
        // [新增] 如果用户关闭了 debug，立即清除屏幕上的残留
        if (cfg.debugMode === false || cfg.debug === false) {
            bus.emit(EVENTS.DEBUG_CLEAR);
        }
    }

	handleCrop(rect: { x: number, y: number, w: number, h: number }) {
        console.log('[Engine] Processing crop request...', rect);

        // 1. 尝试截图
        const templateData = this.vision.captureTemplate(rect);

        // 2. 检查结果
        if (templateData) {
            // --- 成功分支 ---
            // 额外检查：如果截图全是透明或纯黑，可能是截到了无效区域
            // 这里简单检查一下 data 长度确保不是空的
            if (templateData.data.length > 0) {
                console.log('[Engine] Crop success, starting preview.');
                bus.emit(EVENTS.STATUS_UPDATE, '截图成功! 已复制到剪贴板');
                this.startPreviewTask(templateData);
                return;
            }
        }

        // --- 失败分支 ---
        console.warn('[Engine] Crop failed: No valid video stream found.');
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
                console.log('[Engine] Starting Preview Mode...');

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

                                // 调试日志
                                console.log(`[Preview Debug] 🎯 Score: ${(res.score*100).toFixed(1)}% | ⚡ ${cost.toFixed(0)}ms
  -------------------------------------------------------------
  1. 🖼️ Raw (Vision):  x=${res.x} y=${res.y} w=${res.w} h=${res.h}
  2. 📏 Map (Info):    scale=${info.scaleX.toFixed(3)} offset=(${info.offsetX}, ${info.offsetY})
  3. 📺 UI (Screen):   x=${screenX.toFixed(0)} y=${screenY.toFixed(0)} w=${screenW.toFixed(0)} h=${screenH.toFixed(0)}
  -------------------------------------------------------------`);

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
