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

        // [新增] 资产 Base64 捕获 (复用 captureTemplate)
        bus.on('asset:capture-base64', (data: { taskName: string; assetName: string; rect: any }) => {
            this.handleAssetCapture(data.taskName, data.assetName, data.rect);
        });

        // [新增] 资产调试匹配 (单次匹配测试)
        bus.on('asset:debug-match', (data: { taskName: string; assetName: string; base64: string; roi?: any; threshold?: number }) => {
            this.handleAssetDebugMatch(data);
        });

        // [新增] 响应 UI 的状态查询
        bus.on(EVENTS.ENGINE_QUERY_STATE, () => {
            const runningTasks = this.getRunningTasks();
            bus.emit(EVENTS.ENGINE_STATE_CHANGE, {
                running: runningTasks.length > 0,
                taskName: runningTasks.map(t => t.name).join(', ')
            });
            // 同时返回任务列表
            bus.emit(EVENTS.TASK_LIST_UPDATE, this.listTasks());
        });
    }
    private async init() {
        const endMeasurement = performanceMonitor.startMeasurement('engine_init', 'system');

        try {
            logger.info('engine', '🚀 BetterGi Engine v2.0 初始化开始', {
                pageUrl: window.location.href,
                userAgent: navigator.userAgent.substring(0, 100),
                hasBXExposed: !!window.BX_EXPOSED
            });

            // 初始化存储管理器
            logger.info('engine', '📁 初始化存储管理器...');
            await storageManager.initialize();
            logger.info('engine', '✅ 存储管理器初始化完成');

            // 初始化输入系统（包含详细状态检查）
            logger.info('engine', '🎮 初始化输入系统...');
            logger.info('engine', '等待 Better-xCloud inputChannel 连接...');

            try {
                await this.input.init();
                logger.info('engine', '✅ 输入系统初始化完成');

                // 输入系统初始化成功后的详细信息
                const inputDetails = {
                    channelConnected: !!this.input.channel,
                    channelType: this.input.channel?.constructor?.name || 'Unknown',
                    supportedKeys: Object.keys(this.input.state)
                };
                logger.info('engine', '📊 输入系统详细信息', inputDetails);

            } catch (inputError: unknown) {
                const errorMessage = inputError instanceof Error ? inputError.message : String(inputError);
                logger.error('engine', '❌ 输入系统初始化失败', { error: errorMessage });
                logger.warn('engine', '⚠️ 继续初始化其他系统，但输入功能将不可用');
                // 不抛出错误，允许其他系统继续初始化
            }

            // 检查视觉系统状态
            logger.info('engine', '👁️ 检查视觉系统状态...');
            const visionStatus = {
                worker: !!this.vision.worker,
                workerReady: false,
                canvas: !!this.vision.canvas,
                context: !!this.vision.ctx,
                videoConnected: !!this.vision.video
            };

            // 检查 Worker 是否就绪
            if (visionStatus.worker) {
                // 发送测试消息检查 Worker 状态
                this.vision.worker.postMessage({ type: 'INIT' });
                visionStatus.workerReady = true;
            }

            logger.info('engine', '📊 视觉系统状态', visionStatus);

            // 检查算法系统状态
            logger.info('engine', '🧠 检查算法系统状态...');
            const algoStatus = {
                visionConnected: !!this.algo.vision,
                registeredTemplates: 0, // 将在模板注册后更新
                ready: !!this.algo.vision && !!this.vision.worker
            };
            logger.info('engine', '📊 算法系统状态', algoStatus);

            // 事件监听器已在 constructor 的 bindEvents() 中设置
            logger.info('engine', '✅ 事件监听器已就绪 (通过 bindEvents)');

            // 模块就绪状态总结
            const moduleStatus = {
                storage: true,
                input: !!this.input.channel,
                vision: visionStatus.workerReady,
                algorithm: algoStatus.ready,
                events: true
            };

            const readyCount = Object.values(moduleStatus).filter(Boolean).length;
            const totalCount = Object.keys(moduleStatus).length;

            if (readyCount === totalCount) {
                logger.info('engine', '🎉 所有模块初始化成功！');
            } else {
                logger.warn('engine', `⚠️ 部分模块初始化失败 (${readyCount}/${totalCount})，功能可能受限`);
            }

            logger.info('engine', '📈 模块就绪状态', moduleStatus);

            // 发送引擎就绪事件
            bus.emit(EVENTS.ENGINE_READY);
            logger.info('engine', 'Engine Core v2.0 Ready');

            // 暴露调试信息到全局
            (window as any).BetterGiEngineDebug = {
                status: moduleStatus,
                input: {
                    connected: !!this.input.channel,
                    state: { ...this.input.state },
                    channel: !!this.input.channel
                },
                vision: visionStatus,
                algorithm: algoStatus
            };

            logger.info('engine', '🔧 调试信息已暴露到 window.BetterGiEngineDebug');

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
            // this.tasks.set(task.name, task); // Removed in favor of TaskRegistry

            logger.info('engine', `Registering task: ${task.name}`);

            // [新增] 自动调用初始化钩子 (只会执行一次)
            try {
                await task.safeRegister();
                logger.info('engine', `Task ${task.name} registered successfully`);
            } catch (e) {
                logger.error('engine', `Failed to register task ${task.name}`, { error: e });
            }
            this.tasks.set(task.name, task);

            // 通知 UI 更新
            bus.emit(EVENTS.TASK_LIST_UPDATE, this.listTasks());

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

            // Remove single active task constraint to allow concurrency
            // if (this.activeTask) {
            //     logger.info('engine', `Stopping previous task: ${this.activeTask.name}`);
            //     this.activeTask.stop();
            // }
            // this.activeTask = task;
            // 可以在这里预加载任务所需的素材
            // await task.preload();

            task.start();
            bus.emit(EVENTS.STATUS_UPDATE, `运行中: ${task.name}`);
            bus.emit(EVENTS.ENGINE_STATE_CHANGE, { running: true, taskName: task.name });

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
    /**
     * 停止当前任务
     */
    stopTask(name?: string) {
        if (name) {
            const task = this.tasks.get(name);
            if (task) {
                logger.info('engine', `Stopping task: ${name}`);
                task.stop();
                logger.info('engine', `Task ${name} stopped successfully`);
            }
        } else {
            // Stop all tasks
            const runningTasks = this.getRunningTasks();
            if (runningTasks.length > 0) {
                logger.info('engine', `Stopping all tasks: ${runningTasks.map(t => t.name).join(', ')}`);
                runningTasks.forEach(t => t.stop());
            }
        }

        // [新增] 停止任务时，立即清理屏幕上的绿框
        bus.emit(EVENTS.DEBUG_CLEAR);
        bus.emit(EVENTS.STATUS_UPDATE, '已停止');
        bus.emit(EVENTS.ENGINE_STATE_CHANGE, { running: false });
    }

    /**
     * 检查是否有独占任务正在运行
     */
    hasExclusiveTask(): boolean {
        return Array.from(this.tasks.values()).some(t => t.running && t.isExclusive);
    }

    /**
     * 获取所有任务名称列表
     */
    listTasks(): string[] {
        return Array.from(this.tasks.keys());
    }

    /**
     * 获取正在运行的任务列表
     */
    getRunningTasks(): BaseTask[] {
        return Array.from(this.tasks.values()).filter(t => t.running);
    }

    /**
     * 获取所有任务 (按优先级排序)
     */
    getAllTasksSortedByPriority(): BaseTask[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.priority - a.priority);
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
                logger.info('engine', 'Crop successful, starting ScreenshotMatchTask');
                bus.emit(EVENTS.STATUS_UPDATE, '截图成功! 开始匹配任务');

                // 动态导入并启动 ScreenshotMatchTask
                const { ScreenshotMatchTask } = await import('../modules/tasks/screenshot-match-task');
                const task = new ScreenshotMatchTask(templateData);
                task.ctx = {
                    input: this.input,
                    vision: this.vision,
                    algo: this.algo,
                    engine: this
                };

                this.tasks.set(task.name, task);

                // 停止之前的任务 (可选: 如果需要独占)
                // this.stopTask();

                // 启动新任务
                task.start();

                // 通知 UI 任务已启动
                bus.emit(EVENTS.STATUS_UPDATE, '截图匹配任务运行中...');
                bus.emit(EVENTS.ENGINE_STATE_CHANGE, { running: true, taskName: '截图匹配' });
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

    /**
     * 资产 Base64 捕获 (复用 captureTemplate)
     */
    async handleAssetCapture(taskName: string, assetName: string, rect: { x: number, y: number, w: number, h: number }) {
        logger.info('engine', 'Processing asset capture', { taskName, assetName, rect });

        const templateData = await this.vision.captureTemplate(rect);

        if (templateData && templateData.data.length > 0) {
            // 转换 ImageData 为 Base64
            const canvas = document.createElement('canvas');
            canvas.width = templateData.width;
            canvas.height = templateData.height;
            const ctx = canvas.getContext('2d');

            if (ctx) {
                ctx.putImageData(templateData, 0, 0);
                const base64 = canvas.toDataURL('image/png');

                // 更新或创建资产
                const assets = configManager.getTaskAssets(taskName);
                const existingAsset = assets.find(a => a.name === assetName);

                if (existingAsset) {
                    configManager.setTaskAsset(taskName, { ...existingAsset, base64 });
                } else {
                    configManager.setTaskAsset(taskName, { name: assetName, base64 });
                }

                bus.emit(EVENTS.ASSETS_CHANGED, taskName);
                bus.emit(EVENTS.STATUS_UPDATE, `资产 ${assetName} 捕获成功`);
                logger.info('engine', 'Asset captured successfully', { taskName, assetName });
                return;
            }
        }

        bus.emit(EVENTS.STATUS_UPDATE, '资产捕获失败');
        logger.warn('engine', 'Asset capture failed', { taskName, assetName });
    }

    /**
     * 资产调试匹配 (单次匹配测试，结果显示在 DebugLayer)
     */
    async handleAssetDebugMatch(data: { taskName: string; assetName: string; base64: string; roi?: any; threshold?: number }) {
        const { taskName, assetName, base64, roi, threshold } = data;
        logger.info('engine', '[Match.Debug] Start', { taskName, assetName });

        try {
            // Step 1: Register template
            const tempTemplateName = `_debug_${assetName}`;
            await this.algo.register(tempTemplateName, base64);

            // Step 2: Capture screen
            const screen = await this.vision.getImageData();
            if (!screen) {
                logger.error('engine', '[Match.Debug] Failed - no video stream');
                bus.emit(EVENTS.STATUS_UPDATE, '调试匹配失败: 无法捕获屏幕');
                return;
            }
            logger.debug('engine', '[Match.Debug] Screen captured', {
                size: `${screen.width}x${screen.height}`
            });

            // Step 3: Get template
            const asset = this.algo.getAsset(tempTemplateName);
            if (!asset) {
                logger.error('engine', '[Match.Debug] Failed - template not found');
                bus.emit(EVENTS.STATUS_UPDATE, '调试匹配失败: 模板注册失败');
                return;
            }

            // Step 4: Build match options
            const matchOptions: any = {
                threshold: threshold || this.config.threshold,
                downsample: this.config.downsample,
                scales: this.config.scales
            };
            if (roi && roi.w > 0 && roi.h > 0) {
                matchOptions.roiEnabled = true;
                matchOptions.roiRegions = [roi];
            }

            logger.debug('engine', '[Match.Debug] Options', {
                threshold: matchOptions.threshold,
                downsample: matchOptions.downsample,
                templateSize: `${asset.template.width}x${asset.template.height}`,
                roiEnabled: matchOptions.roiEnabled || false,
                roi: roi ? { x: roi.x, y: roi.y, w: roi.w, h: roi.h } : null,
                screenSize: `${screen.width}x${screen.height}`
            });

            // Step 5: Execute match
            const result = await this.vision.match(screen, asset.template, matchOptions);

            // Log result
            const effectiveThreshold = threshold || this.config.threshold;
            logger.debug('engine', '[Match.Debug] Result', {
                score: result?.score?.toFixed(4),
                threshold: effectiveThreshold,
                matched: result && result.score >= effectiveThreshold
            });

            if (!result || result.score < effectiveThreshold) {
                bus.emit(EVENTS.DEBUG_CLEAR);
                // 提供更有用的反馈信息
                const scoreInfo = result?.score ? ` (分数: ${(result.score * 100).toFixed(1)}%, 阈值: ${(effectiveThreshold * 100).toFixed(0)}%)` : '';
                const suggestion = result?.score && result.score >= 0.5
                    ? ' 尝试降低阈值或重新截取更清晰的模板'
                    : '';
                bus.emit(EVENTS.STATUS_UPDATE, `✗ ${assetName} 未匹配到${scoreInfo}${suggestion}`);
                logger.info('engine', 'Debug match failed', {
                    assetName,
                    score: result?.score,
                    threshold: effectiveThreshold,
                    suggestion: result?.score && result.score >= 0.5 ? 'Consider lowering threshold' : 'Template may not be visible on screen'
                });
                return;
            }

            // 获取显示信息进行坐标转换 (游戏坐标 → 屏幕坐标)
            const displayInfo = this.vision.getDisplayInfo();
            if (!displayInfo) {
                bus.emit(EVENTS.STATUS_UPDATE, '调试匹配失败: 无法获取显示信息');
                return;
            }

            // 坐标映射 (与 ScreenshotMatchTask 保持一致)
            const screenX = displayInfo.offsetX + (result.x * displayInfo.scaleX);
            const screenY = displayInfo.offsetY + (result.y * displayInfo.scaleY);
            const screenW = asset.template.width * displayInfo.scaleX;
            const screenH = asset.template.height * displayInfo.scaleY;

            // 考虑缩放因子
            const matchScale = result.bestScale || 1.0;
            const finalW = screenW * matchScale;
            const finalH = screenH * matchScale;

            // [调试日志] 输出坐标信息
            logger.debug('engine', '[Match.Debug] Drawing result', {
                screenPos: { x: screenX, y: screenY },
                size: { w: finalW, h: finalH },
                score: result.score
            });

            // 匹配成功，绘制结果 (发送中心点坐标，与 ScreenshotMatchTask 一致)
            bus.emit(EVENTS.DEBUG_DRAW, {
                x: screenX + finalW / 2,
                y: screenY + finalH / 2,
                w: finalW,
                h: finalH,
                score: result.score,
                label: `${assetName} (${(result.score * 100).toFixed(1)}%)`
            });
            bus.emit(EVENTS.STATUS_UPDATE, `✓ ${assetName} 匹配成功 (${(result.score * 100).toFixed(1)}%)`);

        } catch (error) {
            logger.error('engine', 'Debug match failed', { error });
            bus.emit(EVENTS.STATUS_UPDATE, '调试匹配出错');
        }
    }
}

