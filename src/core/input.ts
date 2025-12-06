import { RandomUtils } from '../utils/math';
import { logger } from './logging/logger';
import { GamepadState, GamepadButtonName, DEFAULT_GAMEPAD_STATE } from '../types/gamepad';

// [关键修复] 获取真实的 window 对象
// 在 Tampermonkey 沙箱中，必须使用 unsafeWindow 才能访问页面上的变量(如 BX_EXPOSED)
const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

export class InputSystem {
    private _state: GamepadState = { ...DEFAULT_GAMEPAD_STATE };

    /**
     * 获取当前状态的只读副本
     */
    get state(): Readonly<GamepadState> {
        return this._state;
    }

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
        const cleanState = JSON.parse(JSON.stringify(this._state));

        // 使用 performance.now() 确保时间戳精度
        this.channel.sendGamepadInput(performance.now(), [cleanState]);
    }

    /**
     * 拟人化按键点击
     * @param key 按键名称
     * @param baseDuration 基础持续时间 (毫秒)
     */
    async tap(key: GamepadButtonName, baseDuration = 100) {
        if (!this.channel) {
            logger.debug('input', 'Input channel not available, tap command ignored', { key });
            return;
        }

        const duration = RandomUtils.humanDelay(baseDuration, baseDuration * 0.2);

        logger.debug('input', `Tapping ${key} for ${duration}ms`);

        // 按下
        (this._state as any)[key] = 1;
        this.send();

        // 等待
        await new Promise(r => setTimeout(r, duration));

        // 松开
        (this._state as any)[key] = 0;
        this.send();

        // 点击后也随机休息一下，模拟手指回弹
        await new Promise(r => setTimeout(r, RandomUtils.humanDelay(50, 10)));
    }

    /**
     * 重置状态
     */
    reset() {
        this._state = { ...DEFAULT_GAMEPAD_STATE };
    }
}

