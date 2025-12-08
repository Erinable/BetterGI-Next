import { h } from 'preact';
import { useState } from 'preact/hooks';
import { ROIRegion } from '../../core/config-manager';
import { bus, EVENTS } from '../../utils/event-bus';

// 获取真实的页面 window (用于访问暴露的 BetterGi 对象)
const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
const getVision = () => (realWindow as any).BetterGi?.vision;

interface ROIEditorProps {
    regions: ROIRegion[];
    onChange: (regions: ROIRegion[]) => void;
    onAdd: () => void;
}

export function ROIEditor({ regions, onChange, onAdd }: ROIEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);

    const updateRegion = (id: string, updates: Partial<ROIRegion>) => {
        const newRegions = regions.map(r =>
            r.id === id ? { ...r, ...updates } : r
        );
        onChange(newRegions);

        const updated = newRegions.find(r => r.id === id);
        if (updated) {
            // 游戏坐标 → 屏幕坐标
            const displayInfo = getVision()?.getDisplayInfo();
            if (displayInfo) {
                const screenX = displayInfo.offsetX + (updated.x * displayInfo.scaleX);
                const screenY = displayInfo.offsetY + (updated.y * displayInfo.scaleY);
                const screenW = updated.w * displayInfo.scaleX;
                const screenH = updated.h * displayInfo.scaleY;

                bus.emit(EVENTS.DEBUG_DRAW, {
                    x: screenX, y: screenY, w: screenW, h: screenH,
                    score: 1, label: 'ROI: ' + updated.name,
                    isRoiEdit: true
                });
            } else {
                bus.emit(EVENTS.DEBUG_DRAW, {
                    x: updated.x, y: updated.y, w: updated.w, h: updated.h,
                    score: 1, label: 'ROI: ' + updated.name,
                    isRoiEdit: true
                });
            }
        }
    };

    const removeRegion = (id: string) => {
        onChange(regions.filter(r => r.id !== id));
        // 清除预览高亮
        bus.emit(EVENTS.DEBUG_CLEAR);
    };

    const toggleEdit = (id: string) => {
        const newEditingId = editingId === id ? null : id;
        setEditingId(newEditingId);

        if (newEditingId) {
            const region = regions.find(r => r.id === id);
            if (region) {
                // 游戏坐标 → 屏幕坐标
                const displayInfo = getVision()?.getDisplayInfo();
                if (displayInfo) {
                    const screenX = displayInfo.offsetX + (region.x * displayInfo.scaleX);
                    const screenY = displayInfo.offsetY + (region.y * displayInfo.scaleY);
                    const screenW = region.w * displayInfo.scaleX;
                    const screenH = region.h * displayInfo.scaleY;

                    bus.emit(EVENTS.DEBUG_DRAW, {
                        x: screenX, y: screenY, w: screenW, h: screenH,
                        score: 1, label: 'ROI: ' + region.name,
                        isRoiEdit: true
                    });
                } else {
                    // 兜底：无转换信息时直接使用原始坐标
                    bus.emit(EVENTS.DEBUG_DRAW, {
                        x: region.x, y: region.y, w: region.w, h: region.h,
                        score: 1, label: 'ROI: ' + region.name,
                        isRoiEdit: true
                    });
                }
            }
        }
    };

    return (
        <div class="roi-editor">
            <button class="bgi-btn secondary" onClick={onAdd} style={{ marginTop: 0, marginBottom: '12px' }}>
                + 新增区域 (Capture)
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {regions.length === 0 && (
                    <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: 'var(--color-text-tertiary)',
                        background: 'var(--color-bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px dashed var(--color-border-glass)',
                        fontSize: '12px'
                    }}>
                        暂无 ROI 区域
                    </div>
                )}

                {regions.map(region => {
                    const isEditing = editingId === region.id;
                    return (
                        <div
                            key={region.id}
                            class="glass-surface"
                            style={{
                                padding: '8px 10px',
                                borderLeft: `3px solid ${region.scope === 'global' ? 'var(--color-success)' : 'var(--color-info)'}`
                            }}
                        >
                            {/* 标题行 */}
                            <div
                                onClick={() => toggleEdit(region.id)}
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
                                        transform: isEditing ? 'rotate(90deg)' : 'rotate(0deg)',
                                        display: 'inline-block'
                                    }}>▶</span>
                                    <span style={{ fontWeight: 500, fontSize: '12px' }}>{region.name}</span>
                                </div>
                                <span style={{
                                    fontSize: '10px',
                                    color: 'var(--color-text-tertiary)',
                                    background: 'var(--color-bg-input)',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    {region.w}×{region.h}
                                </span>
                            </div>

                            {/* 编辑面板 */}
                            {isEditing && (
                                <div style={{
                                    marginTop: '10px',
                                    paddingTop: '10px',
                                    borderTop: '1px solid var(--color-border-glass)'
                                }}>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ fontSize: '10px', marginBottom: '2px' }}>名称</label>
                                        <input
                                            type="text"
                                            value={region.name}
                                            onInput={(e) => updateRegion(region.id, { name: (e.target as HTMLInputElement).value })}
                                            style={{ padding: '4px 8px', fontSize: '11px' }}
                                        />
                                    </div>

                                    {/* 坐标区域 - 2x2 网格布局 */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '8px',
                                        marginBottom: '8px'
                                    }}>
                                        <div style={{ minWidth: 0 }}>
                                            <label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '2px' }}>X</label>
                                            <input
                                                type="number"
                                                value={region.x}
                                                onInput={(e) => updateRegion(region.id, { x: parseInt((e.target as HTMLInputElement).value) || 0 })}
                                                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '2px' }}>Y</label>
                                            <input
                                                type="number"
                                                value={region.y}
                                                onInput={(e) => updateRegion(region.id, { y: parseInt((e.target as HTMLInputElement).value) || 0 })}
                                                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '2px' }}>宽度</label>
                                            <input
                                                type="number"
                                                value={region.w}
                                                onInput={(e) => updateRegion(region.id, { w: parseInt((e.target as HTMLInputElement).value) || 0 })}
                                                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '2px' }}>高度</label>
                                            <input
                                                type="number"
                                                value={region.h}
                                                onInput={(e) => updateRegion(region.id, { h: parseInt((e.target as HTMLInputElement).value) || 0 })}
                                                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ fontSize: '10px', marginBottom: '2px' }}>作用域</label>
                                        <select
                                            value={region.scope}
                                            onChange={(e) => updateRegion(region.id, { scope: (e.target as HTMLSelectElement).value })}
                                            style={{ padding: '4px 8px', fontSize: '11px' }}
                                        >
                                            <option value="global">全局 (Global)</option>
                                            <option value="Preview">仅预览 (Preview)</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            class="bgi-btn danger"
                                            style={{ flex: 1, padding: '5px', fontSize: '11px', marginTop: 0 }}
                                            onClick={(e) => { e.stopPropagation(); removeRegion(region.id); }}
                                        >
                                            删除
                                        </button>
                                        <button
                                            class="bgi-btn primary"
                                            style={{ flex: 1, padding: '5px', fontSize: '11px', marginTop: 0 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // 游戏坐标 → 屏幕坐标
                                                const displayInfo = getVision()?.getDisplayInfo();
                                                if (displayInfo) {
                                                    const screenX = displayInfo.offsetX + (region.x * displayInfo.scaleX);
                                                    const screenY = displayInfo.offsetY + (region.y * displayInfo.scaleY);
                                                    const screenW = region.w * displayInfo.scaleX;
                                                    const screenH = region.h * displayInfo.scaleY;
                                                    bus.emit(EVENTS.DEBUG_DRAW, {
                                                        x: screenX, y: screenY, w: screenW, h: screenH,
                                                        score: 1, label: 'ROI: ' + region.name,
                                                        isRoiEdit: true
                                                    });
                                                }
                                                setEditingId(null);
                                            }}
                                        >
                                            完成
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
