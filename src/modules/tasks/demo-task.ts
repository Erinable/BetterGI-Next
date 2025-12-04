// src/modules/tasks/demo-task.ts
import { BaseTask } from '../../core/base-task';

export class AutoSkipTask extends BaseTask {
    constructor() {
        super('自动跳过剧情');
        this.interval = 500; // 每 500ms 检查一次
    }

    // 可选：初始化时注册图片
    async onRegister() {
        // 这是一个示例 Base64，实际开发中你需要用截图工具获取
        await this.ctx.algo.register('dialog_icon', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==');
		console.log('[Task] AutoSkipTask assets loaded');
    }

    async onLoop(screen: ImageData) {
        // 1. 查找屏幕上是否有对话图标
        const res = await this.ctx.algo.findAsync(screen, 'dialog_icon', { 
            threshold: 0.85 
        });

        if (res) {
            console.log(`[Task] Found dialog at (${res.x}, ${res.y}), skipping...`);
            
            // 2. 如果找到了，按下 'A' 键（Xbox 手柄确认键）
            await this.ctx.input.tap('A');
            
            // 3. 稍微等待，防止连点过快
            await this.sleep(200);
        } else {
            // 没找到，啥也不做，等待下一次循环
        }
    }
}
