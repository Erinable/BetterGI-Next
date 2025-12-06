import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useDraggable } from '../hooks/useDraggable';
import { bus, EVENTS } from '../../utils/event-bus';
import { PerformancePanel } from './PerformancePanel';
import { ROIEditor } from './ROIEditor';
import { Modal } from './Modal';
import { config as configManager, ROIRegion } from '../../core/config-manager';
import { logger } from '../../core/logging/logger';
import { LogLevel } from '../../core/logging/types';

interface AppProps {
    initialPos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onClose: () => void;
    onCrop: () => void;
    onAddRoi: () => void;
    showPreview?: boolean;
    onTogglePreview?: () => void;
}

// Helper to get pending region from drag event
const ROI_PENDING_EVENT = 'roi:pending_creation';

export function App({ initialPos, onPosChange, onClose, onCrop, onAddRoi, showPreview = true, onTogglePreview }: AppProps) {
    const { pos, startDrag } = useDraggable({
        initialPos,
        onDragEnd: onPosChange,
        canDock: false
    });

    // --- State ---
    const [activeTab, setActiveTab] = useState<'general' | 'roi' | 'system'>('general');
    const [status, setStatus] = useState('等待引擎...');
    const [running, setRunning] = useState(false);

    // Config State
    const [pendingConfig, setPendingConfig] = useState<Partial<Record<string, any>>>({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Value States (from Config)
    const [threshold, setThreshold] = useState(configManager.get('threshold'));
    const [downsample, setDownsample] = useState(configManager.get('downsample'));
    const [matchingMethod, setMatchingMethod] = useState(configManager.get('matchingMethod'));
    const [adaptiveScaling, setAdaptiveScaling] = useState(configManager.get('adaptiveScaling'));
    const [earlyTermination, setEarlyTermination] = useState(configManager.get('earlyTermination'));
    const [loopInterval, setLoopInterval] = useState(configManager.get('loopInterval'));
    const [roiEnabled, setRoiEnabled] = useState(configManager.get('roiEnabled'));
    const [roiRegions, setRoiRegions] = useState<ROIRegion[]>(configManager.get('roiRegions'));

    // Modal State for ROI Creation
    const [isRoiModalOpen, setIsRoiModalOpen] = useState(false);
    const [newRoiData, setNewRoiData] = useState<{ name: string, scope: string, rect: any } | null>(null);

    // Performance Panel
    const [showPerformancePanel, setShowPerformancePanel] = useState(false);
    const [performancePanelPos, setPerformancePanelPos] = useState({ x: 100, y: 100 });

    // Log Level
    const [logLevel, setLogLevel] = useState(logger.getConfig().level);

    // Task List
    const [registeredTasks, setRegisteredTasks] = useState<string[]>([]);

    // --- Effects ---
    useEffect(() => {
        const updateStatus = (msg: string) => setStatus(msg);
        const updateEngineState = (state: { running: boolean }) => setRunning(state.running);
        const handleRoiDrawn = (rect: any) => {
            setNewRoiData({ name: 'New Region', scope: 'global', rect });
            setIsRoiModalOpen(true);
        };

        bus.on(EVENTS.STATUS_UPDATE, updateStatus);
        bus.on(EVENTS.ENGINE_STATE_CHANGE, updateEngineState);
        bus.on('roi:drawn', handleRoiDrawn);
        bus.on(EVENTS.TASK_LIST_UPDATE, (tasks: string[]) => setRegisteredTasks(tasks));

        // Query initial state
        bus.emit(EVENTS.ENGINE_QUERY_STATE);

        return () => {
            bus.off(EVENTS.STATUS_UPDATE, updateStatus);
            bus.off(EVENTS.ENGINE_STATE_CHANGE, updateEngineState);
            bus.off('roi:drawn', handleRoiDrawn);
        };
    }, []);

    // --- Handlers ---
    const toggleTask = () => {
        if (running) bus.emit(EVENTS.TASK_STOP);
        else bus.emit(EVENTS.TASK_START, '自动跳过剧情');
    };

    const handleConfigChange = (key: string, value: any) => {
        setPendingConfig(prev => ({ ...prev, [key]: value }));
        setHasUnsavedChanges(true);

        // Update local state immediately for UI responsiveness
        if (key === 'threshold') setThreshold(value);
        if (key === 'downsample') setDownsample(value);
        if (key === 'matchingMethod') setMatchingMethod(value);
        if (key === 'adaptiveScaling') setAdaptiveScaling(value);
        if (key === 'earlyTermination') setEarlyTermination(value);
        if (key === 'loopInterval') setLoopInterval(value);
        if (key === 'roiEnabled') setRoiEnabled(value);
        if (key === 'roiRegions') setRoiRegions(value);
    };

    const saveConfig = () => {
        if (Object.keys(pendingConfig).length > 0) {
            bus.emit(EVENTS.CONFIG_UPDATE, pendingConfig);
            setPendingConfig({});
            setHasUnsavedChanges(false);
        }
    };

    const confirmAddRoi = () => {
        if (newRoiData) {
            // 获取坐标转换信息: 将屏幕坐标转换为游戏坐标
            const displayInfo = window.BetterGi?.vision.getDisplayInfo();

            if (displayInfo) {
                // 屏幕坐标 → 游戏坐标
                const gameX = (newRoiData.rect.x - displayInfo.offsetX) / displayInfo.scaleX;
                const gameY = (newRoiData.rect.y - displayInfo.offsetY) / displayInfo.scaleY;
                const gameW = newRoiData.rect.w / displayInfo.scaleX;
                const gameH = newRoiData.rect.h / displayInfo.scaleY;

                configManager.addROI({
                    name: newRoiData.name,
                    x: Math.floor(gameX),
                    y: Math.floor(gameY),
                    w: Math.floor(gameW),
                    h: Math.floor(gameH),
                    scope: newRoiData.scope
                });
            } else {
                // 如果无法获取转换信息，仍然保存（兜底）
                console.warn('Unable to get display info for coordinate conversion');
                configManager.addROI({
                    name: newRoiData.name,
                    x: newRoiData.rect.x,
                    y: newRoiData.rect.y,
                    w: newRoiData.rect.w,
                    h: newRoiData.rect.h,
                    scope: newRoiData.scope
                });
            }

            // Refresh local list
            setRoiRegions(configManager.get('roiRegions'));
            setNewRoiData(null);
            setIsRoiModalOpen(false);
        }
    };

    return (
        <>
            <div class="bgi-panel" style={{ top: pos.y, left: pos.x, position: 'fixed', pointerEvents: 'auto' }}>
                {/* Header */}
                <div class="header" onMouseDown={startDrag}>
                    <strong>BetterGi Next</strong>
                    <div class="close-btn" onClick={onClose} onMouseDown={e => e.stopPropagation()}>×</div>
                </div>

                {/* Status Bar */}
                <div class="row glass-surface" style={{ padding: '8px', display: 'flex', alignItems: 'center' }}>
                    <span class={`status-indicator ${running ? 'running' : status.includes('等待') ? 'waiting' : 'stopped'}`}></span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{status}</span>
                </div>

                {/* Tabs */}
                <div class="segmented-control">
                    <button class={activeTab === 'general' ? 'active' : ''} onClick={() => setActiveTab('general')}>通用</button>
                    <button class={activeTab === 'roi' ? 'active' : ''} onClick={() => setActiveTab('roi')}>ROI 区域</button>
                    <button class={activeTab === 'system' ? 'active' : ''} onClick={() => setActiveTab('system')}>系统</button>
                </div>

                {/* Content Area */}
                <div style={{ minHeight: '150px' }}>

                    {/* --- GENERAL TAB --- */}
                    {activeTab === 'general' && (
                        <div class="fade-in">
                            <div class={`row ${pendingConfig.threshold !== undefined ? 'config-changed' : ''}`}>
                                <div class="flex-between">
                                    <label>匹配阈值</label>
                                    <span style={{ fontSize: '11px', color: 'var(--color-primary-light)' }}>{Number(threshold).toFixed(2)}</span>
                                </div>
                                <input type="range" min="0.5" max="1.0" step="0.01" value={threshold} onInput={(e: any) => handleConfigChange('threshold', parseFloat(e.target.value))} />
                            </div>

                            <div class={`row ${pendingConfig.downsample !== undefined ? 'config-changed' : ''}`}>
                                <label>预览精度</label>
                                <select value={downsample} onChange={(e: any) => handleConfigChange('downsample', parseFloat(e.target.value))}>
                                    <option value="0.33">极速 (0.33x)</option>
                                    <option value="0.5">标准 (0.5x)</option>
                                    <option value="0.66">均衡 (0.66x)</option>
                                    <option value="1.0">原画 (1.0x)</option>
                                </select>
                            </div>

                            <div class={`row ${pendingConfig.matchingMethod !== undefined ? 'config-changed' : ''}`}>
                                <label>匹配算法</label>
                                <select value={matchingMethod} onChange={(e: any) => handleConfigChange('matchingMethod', e.target.value)}>
                                    <option value="TM_CCOEFF_NORMED">相关系数 (推荐)</option>
                                    <option value="TM_SQDIFF_NORMED">平方差</option>
                                    <option value="TM_CCORR_NORMED">相关性</option>
                                </select>
                            </div>

                            <div class="row" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="adaptive-scaling"
                                        checked={adaptiveScaling}
                                        onChange={(e: any) => handleConfigChange('adaptiveScaling', e.target.checked)}
                                    />
                                    <label for="adaptive-scaling" style={{ margin: 0, cursor: 'pointer' }}>自适应缩放 (Multiscale)</label>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="early-termination"
                                        checked={earlyTermination}
                                        onChange={(e: any) => handleConfigChange('earlyTermination', e.target.checked)}
                                    />
                                    <label for="early-termination" style={{ margin: 0, cursor: 'pointer' }}>提前终止 (性能优化)</label>
                                </div>
                            </div>

                            <div class="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <button class="bgi-btn secondary" onClick={onCrop}>📷 截图</button>
                                <button class={`bgi-btn ${showPreview ? 'secondary' : 'warning'}`} onClick={onTogglePreview}>
                                    {showPreview ? '👁 隐藏预览' : '🕶 显示预览'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- ROI TAB --- */}
                    {activeTab === 'roi' && (
                        <div class="fade-in">
                            <div class={`row ${pendingConfig.roiEnabled !== undefined ? 'config-changed' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    id="roi-toggle"
                                    checked={roiEnabled}
                                    onChange={(e: any) => handleConfigChange('roiEnabled', e.target.checked)}
                                />
                                <label for="roi-toggle" style={{ marginBottom: 0, cursor: 'pointer' }}>启用区域匹配 (性能↑)</label>
                            </div>

                            {roiEnabled && (
                                <ROIEditor
                                    regions={roiRegions}
                                    onChange={(list: ROIRegion[]) => handleConfigChange('roiRegions', list)}
                                    onAdd={onAddRoi}
                                />
                            )}
                        </div>
                    )}

                    {/* --- SYSTEM TAB --- */}
                    {activeTab === 'system' && (
                        <div class="fade-in">
                            <button class="bgi-btn secondary" onClick={() => setShowPerformancePanel(!showPerformancePanel)}>
                                📊 {showPerformancePanel ? '关闭' : '打开'} 性能监控
                            </button>

                            <div style={{ marginTop: '12px' }}>
                                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>配置管理</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <button class="bgi-btn secondary" style={{ fontSize: '11px', padding: '6px' }} onClick={() => {
                                        const configStr = configManager.export();
                                        const blob = new Blob([configStr], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `bettergi-config-${new Date().toISOString().slice(0, 10)}.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}>
                                        📥 导出配置
                                    </button>
                                    <button class="bgi-btn secondary" style={{ fontSize: '11px', padding: '6px' }} onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.json';
                                        input.onchange = (e: any) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (re: any) => {
                                                    const success = configManager.import(re.target.result);
                                                    if (success) {
                                                        // Refresh all states from config
                                                        setThreshold(configManager.get('threshold'));
                                                        setDownsample(configManager.get('downsample'));
                                                        setMatchingMethod(configManager.get('matchingMethod'));
                                                        setAdaptiveScaling(configManager.get('adaptiveScaling'));
                                                        setEarlyTermination(configManager.get('earlyTermination'));
                                                        setRoiEnabled(configManager.get('roiEnabled'));
                                                        setRoiRegions(configManager.get('roiRegions'));
                                                        alert('✅ 配置导入成功！');
                                                    } else {
                                                        alert('❌ 配置导入失败，请检查文件格式');
                                                    }
                                                };
                                                reader.readAsText(file);
                                            }
                                        };
                                        input.click();
                                    }}>
                                        📤 导入配置
                                    </button>
                                </div>
                                <button class="bgi-btn danger" style={{ marginTop: '8px', fontSize: '11px', padding: '6px' }} onClick={() => {
                                    if (confirm('确定要重置所有配置为默认值吗？此操作不可撤销。')) {
                                        configManager.reset();
                                        // Refresh all states
                                        setThreshold(configManager.get('threshold'));
                                        setDownsample(configManager.get('downsample'));
                                        setMatchingMethod(configManager.get('matchingMethod'));
                                        setAdaptiveScaling(configManager.get('adaptiveScaling'));
                                        setEarlyTermination(configManager.get('earlyTermination'));
                                        setRoiEnabled(configManager.get('roiEnabled'));
                                        setRoiRegions(configManager.get('roiRegions'));
                                        setPendingConfig({});
                                        setHasUnsavedChanges(false);
                                        alert('✅ 配置已重置为默认值');
                                    }
                                }}>
                                    🔄 重置配置
                                </button>
                            </div>

                            <div style={{ marginTop: '12px' }}>
                                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>高级设置</label>
                                <div class={`row ${pendingConfig.loopInterval !== undefined ? 'config-changed' : ''}`}>
                                    <div class="flex-between">
                                        <label>任务循环间隔</label>
                                        <span style={{ fontSize: '11px', color: 'var(--color-primary-light)' }}>{loopInterval}ms</span>
                                    </div>
                                    <input type="range" min="50" max="2000" step="50" value={loopInterval} onInput={(e: any) => handleConfigChange('loopInterval', parseInt(e.target.value))} />
                                </div>
                                <button class="bgi-btn secondary" style={{ marginTop: '8px', fontSize: '11px', padding: '6px' }} onClick={() => {
                                    const diagInfo = {
                                        version: '2.1.0',
                                        buildDate: new Date().toISOString().slice(0, 10),
                                        userAgent: navigator.userAgent,
                                        screenSize: `${window.innerWidth}x${window.innerHeight}`,
                                        videoInfo: window.BetterGi?.vision.getDisplayInfo(),
                                        config: configManager.getAll(),
                                        performance: window.BetterGi?.engine?.vision?.getPerformanceMetrics?.() || 'N/A'
                                    };
                                    const diagStr = JSON.stringify(diagInfo, null, 2);
                                    navigator.clipboard?.writeText(diagStr).then(() => {
                                        alert('📋 诊断信息已复制到剪贴板');
                                    }).catch(() => {
                                        console.log('Diagnostic Info:', diagStr);
                                        alert('诊断信息已输出到控制台 (F12)');
                                    });
                                }}>
                                    🔍 复制诊断信息
                                </button>
                            </div>

                            <div style={{ marginTop: '12px' }}>
                                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>日志级别</label>
                                <select
                                    value={logLevel}
                                    onChange={(e: any) => {
                                        const level = parseInt(e.target.value);
                                        setLogLevel(level);
                                        logger.updateConfig({ level });
                                    }}
                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                >
                                    <option value={0}>Debug (全部)</option>
                                    <option value={1}>Info (信息+)</option>
                                    <option value={2}>Warn (警告+)</option>
                                    <option value={3}>Error (仅错误)</option>
                                </select>
                            </div>

                            {registeredTasks.length > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                    <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>已注册任务 ({registeredTasks.length})</label>
                                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px', maxHeight: '80px', overflowY: 'auto' }}>
                                        {registeredTasks.map((taskName, i) => (
                                            <div key={i} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '4px 0',
                                                borderBottom: i < registeredTasks.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                                            }}>
                                                <span style={{ fontSize: '11px', color: 'var(--color-text-primary)' }}>{taskName}</span>
                                                <button
                                                    class="bgi-btn primary"
                                                    style={{ fontSize: '9px', padding: '2px 8px', marginTop: 0 }}
                                                    onClick={() => bus.emit(EVENTS.TASK_START, taskName)}
                                                >
                                                    启动
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-glass)', paddingTop: '12px' }}>
                                <div>Version: 2.1.0 (Premium)</div>
                                <div style={{ marginTop: '4px', opacity: 0.7 }}>Build: {new Date().toISOString().slice(0, 10)}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border-glass)', paddingTop: '12px' }}>
                    {hasUnsavedChanges && (
                        <button class="bgi-btn warning" onClick={saveConfig} style={{ marginBottom: '8px' }}>
                            💾 保存配置 ({Object.keys(pendingConfig).length})
                        </button>
                    )}

                    <button class={`bgi-btn ${running ? 'danger' : 'primary'}`} onClick={toggleTask}>
                        {running ? '⏹ 停止任务' : '▶ 启动任务'}
                    </button>
                </div>
            </div>

            {/* ROI Name Modal */}
            <Modal
                title="创建新 ROI 区域"
                isOpen={isRoiModalOpen}
                onClose={() => setIsRoiModalOpen(false)}
                footer={
                    <>
                        <button class="bgi-btn secondary" onClick={() => setIsRoiModalOpen(false)}>取消</button>
                        <button class="bgi-btn primary" onClick={confirmAddRoi}>确认创建</button>
                    </>
                }
            >
                <div>
                    <div class="row">
                        <label>区域名称</label>
                        <input
                            type="text"
                            placeholder="例如: 小地图, HP条"
                            value={newRoiData?.name || ''}
                            onInput={(e: any) => setNewRoiData(prev => prev ? { ...prev, name: e.target.value } : null)}
                            autoFocus
                        />
                    </div>
                    <div class="row">
                        <label>作用域</label>
                        <select
                            value={newRoiData?.scope || 'global'}
                            onChange={(e: any) => setNewRoiData(prev => prev ? { ...prev, scope: e.target.value } : null)}
                        >
                            <option value="global">全局 (Global)</option>
                            <option value="Preview">仅预览 (Preview)</option>
                        </select>
                    </div>
                    {newRoiData?.rect && (
                        <div style={{ padding: '8px', background: 'var(--color-bg-surface)', borderRadius: '4px', fontSize: '11px' }}>
                            Detected: {Math.round(newRoiData.rect.w)} x {Math.round(newRoiData.rect.h)} at ({Math.round(newRoiData.rect.x)}, {Math.round(newRoiData.rect.y)})
                        </div>
                    )}
                </div>
            </Modal>

            {/* Performance Panel */}
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
