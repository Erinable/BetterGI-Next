import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { bus, EVENTS } from '../../utils/event-bus';
import { logger } from '../../core/logging/logger';
import { performanceMonitor } from '../../core/performance/monitor';

interface DebugRect {
    x: number; y: number; w: number; h: number;
    score: number; label: string; ts: number;
    cost?: number;
    isRoiEdit?: boolean; // 新增: 标记是否为 ROI 编辑高亮
}

interface DebugLayerProps {
    visible?: boolean; // 控制整体可见性
}

export function DebugLayer({ visible = true }: DebugLayerProps) {
    const [rects, setRects] = useState<DebugRect[]>([]);
    const [latestInfo, setLatestInfo] = useState<{ score: number, cost: number } | null>(null);
    const [performanceStats, setPerformanceStats] = useState({
        fps: 0,
        cacheHitRate: 0,
        memoryUsage: 0,
        averageMatchTime: 0
    });

    // [修复1] 使用 useRef 存储 FPS 计算状态，避免每次渲染重置
    const fpsRef = useRef({
        frameCount: 0,
        lastUpdate: performance.now(),
        currentFps: 0
    });

    // [修复2] 使用 useRef 存储回调函数引用，确保 off 能正确匹配
    const callbacksRef = useRef<{
        onDraw: ((item: any) => void) | null;
        onClear: (() => void) | null;
    }>({ onDraw: null, onClear: null });

    // FPS 计算 - 使用 ref 持久化状态
    const calculateFPS = (): number => {
        const ref = fpsRef.current;
        ref.frameCount++;
        const now = performance.now();
        if (now - ref.lastUpdate >= 1000) {
            ref.currentFps = ref.frameCount;
            ref.frameCount = 0;
            ref.lastUpdate = now;
        }
        return ref.currentFps;
    };

    // 性能监控定时更新
    useEffect(() => {
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
            } catch (error) {
                logger.error('ui', 'Failed to update performance stats', { error });
            }
        };

        const intervalId = setInterval(updateStats, 500);
        return () => clearInterval(intervalId);
    }, []);

    // EventBus 监听
    useEffect(() => {
        // [修复2] 创建稳定的回调函数引用
        const onDraw = (item: any) => {
            const now = performance.now();
            const items = Array.isArray(item) ? item : [item];
            const newRects = items.map((r: any) => ({ ...r, ts: now }));

            if (newRects.length > 0) {
                const best = newRects.sort((a, b) => b.score - a.score)[0];
                setLatestInfo({ score: best.score, cost: best.cost || 0 });

                logger.debug('ui', 'Match result displayed', {
                    score: best.score,
                    cost: best.cost,
                    position: { x: best.x, y: best.y }
                });
            }

            setRects(prev => {
                const valid = prev.filter(r => now - r.ts < 500);
                return [...valid, ...newRects];
            });
        };

        const onClear = () => {
            setRects([]);
            setLatestInfo(null);
            logger.debug('ui', 'Debug layer cleared');
        };

        // 保存引用以便清理
        callbacksRef.current.onDraw = onDraw;
        callbacksRef.current.onClear = onClear;

        bus.on(EVENTS.DEBUG_DRAW, onDraw);
        bus.on(EVENTS.DEBUG_CLEAR, onClear);

        return () => {
            if (callbacksRef.current.onDraw) {
                bus.off(EVENTS.DEBUG_DRAW, callbacksRef.current.onDraw);
            }
            if (callbacksRef.current.onClear) {
                bus.off(EVENTS.DEBUG_CLEAR, callbacksRef.current.onClear);
            }
        };
    }, []);

    // 自动隐藏 HUD
    useEffect(() => {
        if (!latestInfo) return;
        const timer = setTimeout(() => setLatestInfo(null), 1000);
        return () => clearTimeout(timer);
    }, [latestInfo]);

    // 不可见时隐藏整个组件
    if (!visible) return null;

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 9990, overflow: 'hidden'
        }}>
            {/* 顶部 HUD 信息栏 */}
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
                </div>
            )}

            {/* 匹配框 */}
            {rects.map((r, i) => (
                <div key={i} style={{
                    position: 'absolute',
                    left: r.x, top: r.y, width: r.w, height: r.h,
                    border: `2px solid ${r.isRoiEdit ? '#00bfff' : (r.score >= 0.8 ? '#0f0' : 'orange')}`,
                    boxShadow: `0 0 8px ${r.isRoiEdit ? '#00bfff' : (r.score >= 0.8 ? '#0f0' : 'orange')}`,
                    transform: r.isRoiEdit ? 'none' : 'translate(-50%, -50%)',
                    zIndex: 9991
                }}>
                    <span style={{
                        position: 'absolute', top: -18, left: 0,
                        background: 'rgba(0,0,0,0.7)', color: 'white',
                        fontSize: '10px', padding: '1px 4px', borderRadius: '2px',
                        whiteSpace: 'nowrap'
                    }}>
                        {r.isRoiEdit ? r.label : `${(r.score * 100).toFixed(0)}%`}
                    </span>
                </div>
            ))}
        </div>
    );
}
