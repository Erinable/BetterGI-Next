import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { bus, EVENTS } from '../../utils/event-bus';
import { logger } from '../../core/logging/logger';
import { performanceMonitor } from '../../core/performance/monitor';

interface DebugRect {
    x: number; y: number; w: number; h: number;
    score: number; label: string; ts: number;
    cost?: number; // 新增耗时字段
}

export function DebugLayer() {
    const [rects, setRects] = useState<DebugRect[]>([]);
    const [latestInfo, setLatestInfo] = useState<{ score: number, cost: number } | null>(null);
    const [performanceStats, setPerformanceStats] = useState({
        fps: 0,
        cacheHitRate: 0,
        memoryUsage: 0,
        averageMatchTime: 0
    });

    // 初始化性能监控
    useEffect(() => {
        const initializeMonitoring = () => {
            try {
                // 开始性能监控
                const endMeasurement = performanceMonitor.startMeasurement('debug_layer_render', 'ui');

                // 更新性能统计
                const updateStats = () => {
                    try {
                        const metrics = performanceMonitor.getMetrics();
                        const recentStats = performanceMonitor.getRecentStats(1);

                        setPerformanceStats({
                            fps: calculateFPS(),
                            cacheHitRate: metrics.cacheHitRate,
                            memoryUsage: metrics.memoryUsage,
                            averageMatchTime: recentStats.averageMatchTime || 0
                        });

                        endMeasurement();
                    } catch (error) {
                        logger.error('ui', 'Failed to update performance stats', { error });
                    }
                };

                const interval = setInterval(updateStats, 500); // 每500ms更新一次
                return () => clearInterval(interval);
            } catch (error) {
                logger.error('ui', 'Failed to initialize debug layer monitoring', { error });
            }
        };

        const cleanup = initializeMonitoring();

        return () => {
            if (cleanup) cleanup();
        };
    }, []);

    // FPS计算
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    const calculateFPS = (): number => {
        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
            const fps = frameCount;
            frameCount = 0;
            lastFpsUpdate = now;
            return fps;
        }
        return performanceStats.fps;
    };

    useEffect(() => {
        const onDraw = (item: any) => {
            const now = performance.now();
            const items = Array.isArray(item) ? item : [item];
            const newRects = items.map((r: any) => ({ ...r, ts: now }));

            // 记录匹配性能
            if (newRects.length > 0) {
                const best = newRects.sort((a, b) => b.score - a.score)[0];

                // 记录匹配数据到性能监控系统
                performanceMonitor.recordMatch({
                    duration: best.cost || 0,
                    score: best.score,
                    scale: 1.0,
                    useROI: false,
                    templateSize: { width: best.w, height: best.h },
                    usedAdaptiveScaling: false,
                    operation: 'debug_draw',
                    category: 'ui'
                });

                setLatestInfo({ score: best.score, cost: best.cost || 0 });

                logger.debug('ui', 'Match result displayed', {
                    score: best.score,
                    cost: best.cost,
                    position: { x: best.x, y: best.y },
                    size: { width: best.w, height: best.h }
                });
            }

            // 更新显示框
            setRects(prev => {
                const valid = prev.filter(r => now - r.ts < 500); // 0.5秒后消失
                return [...valid, ...newRects];
            });
        };

        const onClear = () => {
            setRects([]);
            setLatestInfo(null);
            logger.debug('ui', 'Debug layer cleared');
        };

        bus.on(EVENTS.DEBUG_DRAW, onDraw);
        bus.on(EVENTS.DEBUG_CLEAR, onClear);

        return () => {
            bus.off(EVENTS.DEBUG_DRAW, onDraw);
            bus.off(EVENTS.DEBUG_CLEAR, onClear);
        };
    }, []);

    // 自动隐藏 HUD (如果没有新数据)
    useEffect(() => {
        if (!latestInfo) return;
        const timer = setTimeout(() => setLatestInfo(null), 1000);
        return () => clearTimeout(timer);
    }, [latestInfo]);

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 9990, overflow: 'hidden'
        }}>
            {/* 增强的顶部 HUD 信息栏 */}
            {latestInfo && (
                <div style={{
                    position: 'absolute',
                    top: '10%', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.8)',
                    color: '#0f0',
                    padding: '12px 20px',
                    borderRadius: '25px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
                    border: '1px solid rgba(0,255,0,0.3)',
                    display: 'flex', gap: '20px', alignItems: 'center',
                    zIndex: 9992,
                    backdropFilter: 'blur(5px)'
                }}>
                    <span>🎯 相似度: {(latestInfo.score * 100).toFixed(1)}%</span>
                    <span>⚡ 耗时: {latestInfo.cost.toFixed(0)}ms</span>
                    <span style={{ color: performanceStats.cacheHitRate > 60 ? '#0f0' : '#ffaa00' }}>
                        💾 命中率: {performanceStats.cacheHitRate.toFixed(1)}%
                    </span>
                    <span style={{ color: performanceStats.fps > 30 ? '#0f0' : '#ff6600' }}>
                        📊 FPS: {performanceStats.fps}
                    </span>
                    <span style={{
                        color: performanceStats.memoryUsage > 100 * 1024 * 1024 ? '#ff6600' : '#0f0',
                        fontSize: '11px'
                    }}>
                        🧠 内存: {(performanceStats.memoryUsage / 1024 / 1024).toFixed(1)}MB
                    </span>
                </div>
            )}

            {/* 性能监控指示器 */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                color: performanceStats.averageMatchTime < 200 ? '#0f0' : '#ffaa00',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '11px',
                fontWeight: 'bold',
                zIndex: 9992,
                border: `1px solid ${performanceStats.averageMatchTime < 200 ? '#0f0' : '#ffaa00'}`
            }}>
                平均耗时: {performanceStats.averageMatchTime.toFixed(1)}ms
            </div>

            {/* 匹配框 */}
            {rects.map((r, i) => (
                <div key={i} style={{
                    position: 'absolute',
                    left: r.x, top: r.y, width: r.w, height: r.h,
                    border: `2px solid ${r.score >= 0.8 ? '#0f0' : 'orange'}`,
                    boxShadow: `0 0 8px ${r.score >= 0.8 ? '#0f0' : 'orange'}`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9991
                }}>
                    {/* 框上的标签 (可选，保留以便定位) */}
                    <span style={{
                        position: 'absolute', top: -18, left: 0,
                        background: 'rgba(0,0,0,0.7)', color: 'white',
                        fontSize: '10px', padding: '1px 4px', borderRadius: '2px',
                        whiteSpace: 'nowrap'
                    }}>
                        {(r.score * 100).toFixed(0)}%
                    </span>
                </div>
            ))}
        </div>
    );
}
