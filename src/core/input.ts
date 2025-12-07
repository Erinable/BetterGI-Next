import { RandomUtils } from '../utils/math';
import { logger } from './logging/logger';
import { GamepadState, GamepadButtonName, DEFAULT_GAMEPAD_STATE } from '../types/gamepad';

// [关键修复] 获取真实的 window 对象
// 在 Tampermonkey 沙箱中，必须使用 unsafeWindow 才能访问页面上的变量(如 BX_EXPOSED)
const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

/**
 * 录制的输入记录
 */
export interface InputRecord {
    t: number;       // 时间戳 (ms)
    s: GamepadState; // 手柄状态
}

/**
 * 回放选项
 */
interface PlaybackOptions {
    speedMultiplier?: number;  // 速度倍率 (0.5 - 2.0)
    startIndex?: number;       // 从指定位置开始
    onProgress?: (index: number, total: number) => void;
    onComplete?: () => void;
    onPause?: (pausedAt: number) => void;
}

/**
 * 录制数量限制
 */
const MAX_RECORDINGS = 50000; // 约 15-20 MB

export class InputSystem {
    private _state: GamepadState = { ...DEFAULT_GAMEPAD_STATE };
    private _isHijacked: boolean = false;
    private _isRecording: boolean = false;
    private _recordings: InputRecord[] = [];
    private _originalSendGamepadInput: Function | null = null;
    private _lastRecordedState: string = '';

    // 回放状态
    private _isPlaying: boolean = false;
    private _isPaused: boolean = false;
    private _playbackAbort: boolean = false;
    private _playbackMutex: boolean = false;  // 互斥锁
    private _pausedAtIndex: number = 0;       // 暂停位置
    private _currentRecords: InputRecord[] = [];  // 当前回放的记录
    private _currentOptions: PlaybackOptions = {}; // 当前回放选项

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

    get isHijacked(): boolean {
        return this._isHijacked;
    }

    get isRecording(): boolean {
        return this._isRecording;
    }

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    get isPaused(): boolean {
        return this._isPaused;
    }

    get recordingCount(): number {
        return this._recordings.length;
    }

    get pausedAtIndex(): number {
        return this._pausedAtIndex;
    }

    async init() {
        return new Promise<void>((resolve) => {
            let attempts = 0;
            const maxAttempts = 10;

            const check = () => {
                attempts++;

                if (this.channel) {
                    logger.info('input', '✅ BetterGi InputSystem 连接成功', {
                        attempts: attempts,
                        channelType: this.channel.constructor?.name || 'Unknown'
                    });
                    resolve();
                } else if (attempts >= maxAttempts) {
                    logger.warn('input', '⚠️ InputSystem 初始化超时，但可能稍后会自动工作', {
                        attempts: attempts,
                        hasBXExposed: !!win.BX_EXPOSED,
                        hasInputChannel: !!win.BX_EXPOSED?.inputChannel
                    });
                    resolve();
                } else {
                    setTimeout(check, 1000);
                }
            };
            check();
        });
    }

    /**
     * 诊断: 检查 inputChannel 是否可以被劫持
     */
    diagnoseHijackability(): { canHijack: boolean; reason: string; details: any } {
        if (!this.channel) {
            return { canHijack: false, reason: 'inputChannel 不存在', details: null };
        }

        const channel = this.channel;
        const details: any = {
            isFrozen: Object.isFrozen(channel),
            isSealed: Object.isSealed(channel),
            hasMethod: typeof channel.sendGamepadInput === 'function'
        };

        try {
            const descriptor = Object.getOwnPropertyDescriptor(channel, 'sendGamepadInput');
            details.descriptor = descriptor;
            details.isWritable = descriptor?.writable !== false;
            details.isConfigurable = descriptor?.configurable !== false;
        } catch (e) {
            details.descriptorError = String(e);
        }

        // 尝试判断是否可劫持
        if (details.isFrozen) {
            return { canHijack: false, reason: '对象被 freeze', details };
        }
        if (details.isSealed && !details.isConfigurable) {
            return { canHijack: false, reason: '对象被 seal 且不可配置', details };
        }
        if (!details.hasMethod) {
            return { canHijack: false, reason: 'sendGamepadInput 方法不存在', details };
        }

        return { canHijack: true, reason: '可以劫持', details };
    }

