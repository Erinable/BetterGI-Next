// src/ui/components/AssetItem.tsx
// 单个任务资产编辑项组件

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { TaskAsset } from '../../core/config-manager';
import { bus, EVENTS } from '../../utils/event-bus';

interface AssetItemProps {
    asset: TaskAsset;
    taskName: string;           // 新增: 任务名称
    onUpdate: (updates: Partial<TaskAsset>) => void;
    onDelete: () => void;
    onCaptureBase64: () => void;
    onCaptureROI: () => void;
}

export function AssetItem({ asset, taskName, onUpdate, onDelete, onCaptureBase64, onCaptureROI }: AssetItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showBase64, setShowBase64] = useState(false);
    const [isDebugging, setIsDebugging] = useState(false);

    const hasBase64 = asset.base64 && asset.base64.length > 50;
    const hasROI = asset.roi && asset.roi.w > 0 && asset.roi.h > 0;

    // 调试预览: 使用当前资产进行匹配测试
    const handleDebugPreview = async () => {
        if (!hasBase64) {
            alert('请先设置模板图片');
            return;
        }

        setIsDebugging(true);
        bus.emit(EVENTS.STATUS_UPDATE, `测试匹配: ${asset.name}...`);

        // 发送调试请求给 engine
        bus.emit('asset:debug-match', {
            taskName,
            assetName: asset.name,
            base64: asset.base64,
            roi: asset.roi,
            threshold: asset.threshold
        });

        // 3秒后重置状态
        setTimeout(() => setIsDebugging(false), 3000);
    };

    return (
        <div class="glass-surface" style={{
            padding: '8px 10px',
            marginBottom: '6px',
            borderLeft: `3px solid ${hasBase64 ? 'var(--color-success)' : 'var(--color-warning)'}`
        }}>
            {/* 标题行 */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        fontSize: '10px',
                        color: 'var(--color-text-tertiary)',
                        transition: 'transform 0.2s',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        display: 'inline-block'
                    }}>▶</span>
                    <span style={{ fontWeight: 500, fontSize: '12px' }}>{asset.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {hasBase64 && <span style={{ fontSize: '9px', color: 'var(--color-success)' }}>✓ 图片</span>}
                    {hasROI && <span style={{ fontSize: '9px', color: 'var(--color-info)' }}>✓ ROI</span>}
                </div>
            </div>

            {/* 展开的编辑面板 */}
            {isExpanded && (
                <div style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--color-border-glass)'
                }}>
                    {/* 资产名称 */}
                    <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>资产名称</label>
                        <input
                            type="text"
                            value={asset.name}
                            onInput={(e) => onUpdate({ name: (e.target as HTMLInputElement).value })}
                            style={{ padding: '4px 8px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Base64 预览/编辑 */}
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px' }}>模板图片</label>
                            <button
                                class="bgi-btn primary"
                                style={{ fontSize: '9px', padding: '2px 8px', marginTop: 0 }}
                                onClick={(e) => { e.stopPropagation(); onCaptureBase64(); }}
                            >
                                📸 截图
                            </button>
                        </div>
                        {hasBase64 ? (
                            <div style={{
                                background: 'var(--color-bg-input)',
                                borderRadius: '4px',
                                padding: '8px',
                                textAlign: 'center'
                            }}>
                                <img
                                    src={asset.base64}
                                    alt={asset.name}
                                    style={{ maxWidth: '100%', maxHeight: '60px', borderRadius: '4px' }}
                                />
                                <div style={{ marginTop: '4px' }}>
                                    <button
                                        style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                        onClick={() => setShowBase64(!showBase64)}
                                    >
                                        {showBase64 ? '隐藏 Base64' : '显示 Base64'}
                                    </button>
                                </div>
                                {showBase64 && (
                                    <textarea
                                        value={asset.base64}
                                        onInput={(e) => onUpdate({ base64: (e.target as HTMLTextAreaElement).value })}
                                        style={{
                                            width: '100%',
                                            height: '60px',
                                            fontSize: '9px',
                                            marginTop: '4px',
                                            fontFamily: 'monospace',
                                            resize: 'vertical'
                                        }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div style={{
                                background: 'var(--color-bg-input)',
                                borderRadius: '4px',
                                padding: '12px',
                                textAlign: 'center',
                                color: 'var(--color-text-tertiary)',
                                fontSize: '11px'
                            }}>
                                未设置模板图片
                            </div>
                        )}
                    </div>

                    {/* ROI 编辑 */}
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px' }}>ROI 区域 (可选)</label>
                            <button
                                class="bgi-btn secondary"
                                style={{ fontSize: '9px', padding: '2px 8px', marginTop: 0 }}
                                onClick={(e) => { e.stopPropagation(); onCaptureROI(); }}
                            >
                                📍 框选
                            </button>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr 1fr',
                            gap: '4px'
                        }}>
                            {['x', 'y', 'w', 'h'].map(key => (
                                <div key={key}>
                                    <label style={{ fontSize: '8px', color: 'var(--color-text-tertiary)' }}>{key.toUpperCase()}</label>
                                    <input
                                        type="number"
                                        value={asset.roi?.[key as keyof typeof asset.roi] || 0}
                                        onInput={(e) => {
                                            const value = parseInt((e.target as HTMLInputElement).value) || 0;
                                            onUpdate({
                                                roi: {
                                                    x: asset.roi?.x || 0,
                                                    y: asset.roi?.y || 0,
                                                    w: asset.roi?.w || 0,
                                                    h: asset.roi?.h || 0,
                                                    [key]: value
                                                }
                                            });
                                        }}
                                        style={{ width: '100%', padding: '4px', fontSize: '10px', textAlign: 'center' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 阈值 */}
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>匹配阈值 (可选覆盖)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            placeholder="使用全局阈值"
                            value={asset.threshold || ''}
                            onInput={(e) => {
                                const value = parseFloat((e.target as HTMLInputElement).value);
                                onUpdate({ threshold: isNaN(value) ? undefined : value });
                            }}
                            style={{ padding: '4px 8px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                            class={`bgi-btn ${isDebugging ? 'warning' : 'secondary'}`}
                            style={{ flex: 1, padding: '5px', fontSize: '11px', marginTop: 0, minWidth: '80px' }}
                            onClick={(e) => { e.stopPropagation(); handleDebugPreview(); }}
                            disabled={isDebugging}
                        >
                            {isDebugging ? '🔄 匹配中...' : '🔍 调试预览'}
                        </button>
                        <button
                            class="bgi-btn danger"
                            style={{ padding: '5px', fontSize: '11px', marginTop: 0 }}
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        >
                            删除
                        </button>
                        <button
                            class="bgi-btn primary"
                            style={{ padding: '5px', fontSize: '11px', marginTop: 0 }}
                            onClick={() => setIsExpanded(false)}
                        >
                            完成
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
