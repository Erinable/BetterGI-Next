import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useDraggable } from '../hooks/useDraggable';
import { bus, EVENTS } from '../../utils/event-bus';
import { PerformancePanel } from './PerformancePanel';
import { config as configManager } from '../../core/config-manager';

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

    // 配置项状态 - 从配置管理器读取保存的值
    const [threshold, setThreshold] = useState(configManager.get('threshold'));
    const [downsample, setDownsample] = useState(configManager.get('downsample'));
    const [isDebug, setIsDebug] = useState(configManager.get('debugMode'));

    // 性能相关状态 - 从配置管理器读取保存的值
    const [performanceStats, setPerformanceStats] = useState<any>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [adaptiveScaling, setAdaptiveScaling] = useState(configManager.get('adaptiveScaling'));
    const [roiEnabled, setRoiEnabled] = useState(configManager.get('roiEnabled'));
    const [matchingMethod, setMatchingMethod] = useState(configManager.get('matchingMethod'));
    const [earlyTermination, setEarlyTermination] = useState(configManager.get('earlyTermination'));

    // 从配置管理器读取scales并转换为模式
    const getScaleMode = (scales: number[]) => {
        if (scales.length === 1) return 'OFF';
        if (scales.length === 3 && scales[0] === 0.9 && scales[1] === 1.0 && scales[2] === 1.1) return 'NORMAL';
        if (scales.length === 5) return 'WIDE';
        return 'OFF';
    };
    const [scaleMode, setScaleMode] = useState(getScaleMode(configManager.get('scales')));

    // 配置管理状态
    const [pendingConfig, setPendingConfig] = useState<any>({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    useEffect(() => {
        const updateStatus = (msg: string) => setStatus(msg);
        bus.on(EVENTS.STATUS_UPDATE, updateStatus);

        // 性能统计事件监听
        const updatePerformanceStats = (stats: any) => setPerformanceStats(stats);
        bus.on(EVENTS.PERFORMANCE_WORKER_STATS, updatePerformanceStats);

        // 注意：不再初始化时发送配置
        // 引擎在构造函数中已经从configManager读取了配置
        // UI只应该在用户手动更改配置时才发送更新

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
        setPendingConfig(prev => ({ ...prev, threshold: val }));
        setHasUnsavedChanges(true);
    };

    const handleQualityChange = (e: any) => {
        const val = parseFloat(e.target.value);
        setDownsample(val);
        setPendingConfig(prev => ({ ...prev, downsample: val }));
        setHasUnsavedChanges(true);
    };

    const handleScaleChange = (e: any) => {
        const mode = e.target.value;
        setScaleMode(mode);

        // 将模式转换为具体的比例数组
        let scales = [1.0];
        if (mode === 'NORMAL') scales = [0.9, 1.0, 1.1];
        if (mode === 'WIDE') scales = [0.8, 0.9, 1.0, 1.1, 1.2]; // 范围更广但更慢

        setPendingConfig(prev => ({ ...prev, scales }));
        setHasUnsavedChanges(true);
    };

    const handleDebugChange = (e: any) => {
        const val = e.target.checked;
        setIsDebug(val);
        setPendingConfig(prev => ({ ...prev, debugMode: val }));
        setHasUnsavedChanges(true);
    };

    const handleAdaptiveScalingChange = (e: any) => {
        const val = e.target.checked;
        setAdaptiveScaling(val);
        setPendingConfig(prev => ({ ...prev, adaptiveScaling: val }));
        setHasUnsavedChanges(true);
    };

    const handleRoiEnabledChange = (e: any) => {
        const val = e.target.checked;
        setRoiEnabled(val);
        setPendingConfig(prev => ({ ...prev, roiEnabled: val }));
        setHasUnsavedChanges(true);
    };

    const handleMatchingMethodChange = (e: any) => {
        const val = e.target.value;
        setMatchingMethod(val);
        setPendingConfig(prev => ({ ...prev, matchingMethod: val }));
        setHasUnsavedChanges(true);
    };

    const handleEarlyTerminationChange = (e: any) => {
        const val = e.target.checked;
        setEarlyTermination(val);
        setPendingConfig(prev => ({ ...prev, earlyTermination: val }));
        setHasUnsavedChanges(true);
    };

    // 保存配置的函数
    const handleSaveConfig = () => {
        if (Object.keys(pendingConfig).length > 0) {
            // 发送所有待保存的配置
            sendConfig(pendingConfig);
            setPendingConfig({});
            setHasUnsavedChanges(false);
        }
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
            >
                <strong>BetterGi v2.0</strong>
                <span
                    class="close-btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                >
                    ×
                </span>
            </div>

            <div class="row">
                <label>
                    状态:
                    <span class={`status-indicator ${running ? 'running' : status.includes('等待') ? 'waiting' : 'stopped'}`}></span>
                    {status}
                </label>
            </div>

            {/* 1. 匹配阈值 */}
            <div class={`row ${pendingConfig.threshold !== undefined ? 'config-changed' : ''}`}>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                    <label>匹配阈值</label>
                    <span style={{color:'var(--color-text-tertiary)'}}>{threshold.toFixed(2)}</span>
                </div>
                <input type="range" min="0.5" max="1.0" step="0.01" value={threshold} onInput={handleThresholdChange} />
            </div>

            {/* 2. 预览精度 (降采样) */}
            <div class={`row ${pendingConfig.downsample !== undefined ? 'config-changed' : ''}`}>
                <label>预览精度 (速度 vs 画质)</label>
                <select value={downsample} onChange={handleQualityChange}>
                    <option value="0.33">极速 (0.33x)</option>
                    <option value="0.5">标准 (0.5x)</option>
                    <option value="0.66">均衡 (0.66x)</option>
                    <option value="1.0">原画 (1.0x - 慢)</option>
                </select>
            </div>

            {/* 3. 多尺度搜索 */}
            <div class={`row ${pendingConfig.scales !== undefined ? 'config-changed' : ''}`}>
                <label>多尺度搜索 (大小变化)</label>
                <select value={scaleMode} onChange={handleScaleChange}>
                    <option value="OFF">关闭 (仅 1.0x)</option>
                    <option value="NORMAL">标准 (0.9 ~ 1.1)</option>
                    <option value="WIDE">宽范围 (0.8 ~ 1.2)</option>
                </select>
            </div>

            {/* 性能统计显示 */}
            {performanceStats && (
                <div class="performance-stats">
                    <div class="stat-row">
                        <span>⚡ 平均耗时:</span>
                        <span style={{
                            color: performanceStats.averageTime > 300 ? 'var(--color-danger)' :
                                   performanceStats.averageTime > 100 ? 'var(--color-warning)' : 'var(--color-success)'
                        }}>
                            {performanceStats.averageTime || 0}ms
                        </span>
                    </div>
                    <div class="stat-row">
                        <span>📊 匹配次数:</span>
                        <span>{performanceStats.matchCount || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span>💾 缓存大小:</span>
                        <span>{performanceStats.cacheSize || 0}</span>
                    </div>
                </div>
            )}

            {/* 高级设置切换 */}
            <div class="row" style={{ marginTop: '10px' }}>
                <button
                    class={`bgi-btn ${showAdvanced ? 'primary' : ''}`}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    {showAdvanced ? '▼ 隐藏高级设置' : '▶ 显示高级设置'}
                </button>
            </div>

            {/* 高级性能设置 */}
            {showAdvanced && (
                <div class="advanced-settings">
                    <div class={`checkbox-row ${pendingConfig.adaptiveScaling !== undefined ? 'config-changed' : ''}`}>
                        <input
                            type="checkbox"
                            id="chk-adaptive"
                            checked={adaptiveScaling}
                            onChange={handleAdaptiveScalingChange}
                        />
                        <label for="chk-adaptive">自适应缩放</label>
                    </div>

                    <div class={`checkbox-row ${pendingConfig.roiEnabled !== undefined ? 'config-changed' : ''}`}>
                        <input
                            type="checkbox"
                            id="chk-roi"
                            checked={roiEnabled}
                            onChange={handleRoiEnabledChange}
                        />
                        <label for="chk-roi">ROI区域匹配</label>
                    </div>

                    <div class={`checkbox-row ${pendingConfig.earlyTermination !== undefined ? 'config-changed' : ''}`}>
                        <input
                            type="checkbox"
                            id="chk-early"
                            checked={earlyTermination}
                            onChange={handleEarlyTerminationChange}
                        />
                        <label for="chk-early">早期终止优化</label>
                    </div>

                    <div class={`row ${pendingConfig.matchingMethod !== undefined ? 'config-changed' : ''}`} style={{ marginBottom: '5px' }}>
                        <label style={{ fontSize: 'var(--font-size-sm)' }}>匹配算法</label>
                        <select value={matchingMethod} onChange={handleMatchingMethodChange}>
                            <option value="TM_CCOEFF_NORMED">标准相关系数</option>
                            <option value="TM_SQDIFF_NORMED">平方差匹配</option>
                            <option value="TM_CCORR_NORMED">相关性匹配</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Debug 开关 */}
            <div class={`checkbox-row ${pendingConfig.debugMode !== undefined ? 'config-changed' : ''}`}>
                <input
                    type="checkbox"
                    id="chk-debug"
                    checked={isDebug}
                    onChange={handleDebugChange}
                />
                <label for="chk-debug">开启视觉调试 (Debug)</label>
            </div>

            <div class="row" style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                <button class="bgi-btn" onClick={onCrop}>📷 截图</button>
                <button class="bgi-btn" onClick={() => bus.emit(EVENTS.TASK_STOP)}>⏹ 停止预览</button>
            </div>

            <div class="row" style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                <button
                    class="bgi-btn info"
                    onClick={() => setShowPerformancePanel(!showPerformancePanel)}
                >
                    📊 {showPerformancePanel ? '隐藏性能监控' : '显示性能监控'}
                </button>
            </div>

            {/* 配置保存按钮 */}
            {hasUnsavedChanges && (
                <div class="row" style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                    <button
                        class="bgi-btn warning config-save-btn"
                        onClick={handleSaveConfig}
                    >
                        💾 保存配置更改 ({Object.keys(pendingConfig).length} 项)
                    </button>
                </div>
            )}

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
