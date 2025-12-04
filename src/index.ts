// src/index.ts
import { Engine } from './core/engine';
import { OverlayManager } from './ui/overlay';
import { AutoSkipTask } from './modules/tasks/demo-task';

(async function() {
    console.log('[BetterGi] Initializing...');

    // 1. 初始化引擎
    const engine = new Engine();
    (window as any).BetterGi = { engine }; // 方便调试

    // 2. 初始化 UI
    new OverlayManager();

    // 3. 注册任务
    const skipTask = new AutoSkipTask();
    engine.registerTask(skipTask);

})();
