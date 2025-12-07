type Callback = (data: any) => void;

class EventBus {
    private events: Record<string, Callback[]> = {};

    on(event: string, cb: Callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(cb);
    }

    off(event: string, cb: Callback) {
        if (this.events[event]) {
            const index = this.events[event].indexOf(cb);
            if (index > -1) {
                this.events[event].splice(index, 1);
            }
        }
    }

    emit(event: string, data?: any) {
        if (this.events[event]) {
            this.events[event].forEach(cb => cb(data));
        }
    }

    // 清除所有监听器
    clear() {
        this.events = {};
    }

    // 清除指定事件的所有监听器
    clearEvent(event: string) {
        delete this.events[event];
    }

    // 获取指定事件的监听器数量
    listenerCount(event: string): number {
        return this.events[event]?.length || 0;
    }

    // 获取所有事件名称
    eventNames(): string[] {
        return Object.keys(this.events);
    }
}

export const bus = new EventBus();
export const EVENTS = {
    ENGINE_READY: 'engine:ready',
    STATUS_UPDATE: 'status:update',
    DEBUG_DRAW: 'debug:draw',
    DEBUG_CLEAR: 'debug:clear', // [新增] 强制清空调试层
    TASK_START: 'task:start',
    TASK_STOP: 'task:stop',
    TASK_PAUSE: 'task:pause',
    TASK_RESUME: 'task:resume',
    CONFIG_UPDATE: 'config:update',
    CROP_REQUEST: 'crop:request',
    TASK_LIST_UPDATE: 'TASK_LIST_UPDATE',
    ENGINE_STATE_CHANGE: 'engine:state_change', // [新增] 引擎运行状态变更
    ENGINE_QUERY_STATE: 'engine:query_state',   // [新增] UI 主动查询引擎状态
    // 性能相关事件
    PERFORMANCE_WORKER_STATS: 'performance:worker_stats',
    PERFORMANCE_METRICS_UPDATE: 'performance:metrics_update',
    PERFORMANCE_CACHE_HIT: 'performance:cache_hit',
    PERFORMANCE_CACHE_MISS: 'performance:cache_miss',
    // 任务资产相关事件
    ASSETS_CHANGED: 'assets:changed',           // 任务资产更新 (payload: taskName)
    TASK_CONFIG_UPDATE: 'task:config_update',   // 任务配置更新 (payload: taskName)
};
