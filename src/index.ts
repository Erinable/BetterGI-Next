// src/index.ts
import { Engine } from './core/engine';
import { OverlayManager } from './ui/overlay';
import { AutoSkipTask } from './modules/tasks/demo-task';
import { logger } from './core/logging/logger';

(async function() {
    logger.info('app', 'BetterGi initializing...');

    // 1. 初始化引擎
    const engine = new Engine();

    // 2. 确保全局对象正确暴露 - 多重保险
    const globalObj = window as any;
    globalObj.BetterGi = { engine };

    // 备份到多个可能的命名空间
    globalObj._BetterGiDebug = { engine };
    globalObj.BETTERGI = { engine };

    // 确保不可删除
    Object.defineProperty(globalObj, 'BetterGi', {
        value: { engine },
        writable: false,
        configurable: false,
        enumerable: true
    });

    // 添加调试日志确认暴露成功
    console.log('✅ BetterGi v2.0 已加载到全局:', {
        BetterGi: !!globalObj.BetterGi,
        engine: !!globalObj.BetterGi.engine,
        input: !!globalObj.BetterGi.engine?.input,
        vision: !!globalObj.BetterGi.engine?.vision
    });

    // 3. 初始化 UI
    new OverlayManager();

    // 4. 注册任务
    const skipTask = new AutoSkipTask();
    engine.registerTask(skipTask);

    // 5. 延迟确认全局对象仍然可用
    setTimeout(() => {
        console.log('✅ BetterGi 确认可用:', {
            hasGlobal: !!globalObj.BetterGi,
            hasEngine: !!globalObj.BetterGi?.engine,
            methods: Object.getOwnPropertyNames(Object.getPrototypeOf(globalObj.BetterGi.engine))
        });
    }, 2000);

})();
