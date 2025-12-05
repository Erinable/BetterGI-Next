import { RandomUtils } from '../utils/math';
import { logger } from './logging/logger';

// [关键修复] 获取真实的 window 对象
// 在 Tampermonkey 沙箱中，必须使用 unsafeWindow 才能访问页面上的变量(如 BX_EXPOSED)
const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

export class InputSystem {
    private state: any = {
        GamepadIndex: 0, A: 0, B: 0, X: 0, Y: 0,
        LeftShoulder: 0, RightShoulder: 0, LeftTrigger: 0, RightTrigger: 0,
        View: 0, Menu: 0, LeftThumb: 0, RightThumb: 0,
        DPadUp: 0, DPadDown: 0, DPadLeft: 0, DPadRight: 0,
        Nexus: 0, LeftThumbXAxis: 0, LeftThumbYAxis: 0,
        RightThumbXAxis: 0, RightThumbYAxis: 0,
        PhysicalPhysicality: 0, VirtualPhysicality: 0,
        Dirty: true, Virtual: true
    };

    get channel() {
        // [关键修复] 使用 win (即 unsafeWindow) 来获取 BX_EXPOSED
        return win.BX_EXPOSED?.inputChannel;
    }

    async init() {
        return new Promise<void>((resolve) => {
            let attempts = 0;
            const maxAttempts = 10; // 减少到10秒，因为实际使用中可能延迟加载

            const check = () => {
                attempts++;

                if (this.channel) {
                    logger.info('input', '✅ BetterGi InputSystem 连接成功', {
                        attempts: attempts,
                        channelType: this.channel.constructor?.name || 'Unknown'
                    });
                    resolve();
                } else if (attempts >= maxAttempts) {
                    // 不再报错，只是警告，因为实际使用中可能延迟加载
                    logger.warn('input', '⚠️ InputSystem 初始化超时，但可能稍后会自动工作', {
                        attempts: attempts,
                        hasBXExposed: !!win.BX_EXPOSED,
                        hasInputChannel: !!win.BX_EXPOSED?.inputChannel
                    });
                    resolve(); // 仍然 resolve，让系统继续运行
                } else {
                    setTimeout(check, 1000);
                }
            };
            check();
        });
    }

    private send() {
        if (!this.channel) return;

        // [关键修复] 必须深拷贝对象以去除沙箱引用，否则页面脚本无法读取对象属性
        const cleanState = JSON.parse(JSON.stringify(this.state));

        // 使用 performance.now() 确保时间戳精度
        this.channel.sendGamepadInput(performance.now(), [cleanState]);
    }

    /**
     * 拟人化按键点击
     */
    async tap(key: string, baseDuration = 100) {
        if (!this.channel) {
            logger.debug('input', 'Input channel not available, tap command ignored', { key });
            return;
        }

        const duration = RandomUtils.humanDelay(baseDuration, baseDuration * 0.2);

        logger.debug('input', `Tapping ${key} for ${duration}ms`);

        // 按下
        this.state[key] = 1;
        this.send();

        // 等待
        await new Promise(r => setTimeout(r, duration));

        // 松开
        this.state[key] = 0;
        this.send();

        // 点击后也随机休息一下，模拟手指回弹
        await new Promise(r => setTimeout(r, RandomUtils.humanDelay(50, 10)));
    }
}
