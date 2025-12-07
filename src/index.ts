// src/index.ts
import { Engine } from './core/engine';
import { OverlayManager } from './ui/overlay';
import { AutoPickTask } from './modules/tasks/auto-pick-task';
import { AutoSkipTask } from './modules/tasks/auto-skip-task';
import { logger } from './core/logging/logger';

// 获取真实的页面 window 对象 (用于暴露全局变量到控制台)
const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

(async function() {
    logger.info('app', 'BetterGi initializing...');

    // 1. 初始化引擎
    const engine = new Engine();

    // 2. 暴露到真实的页面 window (这样控制台才能访问)
    const globalObj = realWindow as any;

    globalObj.BetterGi = { engine, vision: engine.vision, input: engine.input };
    globalObj._BetterGiDebug = { engine };

    // 暴露诊断工具
    globalObj.BetterGiDiag = {
        check: () => {
            const status = {
                hasBXExposed: !!realWindow.BX_EXPOSED,
                hasInputChannel: !!realWindow.BX_EXPOSED?.inputChannel,
                inputChannelType: realWindow.BX_EXPOSED?.inputChannel?.constructor?.name,
                timestamp: new Date().toISOString()
            };
            console.log('Better-xCloud Status:', status);
            return status;
        },
        hijackTest: () => {
            return engine.input.diagnoseHijackability();
        }
    };

    logger.info('app', '🔍 Diagnostic tools exposed to realWindow');

    // 添加调试日志确认暴露成功
    console.log('✅ BetterGi v2.0 已加载到全局 (unsafeWindow):', {
        BetterGi: !!globalObj.BetterGi,
        engine: !!globalObj.BetterGi?.engine,
        input: !!globalObj.BetterGi?.input,
        vision: !!globalObj.BetterGi?.vision,
        diagnostic: !!globalObj.BetterGiDiag
    });

    // 3. 初始化 UI
    new OverlayManager();

    // 4. 注册任务 (基于 Migration Logic Map)
    engine.registerTask(new AutoPickTask());
    engine.registerTask(new AutoSkipTask());

    // 5. 延迟确认全局对象仍然可用
    setTimeout(() => {
        console.log('✅ BetterGi 确认可用:', {
            hasGlobal: !!globalObj.BetterGi,
            hasEngine: !!globalObj.BetterGi?.engine,
            methods: Object.getOwnPropertyNames(Object.getPrototypeOf(globalObj.BetterGi.engine)),
            hasDiagnostic: !!globalObj.BetterGiDiag
        });

        // 提供控制台使用提示
        console.log('🎮 BetterGi Console Commands:');
        console.log('  - window.BetterGiDiag.check() - 快速检查BX_EXPOSED状态');
        console.log('  - window.BetterGi.engine.input.tap(\'A\', 200) - 测试按键');
        console.log('  - window.BetterGi.engine.listTasks() - 列出所有任务');

    }, 2000);

})();
