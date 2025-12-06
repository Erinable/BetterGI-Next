// src/types/gamepad.ts - Gamepad state types

/**
 * Xbox Gamepad 输入状态
 */
export interface GamepadState {
    GamepadIndex: number;
    // 面板按键
    A: number;
    B: number;
    X: number;
    Y: number;
    // 肩键
    LeftShoulder: number;
    RightShoulder: number;
    LeftTrigger: number;
    RightTrigger: number;
    // 功能键
    View: number;
    Menu: number;
    LeftThumb: number;
    RightThumb: number;
    // 方向键
    DPadUp: number;
    DPadDown: number;
    DPadLeft: number;
    DPadRight: number;
    // 摇杆
    Nexus: number;
    LeftThumbXAxis: number;
    LeftThumbYAxis: number;
    RightThumbXAxis: number;
    RightThumbYAxis: number;
    // 状态标记
    PhysicalPhysicality: number;
    VirtualPhysicality: number;
    Dirty: boolean;
    Virtual: boolean;
}

/**
 * Gamepad 按键名称类型
 */
export type GamepadButtonName =
    | 'A' | 'B' | 'X' | 'Y'
    | 'LeftShoulder' | 'RightShoulder' | 'LeftTrigger' | 'RightTrigger'
    | 'View' | 'Menu' | 'LeftThumb' | 'RightThumb'
    | 'DPadUp' | 'DPadDown' | 'DPadLeft' | 'DPadRight'
    | 'Nexus'
    | 'LeftThumbXAxis' | 'LeftThumbYAxis' | 'RightThumbXAxis' | 'RightThumbYAxis';

/**
 * 默认 Gamepad 状态
 */
export const DEFAULT_GAMEPAD_STATE: GamepadState = {
    GamepadIndex: 0,
    A: 0, B: 0, X: 0, Y: 0,
    LeftShoulder: 0, RightShoulder: 0, LeftTrigger: 0, RightTrigger: 0,
    View: 0, Menu: 0, LeftThumb: 0, RightThumb: 0,
    DPadUp: 0, DPadDown: 0, DPadLeft: 0, DPadRight: 0,
    Nexus: 0, LeftThumbXAxis: 0, LeftThumbYAxis: 0,
    RightThumbXAxis: 0, RightThumbYAxis: 0,
    PhysicalPhysicality: 0, VirtualPhysicality: 0,
    Dirty: true, Virtual: true
};
