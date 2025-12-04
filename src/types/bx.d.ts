// 基于你提供的 bx-exposed.ts 分析
export interface BxInputChannel {
    sendGamepadInput(timestamp: number, inputStates: any[]): void;
}

export interface BxExposedGlobal {
    inputChannel?: BxInputChannel;
    // 这里可以根据需要补充更多 BX 的 API
}

declare global {
    interface Window {
        BX_EXPOSED?: BxExposedGlobal;
        cv: any; // OpenCV 全局对象
    }
}
