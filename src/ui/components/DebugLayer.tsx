import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { bus, EVENTS } from '../../utils/event-bus';

interface DebugRect {
    x: number; y: number; w: number; h: number;
    score: number; label: string; ts: number;
    cost?: number; // 新增耗时字段
}

export function DebugLayer() {
    const [rects, setRects] = useState<DebugRect[]>([]);

    // [新增] 用于显示在顶部的最新匹配信息
    const [latestInfo, setLatestInfo] = useState<{ score: number, cost: number } | null>(null);

    useEffect(() => {
        const onDraw = (item: any) => {
            const now = performance.now();
            const items = Array.isArray(item) ? item : [item];
            const newRects = items.map((r: any) => ({ ...r, ts: now }));

            // 更新框
            setRects(prev => {
                const valid = prev.filter(r => now - r.ts < 500); // 0.5秒后消失
                return [...valid, ...newRects];
            });

            // [新增] 更新顶部 HUD 信息 (取得分最高的一个)
            if (newRects.length > 0) {
                const best = newRects.sort((a, b) => b.score - a.score)[0];
                setLatestInfo({ score: best.score, cost: best.cost || 0 });
            }
        };
        // [新增] 监听清除事件
        const onClear = () => {
            setRects([]);
            setLatestInfo(null);
        };
        bus.on(EVENTS.DEBUG_DRAW, onDraw);
        bus.on(EVENTS.DEBUG_CLEAR, onClear); // [绑定]
        return () => {};
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
            {/* [新增] 顶部 HUD 信息栏 */}
            {latestInfo && (
                <div style={{
                    position: 'absolute',
                    top: '10%', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: '#0f0',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(0,255,0,0.3)',
                    display: 'flex', gap: '15px',
                    zIndex: 9992
                }}>
                    <span>🎯 相似度: {(latestInfo.score * 100).toFixed(1)}%</span>
                    <span>⚡ 耗时: {latestInfo.cost.toFixed(0)}ms</span>
                </div>
            )}

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
