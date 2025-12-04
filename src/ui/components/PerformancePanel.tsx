import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useDraggable } from '../hooks/useDraggable';
import { bus, EVENTS } from '../../utils/event-bus';
import { performanceMonitor } from '../../core/performance/monitor';
import { logger } from '../../core/logging/logger';
import { storageManager } from '../../core/storage/manager';

interface PerformancePanelProps {
    initialPos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onClose: () => void;
}

export function PerformancePanel({ initialPos, onPosChange, onClose }: PerformancePanelProps) {
    const { pos, startDrag } = useDraggable({
        initialPos,
        onDragEnd: onPosChange,
        canDock: false
    });

    const [isVisible, setIsVisible] = useState(true);
    const [stats, setStats] = useState<any>({
        overall: {
            matchCount: 0,
            averageMatchTime: 0,
            bestMatchTime: Infinity,
            worstMatchTime: 0,
            cacheHitRate: 0,
            roiMatches: 0,
            fullScreenMatches: 0
        },
        recent: {
            averageTime: 0,
            count: 0
        },
        recommendations: []
    });

    // 初始化性能监控
    useEffect(() => {
        const initializeMonitoring = async () => {
            try {
                await storageManager.initialize();
                await updatePerformanceData();
            } catch (error) {
                logger.error('ui', 'Failed to initialize performance panel', { error });
            }
        };

        initializeMonitoring();
    }, []);

    useEffect(() => {
        // 定期请求性能统计
        const interval = setInterval(() => {
            if (isVisible) {
                updatePerformanceData();
                bus.emit(EVENTS.PERFORMANCE_METRICS_UPDATE);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [isVisible]);

    // 更新性能数据
    const updatePerformanceData = async () => {
        try {
            const currentMetrics = performanceMonitor.getMetrics();
            const currentRecommendations = performanceMonitor.generateRecommendations();
            const recentStats = performanceMonitor.getRecentStats(5);

            setStats({
                overall: {
                    matchCount: currentMetrics.matchCount,
                    averageMatchTime: currentMetrics.averageMatchTime,
                    bestMatchTime: currentMetrics.bestMatchTime,
                    worstMatchTime: currentMetrics.worstMatchTime,
                    cacheHitRate: currentMetrics.cacheHitRate,
                    roiMatches: currentMetrics.roiMatches,
                    fullScreenMatches: currentMetrics.fullScreenMatches
                },
                recent: {
                    averageTime: recentStats.averageMatchTime,
                    count: recentStats.matchCount
                },
                recommendations: currentRecommendations.map((rec: any) => rec.title)
            });
        } catch (error) {
            logger.error('ui', 'Failed to update performance data', { error });
        }
    };

    const formatTime = (time: number) => {
        if (time === Infinity) return 'N/A';
        return `${Math.round(time * 100) / 100}ms`;
    };

    const formatPercentage = (value: number) => {
        return `${Math.round(value * 100) / 100}%`;
    };

    if (!isVisible) {
        return (
            <div
                style={{
                    position: 'fixed',
                    top: pos.y,
                    left: pos.x,
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    padding: '8px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '10px',
                    color: '#aaa',
                    zIndex: 10000
                }}
                onClick={() => setIsVisible(true)}
                onMouseDown={startDrag}
            >
                📊 性能
            </div>
        );
    }

    return (
        <div
            class="bgi-panel"
            style={{
                top: pos.y,
                left: pos.x,
                position: 'fixed',
                pointerEvents: 'auto',
                width: '280px',
                fontSize: '11px',
                zIndex: 10000
            }}
        >
            <div
                class="row header"
                onMouseDown={startDrag}
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
                <strong>📊 性能监控</strong>
                <div>
                    <span
                        onClick={() => setIsVisible(false)}
                        style={{ cursor: 'pointer', padding: '0 5px', fontSize: '12px', marginRight: '5px' }}
                    >
                        −
                    </span>
                    <span onMouseDown={(e) => e.stopPropagation()} onClick={onClose} style={{ cursor: 'pointer', padding: '0 5px', fontSize: '12px' }}>×</span>
                </div>
            </div>

            {/* 整体性能统计 */}
            <div style={{ marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#4CAF50' }}>📈 整体统计</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '10px' }}>
                    <div style={{ background: '#222', padding: '4px', borderRadius: '3px' }}>
                        <div style={{ color: '#888' }}>匹配次数</div>
                        <div style={{ fontWeight: 'bold' }}>{stats.overall.matchCount}</div>
                    </div>

                    <div style={{ background: '#222', padding: '4px', borderRadius: '3px' }}>
                        <div style={{ color: '#888' }}>平均耗时</div>
                        <div style={{ fontWeight: 'bold', color: stats.overall.averageMatchTime > 500 ? '#f44336' : '#4CAF50' }}>
                            {formatTime(stats.overall.averageMatchTime)}
                        </div>
                    </div>

                    <div style={{ background: '#222', padding: '4px', borderRadius: '3px' }}>
                        <div style={{ color: '#888' }}>最佳耗时</div>
                        <div style={{ fontWeight: 'bold', color: '#2196F3' }}>{formatTime(stats.overall.bestMatchTime)}</div>
                    </div>

                    <div style={{ background: '#222', padding: '4px', borderRadius: '3px' }}>
                        <div style={{ color: '#888' }}>最差耗时</div>
                        <div style={{ fontWeight: 'bold', color: '#ff9800' }}>{formatTime(stats.overall.worstMatchTime)}</div>
                    </div>
                </div>
            </div>

            {/* 缓存和匹配策略统计 */}
            <div style={{ marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#2196F3' }}>💾 缓存与策略</div>

                <div style={{ background: '#222', padding: '6px', borderRadius: '3px', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>缓存命中率:</span>
                        <span style={{ color: stats.overall.cacheHitRate > 50 ? '#4CAF50' : '#ff9800' }}>
                            {formatPercentage(stats.overall.cacheHitRate)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>ROI匹配:</span>
                        <span>{stats.overall.roiMatches}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>全屏匹配:</span>
                        <span>{stats.overall.fullScreenMatches}</span>
                    </div>
                </div>
            </div>

            {/* 最近性能 */}
            <div style={{ marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#ff9800' }}>⚡ 最近性能</div>

                <div style={{ background: '#222', padding: '6px', borderRadius: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>最近平均:</span>
                        <span style={{ color: stats.recent.averageTime > 300 ? '#f44336' : '#4CAF50' }}>
                            {formatTime(stats.recent.averageTime)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>样本数量:</span>
                        <span>{stats.recent.count}</span>
                    </div>
                </div>
            </div>

            {/* 性能建议 */}
            {stats.recommendations.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#9C27B0' }}>💡 性能建议</div>

                    <div style={{ background: '#2a1a2a', padding: '6px', borderRadius: '3px', fontSize: '10px' }}>
                        {stats.recommendations.map((rec: string, index: number) => (
                            <div key={index} style={{ marginBottom: '3px', color: '#e91e63' }}>
                                • {rec}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 控制按钮 */}
            <div style={{ display: 'flex', gap: '5px' }}>
                <button
                    style={{
                        flex: 1,
                        background: '#f44336',
                        border: 'none',
                        color: 'white',
                        padding: '6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px'
                    }}
                    onClick={async () => {
                        try {
                            performanceMonitor.reset();
                            await updatePerformanceData();
                            bus.emit('performance:reset_metrics');
                            logger.info('ui', 'Performance statistics reset');
                        } catch (error) {
                            logger.error('ui', 'Failed to reset performance statistics', { error });
                        }
                    }}
                >
                    🔄 重置统计
                </button>

                <button
                    style={{
                        flex: 1,
                        background: '#2196F3',
                        border: 'none',
                        color: 'white',
                        padding: '6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px'
                    }}
                    onClick={async () => {
                        try {
                            bus.emit('performance:clear_cache');
                            await updatePerformanceData();
                            logger.info('ui', 'Cache cleared');
                        } catch (error) {
                            logger.error('ui', 'Failed to clear cache', { error });
                        }
                    }}
                >
                    🗑️ 清理缓存
                </button>
            </div>
        </div>
    );
}