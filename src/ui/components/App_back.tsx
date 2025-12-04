import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useDraggable } from '../hooks/useDraggable';
import { bus, EVENTS } from '../../utils/event-bus';

interface AppProps {
    initialPos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onClose: () => void;
	onCrop: () => void; // [新增]
}

export function App({ initialPos, onPosChange, onClose, onCrop }: AppProps) {
    // 面板不需要吸附，但需要保存位置
    const { pos, startDrag } = useDraggable({
        initialPos,
        onDragEnd: onPosChange,
        canDock: false
    });

    const [status, setStatus] = useState('等待引擎...');
    const [running, setRunning] = useState(false);
    const [threshold, setThreshold] = useState(0.8);
    const [isDebug, setIsDebug] = useState(false);

	// 增加一个状态来记录 vision 是否就绪
    const [videoReady, setVideoReady] = useState(false);
    useEffect(() => {
        const updateStatus = (msg: string) => setStatus(msg);
        bus.on(EVENTS.STATUS_UPDATE, updateStatus);
        return () => { /* clean up */ };
    }, []);

    const toggle = () => {
        if (running) bus.emit(EVENTS.TASK_STOP);
        else bus.emit(EVENTS.TASK_START, '自动跳过剧情');
        setRunning(!running);
    };

    const handleConfigChange = (key: string, val: any) => {
        if (key === 'threshold') setThreshold(val);
        if (key === 'debug') setIsDebug(val);
        
        bus.emit(EVENTS.CONFIG_UPDATE, { [key]: val });
    };

	const handleCropClick = () => {
        // 简单粗暴：点击时判断一下
        // 但由于 UI 和 Engine 隔离，这里通过 alert 处理是最简单的
        // 如果想做按钮置灰，需要 Engine 持续广播 { videoReady: true/false }
        onCrop();
    };

    return (
        <div 
            class="bgi-panel" 
            style={{ 
                top: pos.y, 
                left: pos.x, 
                position: 'fixed', // 确保是 fixed 定位
                pointerEvents: 'auto' 
            }}
        >
            {/* Header 区域：绑定 startDrag */}
            <div 
                class="row header" 
                onMouseDown={startDrag} // [修复3] 拖拽触发点
                style={{ 
                    cursor: 'move', 
                    borderBottom: '1px solid #333', 
                    paddingBottom: '5px',
                    marginBottom: '10px',
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                }}
            >
                <strong>BetterGi v2.0</strong>
                <span 
                    // 阻止冒泡，防止点击关闭时触发拖拽
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onClose} 
                    style={{ cursor: 'pointer', padding: '0 5px', fontSize: '16px' }}
                >×</span>
            </div>

            <div class="row">
                <label>状态: <span style={{ color: running ? '#0f0' : '#888' }}>{status}</span></label>
            </div>

            <div class="row">
                <label>匹配阈值: {threshold.toFixed(2)}</label>
                <input 
                    type="range" min="0.5" max="1.0" step="0.01" 
                    value={threshold} 
                    onInput={(e: any) => handleConfigChange('threshold', parseFloat(e.target.value))} 
                />
            </div>

            {/* [修复1] Debug 开关 */}
            <div class="row" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input 
                    type="checkbox" 
                    id="chk-debug" 
                    checked={isDebug} 
                    onChange={(e: any) => handleConfigChange('debug', e.target.checked)}
                />
                <label for="chk-debug" style={{ margin:0, cursor:'pointer' }}>开启视觉调试 (Debug)</label>
            </div>

			<div class="row" style={{ display: 'flex', gap: '5px' }}>
                <button class="bgi-btn" style={{ flex: 1 }} onClick={onCrop}>
                    📷 截图取模
                </button>
                {/* 停止预览按钮 */}
                <button class="bgi-btn" style={{ flex: 1 }} onClick={() => bus.emit(EVENTS.TASK_STOP)}>
                    ⏹ 停止预览
                </button>
            </div>
            <button 
                class={`bgi-btn ${running ? 'danger' : 'primary'}`}
                onClick={toggle}
            >
                {running ? '⏹ 停止任务' : '▶ 启动任务'}
            </button>
        </div>
    );
}