    /**
     * 劫持 inputChannel，启用录制能力
     */
    hijack(): boolean {
        if (this._isHijacked) {
            logger.warn('input', '已经劫持过了');
            return true;
        }

        const diagnosis = this.diagnoseHijackability();
        if (!diagnosis.canHijack) {
            logger.error('input', `无法劫持: ${diagnosis.reason}`, diagnosis.details);
            return false;
        }

        const channel = this.channel;
        this._originalSendGamepadInput = channel.sendGamepadInput.bind(channel);

        const self = this;
        channel.sendGamepadInput = function(timestamp: number, states: GamepadState[]) {
            // 如果正在录制，存储数据
            if (self._isRecording && states.length > 0) {
                const stateStr = JSON.stringify(states[0]);
                // 增量录制：只记录变化的状态
                if (stateStr !== self._lastRecordedState) {
                    // 安全: 限制录制数量
                    if (self._recordings.length < MAX_RECORDINGS) {
                        self._recordings.push({
                            t: timestamp,
                            s: JSON.parse(stateStr)
                        });
                        self._lastRecordedState = stateStr;
                    } else if (self._recordings.length === MAX_RECORDINGS) {
                        logger.warn('input', `录制已达上限 ${MAX_RECORDINGS} 条，停止录制新数据`);
                        self._recordings.push({ t: timestamp, s: JSON.parse(stateStr) });
                    }
                }
            }

            // 转发给原函数
            return self._originalSendGamepadInput!(timestamp, states);
        };

        this._isHijacked = true;
        logger.info('input', '✅ inputChannel 劫持成功');
        return true;
    }

    /**
     * 开始录制
     */
    startRecording(): void {
        if (!this._isHijacked) {
            logger.warn('input', '请先调用 hijack() 劫持 inputChannel');
            return;
        }
        if (this._isPlaying) {
            logger.warn('input', '正在回放中，无法同时录制');
            return;
        }
        this._recordings = [];
        this._lastRecordedState = '';
        this._isRecording = true;
        logger.info('input', '🔴 开始录制');
    }

    /**
     * 停止录制并返回数据
     */
    stopRecording(): InputRecord[] {
        this._isRecording = false;
        const data = [...this._recordings];
        logger.info('input', `⏹️ 停止录制, 共 ${data.length} 条记录`);
        return data;
    }

    /**
     * 清空录制数据
     */
    clearRecordings(): void {
        this._recordings = [];
        this._lastRecordedState = '';
    }

    /**
     * 回放录制的输入 (带互斥锁和暂停支持)
     * @param records 录制数据
     * @param options 回放选项
     */
    async playback(records: InputRecord[], options: PlaybackOptions = {}): Promise<boolean> {
        // 互斥锁检查 - 防止竞态条件
        if (this._playbackMutex) {
            logger.warn('input', '回放操作被锁定，请稍候');
            return false;
        }

        if (!this.channel) {
            logger.error('input', '回放失败: inputChannel 不可用');
            return false;
        }

        if (this._isRecording) {
            logger.warn('input', '正在录制中，无法同时回放');
            return false;
        }

        if (!records || records.length === 0) {
            logger.warn('input', '没有可回放的数据');
            return false;
        }

        // 获取互斥锁
        this._playbackMutex = true;

        try {
            // 保存当前回放状态
            this._currentRecords = records;
            this._currentOptions = options;

            // 安全: 限制速度倍率
            const speedMultiplier = Math.max(0.5, Math.min(2.0, options.speedMultiplier || 1.0));
            const startIndex = options.startIndex || 0;

            this._isPlaying = true;
            this._isPaused = false;
            this._playbackAbort = false;

            logger.info('input', `▶️ 开始回放, ${startIndex > 0 ? `从 ${startIndex}/${records.length} 继续` : `共 ${records.length} 条记录`}, 速度 ${speedMultiplier}x`);

            const startTime = performance.now();
            const baseTime = records[startIndex].t;

            for (let i = startIndex; i < records.length; i++) {
                // 检查中止标志
                if (this._playbackAbort) {
                    logger.info('input', `⏹️ 回放已中止 (${i}/${records.length})`);
                    this._pausedAtIndex = 0;
                    break;
                }

                // 检查暂停 - 如果暂停，保存位置并退出循环
                if (this._isPaused) {
                    this._pausedAtIndex = i;  // 保存当前帧位置，恢复时从这里开始

                    // 发送中和状态，防止"按键卡住"问题
                    const neutralState = JSON.parse(JSON.stringify(DEFAULT_GAMEPAD_STATE));
                    this.channel.sendGamepadInput(performance.now(), [neutralState]);

                    logger.info('input', `⏸️ 回放已暂停 (${i}/${records.length})，已发送中和状态`);
                    if (options.onPause) {
                        options.onPause(i);
                    }
                    break;  // 退出循环，等待 resumePlayback 重新调用
                }

                const record = records[i];
                // 计算相对于当前起点的时间
                const targetTime = (record.t - baseTime) / speedMultiplier;
                const elapsed = performance.now() - startTime;
                const waitTime = Math.max(0, targetTime - elapsed);

                // 分段等待以便更快响应暂停/停止
                if (waitTime > 0) {
                    const chunkSize = 30;  // 每30ms检查一次，更快响应
                    let remaining = waitTime;
                    while (remaining > 0 && !this._playbackAbort && !this._isPaused) {
                        await new Promise(r => setTimeout(r, Math.min(chunkSize, remaining)));
                        remaining -= chunkSize;
                    }

                    // 等待后再次检查暂停/中止
                    if (this._isPaused) {
                        this._pausedAtIndex = i;

                        // 发送中和状态，防止"按键卡住"问题
                        const neutralState = JSON.parse(JSON.stringify(DEFAULT_GAMEPAD_STATE));
                        this.channel.sendGamepadInput(performance.now(), [neutralState]);

                        logger.info('input', `⏸️ 回放已暂停 (${i}/${records.length})，已发送中和状态`);
                        if (options.onPause) {
                            options.onPause(i);
                        }
                        break;
                    }
                    if (this._playbackAbort) {
                        this._pausedAtIndex = 0;
                        break;
                    }
                }

                // 发送输入
                const cleanState = JSON.parse(JSON.stringify(record.s));
                this.channel.sendGamepadInput(performance.now(), [cleanState]);

                // 进度回调
                if (options.onProgress) {
                    options.onProgress(i + 1, records.length);
                }
            }

            if (!this._playbackAbort && !this._isPaused) {
                logger.info('input', '✅ 回放完成');
                this._pausedAtIndex = 0;
                if (options.onComplete) {
                    options.onComplete();
                }
            }

            return !this._playbackAbort;

        } catch (error) {
            logger.error('input', '回放出错', { error });
            return false;
        } finally {
            if (!this._isPaused) {
                this._isPlaying = false;
            }
            this._playbackAbort = false;
            this._playbackMutex = false;  // 释放锁
        }
    }

