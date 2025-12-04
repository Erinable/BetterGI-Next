import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useDraggable } from '../hooks/useDraggable';
import { bus, EVENTS } from '../../utils/event-bus';
import { PerformancePanel } from './PerformancePanel';

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

    // 性能面板状态
    const [showPerformancePanel, setShowPerformancePanel] = useState(false);
    const [performancePanelPos, setPerformancePanelPos] = useState({ x: 100, y: 100 });

    // 配置项状态
    const [threshold, setThreshold] = useState(0.8);
    const [downsample, setDownsample] = useState(0.33);
    const [scaleMode, setScaleMode] = useState('OFF');
    const [isDebug, setIsDebug] = useState(true);

    // 性能相关状态
    const [performanceStats, setPerformanceStats] = useState<any>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [adaptiveScaling, setAdaptiveScaling] = useState(true);
    const [roiEnabled, setRoiEnabled] = useState(false);
    const [matchingMethod, setMatchingMethod] = useState('TM_CCOEFF_NORMED');
    const [earlyTermination, setEarlyTermination] = useState(true);

    useEffect(() => {
        const updateStatus = (msg: string) => setStatus(msg);
        bus.on(EVENTS.STATUS_UPDATE, updateStatus);

        // 性能统计事件监听
        const updatePerformanceStats = (stats: any) => setPerformanceStats(stats);
        bus.on(EVENTS.PERFORMANCE_WORKER_STATS, updatePerformanceStats);

        // 初始化时发送一次默认配置给引擎
        sendConfig({
            threshold: 0.8,
            downsample: 0.33,
            scales: [1.0],
            adaptiveScaling: true,
            earlyTermination: true,
            matchingMethod: 'TM_CCOEFF_NORMED'
        });

        return () => {
            bus.off(EVENTS.STATUS_UPDATE, updateStatus);
            bus.off(EVENTS.PERFORMANCE_WORKER_STATS, updatePerformanceStats);
        };
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
        sendConfig({ debugMode: val });
    };

    const handleAdaptiveScalingChange = (e: any) => {
        const val = e.target.checked;
        setAdaptiveScaling(val);
        sendConfig({ adaptiveScaling: val });
    };

    const handleRoiEnabledChange = (e: any) => {
        const val = e.target.checked;
        setRoiEnabled(val);
        sendConfig({ roiEnabled: val });
    };

    const handleMatchingMethodChange = (e: any) => {
        const val = e.target.value;
        setMatchingMethod(val);
        sendConfig({ matchingMethod: val });
    };

    const handleEarlyTerminationChange = (e: any) => {
        const val = e.target.checked;
        setEarlyTermination(val);
        sendConfig({ earlyTermination: val });
    };

    return (
        <>
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

            {/* 性能统计显示 */}
            {performanceStats && (
                <div class="row" style={{ fontSize: '10px', color: '#aaa', border: '1px solid #333', padding: '5px', borderRadius: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>⚡ 平均耗时:</span>
                        <span>{performanceStats.averageTime || 0}ms</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>📊 匹配次数:</span>
                        <span>{performanceStats.matchCount || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>💾 缓存大小:</span>
                        <span>{performanceStats.cacheSize || 0}</span>
                    </div>
                </div>
            )}

            {/* 高级设置切换 */}
            <div class="row" style={{ marginTop: '10px' }}>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{
                        width: '100%',
                        background: showAdvanced ? '#060' : '#333',
                        border: '1px solid #444',
                        color: 'white',
                        padding: '5px',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                >
                    {showAdvanced ? '▼ 隐藏高级设置' : '▶ 显示高级设置'}
                </button>
            </div>

            {/* 高级性能设置 */}
            {showAdvanced && (
                <div style={{ border: '1px solid #444', padding: '8px', margin: '5px 0', borderRadius: '3px' }}>
                    {/* 自适应缩放 */}
                    <div class="row" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                        <input type="checkbox" id="chk-adaptive" checked={adaptiveScaling} onChange={handleAdaptiveScalingChange} />
                        <label for="chk-adaptive" style={{ margin:0, cursor:'pointer', fontSize: '11px' }}>自适应缩放</label>
                    </div>

                    {/* ROI匹配 */}
                    <div class="row" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                        <input type="checkbox" id="chk-roi" checked={roiEnabled} onChange={handleRoiEnabledChange} />
                        <label for="chk-roi" style={{ margin:0, cursor:'pointer', fontSize: '11px' }}>ROI区域匹配</label>
                    </div>

                    {/* 早期终止 */}
                    <div class="row" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                        <input type="checkbox" id="chk-early" checked={earlyTermination} onChange={handleEarlyTerminationChange} />
                        <label for="chk-early" style={{ margin:0, cursor:'pointer', fontSize: '11px' }}>早期终止优化</label>
                    </div>

                    {/* 匹配算法 */}
                    <div class="row" style={{ marginBottom: '5px' }}>
                        <label style={{ fontSize: '11px' }}>匹配算法</label>
                        <select value={matchingMethod} onChange={handleMatchingMethodChange} style={{width:'100%', background:'#222', color:'white', border:'1px solid #444', fontSize: '11px' }}>
                            <option value="TM_CCOEFF_NORMED">标准相关系数</option>
                            <option value="TM_SQDIFF_NORMED">平方差匹配</option>
                            <option value="TM_CCORR_NORMED">相关性匹配</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Debug 开关 */}
            <div class="row" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                <input type="checkbox" id="chk-debug" checked={isDebug} onChange={handleDebugChange} />
                <label for="chk-debug" style={{ margin:0, cursor:'pointer' }}>开启视觉调试 (Debug)</label>
            </div>

            <div class="row" style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                <button class="bgi-btn" style={{ flex: 1 }} onClick={onCrop}>📷 截图</button>
                <button class="bgi-btn" style={{ flex: 1 }} onClick={() => bus.emit(EVENTS.TASK_STOP)}>⏹ 停止预览</button>
            </div>

            <div class="row" style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                <button
                    class="bgi-btn"
                    style={{ flex: 1, background: '#2196F3' }}
                    onClick={() => setShowPerformancePanel(!showPerformancePanel)}
                >
                    📊 {showPerformancePanel ? '隐藏性能监控' : '显示性能监控'}
                </button>
            </div>

            <button
                class={`bgi-btn ${running ? 'danger' : 'primary'}`}
                onClick={toggle}
            >
                {running ? '⏹ 停止任务' : '▶ 启动任务'}
            </button>
        </div>

        {/* 性能监控面板 */}
        {showPerformancePanel && (
            <PerformancePanel
                initialPos={performancePanelPos}
                onPosChange={setPerformancePanelPos}
                onClose={() => setShowPerformancePanel(false)}
            />
        )}
        </>
    );
}
