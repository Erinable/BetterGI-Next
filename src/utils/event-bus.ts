type Callback = (data: any) => void;

class EventBus {
    private events: Record<string, Callback[]> = {};

    on(event: string, cb: Callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(cb);
    }

    emit(event: string, data?: any) {
        if (this.events[event]) {
            this.events[event].forEach(cb => cb(data));
        }
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
    CONFIG_UPDATE: 'config:update',
    CROP_REQUEST: 'crop:request',
    TASK_LIST_UPDATE: 'TASK_LIST_UPDATE',
};