    /**
     * 暂停回放
     */
    pausePlayback(): void {
        if (this._isPlaying && !this._isPaused) {
            this._isPaused = true;
            logger.info('input', '⏸️ 正在暂停回放...');
        }
    }

    /**
     * 恢复回放
     */
    async resumePlayback(): Promise<boolean> {
        if (!this._isPaused || this._pausedAtIndex === 0) {
            logger.warn('input', '没有暂停的回放可恢复');
            return false;
        }

        this._isPaused = false;
        this._isPlaying = false;  // 让 playback 可以重新获取

        logger.info('input', `▶️ 从 ${this._pausedAtIndex} 恢复回放`);

        return this.playback(this._currentRecords, {
            ...this._currentOptions,
            startIndex: this._pausedAtIndex
        });
    }

    /**
     * 从头播放
     */
    async restartPlayback(): Promise<boolean> {
        if (this._currentRecords.length === 0) {
            logger.warn('input', '没有可重新播放的数据');
            return false;
        }

        // 先停止当前回放
        this.stopPlayback();
        await new Promise(r => setTimeout(r, 200));  // 等待停止

        this._pausedAtIndex = 0;
        return this.playback(this._currentRecords, {
            ...this._currentOptions,
            startIndex: 0
        });
    }

    /**
     * 停止回放
     */
    stopPlayback(): void {
        if (this._isPlaying || this._isPaused) {
            this._playbackAbort = true;
            this._isPaused = false;
            this._pausedAtIndex = 0;
            logger.info('input', '🛑 正在停止回放...');
        }
    }

    /**
     * 导出录制数据为 JSON
     */
    exportRecordings(): string {
        const data = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            count: this._recordings.length,
            records: this._recordings
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * 导入录制数据 (带安全验证)
     */
    importRecordings(json: string): { success: boolean; count: number; error?: string } {
        try {
            const data = JSON.parse(json);

            // 安全: 验证数据结构
            if (!data || typeof data !== 'object') {
                return { success: false, count: 0, error: '无效的 JSON 格式' };
            }

            if (!Array.isArray(data.records)) {
                return { success: false, count: 0, error: '缺少 records 数组' };
            }

            // 安全: 验证每条记录
            const validRecords: InputRecord[] = [];
            for (const record of data.records) {
                if (typeof record.t !== 'number' || typeof record.s !== 'object') {
                    continue; // 跳过无效记录
                }
                // 安全: 限制导入数量
                if (validRecords.length >= MAX_RECORDINGS) {
                    break;
                }
                validRecords.push({
                    t: record.t,
                    s: record.s
                });
            }

            if (validRecords.length === 0) {
                return { success: false, count: 0, error: '没有有效的录制数据' };
            }

            this._recordings = validRecords;
            logger.info('input', `📥 导入成功, 共 ${validRecords.length} 条记录`);

            return { success: true, count: validRecords.length };

        } catch (e) {
            return { success: false, count: 0, error: `解析失败: ${e}` };
        }
    }

    /**
     * 获取当前录制数据的副本
     */
    getRecordings(): InputRecord[] {
        return [...this._recordings];
    }

    private send() {
        if (!this.channel) return;

        // [关键修复] 必须深拷贝对象以去除沙箱引用
        const cleanState = JSON.parse(JSON.stringify(this._state));
        this.channel.sendGamepadInput(performance.now(), [cleanState]);
    }

    /**
     * 拟人化按键点击
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

        // 点击后随机休息
        await new Promise(r => setTimeout(r, RandomUtils.humanDelay(50, 10)));
    }

    /**
     * 重置状态
     */
    reset() {
        this._state = { ...DEFAULT_GAMEPAD_STATE };
    }
}
