import { RandomUtils } from '../utils/math';
import { logger } from './logging/logger';

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
        return window.BX_EXPOSED?.inputChannel;
    }

    async init() {
        return new Promise<void>((resolve) => {
            const check = () => {
                if (this.channel) {
                    logger.info('input', 'Connected via Better-xCloud');
                    resolve();
                } else {
                    setTimeout(check, 1000);
                }
            };
            check();
        });
    }

    private send() {
        this.channel?.sendGamepadInput(performance.now(), [this.state]);
    }

    /**
     * 拟人化点击：包含按下、随机持续时间、松开
     */
    async tap(key: string, baseDuration = 100) {
        // 随机波动 20%
        const duration = RandomUtils.humanDelay(baseDuration, baseDuration * 0.2);
        
        this.state[key] = 1; 
        this.send();
        
        await new Promise(r => setTimeout(r, duration));
        
        this.state[key] = 0; 
        this.send();
        
        // 点击后也随机休息一下，模拟手指回弹
        await new Promise(r => setTimeout(r, RandomUtils.humanDelay(50, 10)));
    }
}
