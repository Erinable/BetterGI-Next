import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useDraggable } from '../hooks/useDraggable';
import { bus, EVENTS } from '../../utils/event-bus';

interface AppProps {
    initialPos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onClose: () => void;
    onCrop: () => void;
}

export function App({ initialPos, onPosChange, onClose, onCrop }: AppProps) {
    const { pos, startDrag } = useDraggable({
        initialPos,
        onDragEnd: onPosChange,
        canDock: false
    });

    const [status, setStatus] = useState('等待引擎...');
    const [running, setRunning] = useState(false);
    
    // 配置项状态
    const [threshold, setThreshold] = useState(0.8);
    const [downsample, setDownsample] = useState(0.5);
    const [scaleMode, setScaleMode] = useState('NORMAL');
    const [isDebug, setIsDebug] = useState(true);

    useEffect(() => {
        const updateStatus = (msg: string) => setStatus(msg);
        bus.on(EVENTS.STATUS_UPDATE, updateStatus);
        
        // 初始化时发送一次默认配置给引擎
        sendConfig({ threshold: 0.8, downsample: 0.5, scales: [0.9, 1.0, 1.1] });
        
        return () => {};
    }, []);

    const toggle = () => {
        if (running) {
            bus.emit(EVENTS.TASK_STOP);
        } else {
            bus.emit(EVENTS.TASK_START, '自动跳过剧情');
        }
        setRunning(!running);
    };

    // 统一发送配置
    const sendConfig = (cfg: any) => {
        bus.emit(EVENTS.CONFIG_UPDATE, cfg);
    };

    const handleThresholdChange = (e: any) => {
        const val = parseFloat(e.target.value);
        setThreshold(val);
        sendConfig({ threshold: val });
    };

    const handleQualityChange = (e: any) => {
        const val = parseFloat(e.target.value);
        setDownsample(val);
        sendConfig({ downsample: val });
    };

    const handleScaleChange = (e: any) => {
        const mode = e.target.value;
        setScaleMode(mode);
        
        // 将模式转换为具体的比例数组
        let scales = [1.0];
        if (mode === 'NORMAL') scales = [0.9, 1.0, 1.1];
        if (mode === 'WIDE') scales = [0.8, 0.9, 1.0, 1.1, 1.2]; // 范围更广但更慢
        
        sendConfig({ scales });
    };

    const handleDebugChange = (e: any) => {
        const val = e.target.checked;
        setIsDebug(val);
        sendConfig({ debug: val });
    };

    return (
        <div 
            class="bgi-panel" 
            style={{ 
                top: pos.y, left: pos.x, position: 'fixed', pointerEvents: 'auto',
                width: '240px', fontSize: '12px' 
            }}
        >
            <div 
                class="row header" 
                onMouseDown={startDrag}
                style={{ 
                    cursor: 'move', borderBottom: '1px solid #333', 
                    paddingBottom: '5px', marginBottom: '10px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    userSelect: 'none'
                }}
            >
                <strong>BetterGi v2.0</strong>
                <span onMouseDown={(e) => e.stopPropagation()} onClick={onClose} style={{ cursor: 'pointer', padding: '0 5px', fontSize: '16px' }}>×</span>
            </div>

            <div class="row">
                <label>状态: <span style={{ color: running ? '#0f0' : '#888' }}>{status}</span></label>
            </div>

            {/* 1. 匹配阈值 */}
            <div class="row">
                <div style={{display:'flex', justifyContent:'space-between'}}>
                    <label>匹配阈值</label>
                    <span style={{color:'#aaa'}}>{threshold.toFixed(2)}</span>
                </div>
                <input type="range" min="0.5" max="1.0" step="0.01" value={threshold} onInput={handleThresholdChange} style={{width:'100%'}} />
            </div>

            {/* 2. 预览精度 (降采样) */}
            <div class="row">
                <label>预览精度 (速度 vs 画质)</label>
                <select value={downsample} onChange={handleQualityChange} style={{width:'100%', background:'#222', color:'white', border:'1px solid #444'}}>
                    <option value="0.33">极速 (0.33x)</option>
                    <option value="0.5">标准 (0.5x)</option>
                    <option value="0.66">均衡 (0.66x)</option>
                    <option value="1.0">原画 (1.0x - 慢)</option>
                </select>
            </div>

            {/* 3. 多尺度搜索 */}
            <div class="row">
                <label>多尺度搜索 (大小变化)</label>
                <select value={scaleMode} onChange={handleScaleChange} style={{width:'100%', background:'#222', color:'white', border:'1px solid #444'}}>
                    <option value="OFF">关闭 (仅 1.0x)</option>
                    <option value="NORMAL">标准 (0.9 ~ 1.1)</option>
                    <option value="WIDE">宽范围 (0.8 ~ 1.2)</option>
                </select>
            </div>

            {/* Debug 开关 */}
            <div class="row" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                <input type="checkbox" id="chk-debug" checked={isDebug} onChange={handleDebugChange} />
                <label for="chk-debug" style={{ margin:0, cursor:'pointer' }}>开启视觉调试 (Debug)</label>
            </div>

            <div class="row" style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                <button class="bgi-btn" style={{ flex: 1 }} onClick={onCrop}>📷 截图</button>
                <button class="bgi-btn" style={{ flex: 1 }} onClick={() => bus.emit(EVENTS.TASK_STOP)}>⏹ 停止预览</button>
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
