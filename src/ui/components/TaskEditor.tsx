// src/ui/components/TaskEditor.tsx
// 任务资产编辑器组件

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { config as configManager, TaskConfig, TaskAsset } from '../../core/config-manager';
import { bus, EVENTS } from '../../utils/event-bus';
import { AssetItem } from './AssetItem';

interface TaskEditorProps {
    registeredTasks: string[];  // 已注册的任务名列表
    onCaptureAsset: (taskName: string, assetName: string, mode: 'base64' | 'roi') => void;
}

// 用于跟踪待保存的资产变更
type PendingAssets = Map<string, Map<string, Partial<TaskAsset>>>;

export function TaskEditor({ registeredTasks, onCaptureAsset }: TaskEditorProps) {
    const [expandedTask, setExpandedTask] = useState<string | null>(null);
    const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>([]);
    // 待保存的变更: taskName -> (assetId -> changes)
    const [pendingAssets, setPendingAssets] = useState<PendingAssets>(new Map());

    // 加载任务配置
    useEffect(() => {
        // 为每个已注册的任务确保有配置
        registeredTasks.forEach(taskName => {
            configManager.ensureTaskConfig(taskName);
        });
        setTaskConfigs(configManager.getAllTasks());
    }, [registeredTasks]);

    // 刷新配置
    const refreshConfigs = () => {
        setTaskConfigs(configManager.getAllTasks());
    };

    // 切换任务启用状态 (这个立即保存，因为是简单开关)
    const toggleTaskEnabled = (taskName: string, enabled: boolean) => {
        configManager.setTaskEnabled(taskName, enabled);
        refreshConfigs();
        bus.emit(EVENTS.TASK_CONFIG_UPDATE, taskName);
    };

    // 更新资产 (只更新本地 pending 状态，不立即保存)
    const updateAsset = useCallback((taskName: string, assetId: string, updates: Partial<TaskAsset>) => {
        setPendingAssets(prev => {
            const next = new Map(prev);
            if (!next.has(taskName)) {
                next.set(taskName, new Map());
            }
            const taskPending = next.get(taskName)!;
            const existing = taskPending.get(assetId) || {};
            taskPending.set(assetId, { ...existing, ...updates });
            return next;
        });
    }, []);

    // 保存资产变更
    const saveAsset = useCallback((taskName: string, assetId: string) => {
        const taskConfig = configManager.getTaskConfig(taskName);
        if (!taskConfig) return;

        const asset = taskConfig.assets.find(a => a.id === assetId);
        const pending = pendingAssets.get(taskName)?.get(assetId);

        if (asset && pending) {
            configManager.setTaskAsset(taskName, { ...asset, ...pending });
            // 清除该资产的 pending 状态
            setPendingAssets(prev => {
                const next = new Map(prev);
                const taskPending = next.get(taskName);
                if (taskPending) {
                    taskPending.delete(assetId);
                    if (taskPending.size === 0) {
                        next.delete(taskName);
                    }
                }
                return next;
            });
            refreshConfigs();
            bus.emit(EVENTS.ASSETS_CHANGED, taskName);
        }
    }, [pendingAssets]);

    // 检查资产是否有待保存的变更
    const hasPendingChanges = useCallback((taskName: string, assetId: string) => {
        return pendingAssets.get(taskName)?.has(assetId) || false;
    }, [pendingAssets]);

    // 获取合并了 pending 变更的资产
    const getMergedAsset = useCallback((taskName: string, asset: TaskAsset): TaskAsset => {
        const pending = pendingAssets.get(taskName)?.get(asset.id);
        return pending ? { ...asset, ...pending } : asset;
    }, [pendingAssets]);

    // 添加资产
    const addAsset = (taskName: string) => {
        const newAsset = configManager.setTaskAsset(taskName, {
            name: `asset_${Date.now().toString(36)}`,
            base64: '',
        });
        refreshConfigs();
        bus.emit(EVENTS.ASSETS_CHANGED, taskName);
    };

    // 删除资产
    const deleteAsset = (taskName: string, assetId: string) => {
        // 也清除 pending 状态
        setPendingAssets(prev => {
            const next = new Map(prev);
            const taskPending = next.get(taskName);
            if (taskPending) {
                taskPending.delete(assetId);
            }
            return next;
        });
        configManager.removeTaskAsset(taskName, assetId);
        refreshConfigs();
        bus.emit(EVENTS.ASSETS_CHANGED, taskName);
    };

    return (
        <div class="task-editor">
            {registeredTasks.length === 0 ? (
                <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    background: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-border-glass)',
                    fontSize: '12px'
                }}>
                    暂无已注册任务
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {registeredTasks.map(taskName => {
                        const taskConfig = taskConfigs.find(t => t.taskName === taskName);
                        const isExpanded = expandedTask === taskName;
                        const isEnabled = taskConfig?.enabled ?? true;
                        const assetCount = taskConfig?.assets.length || 0;
                        const configuredCount = taskConfig?.assets.filter(a => a.base64 && a.base64.length > 50).length || 0;

                        return (
                            <div
                                key={taskName}
                                class="glass-surface"
                                style={{
                                    padding: '10px 12px',
                                    borderLeft: `3px solid ${isEnabled ? 'var(--color-success)' : 'var(--color-text-tertiary)'}`
                                }}
                            >
                                {/* 任务标题行 */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <div
                                        onClick={() => setExpandedTask(isExpanded ? null : taskName)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            flex: 1
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '10px',
                                            color: 'var(--color-text-tertiary)',
                                            transition: 'transform 0.2s',
                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                            display: 'inline-block'
                                        }}>▶</span>
                                        <span style={{ fontWeight: 500, fontSize: '13px' }}>{taskName}</span>
                                        <span style={{
                                            fontSize: '10px',
                                            color: 'var(--color-text-tertiary)',
                                            background: 'var(--color-bg-input)',
                                            padding: '2px 6px',
                                            borderRadius: '4px'
                                        }}>
                                            {configuredCount}/{assetCount} 资产
                                        </span>
                                    </div>

                                    {/* 启用开关 */}
                                    <label class="switch" style={{ marginLeft: '10px' }}>
                                        <input
                                            type="checkbox"
                                            checked={isEnabled}
                                            onChange={(e) => toggleTaskEnabled(taskName, (e.target as HTMLInputElement).checked)}
                                        />
                                        <span class="slider"></span>
                                    </label>
                                </div>

                                {/* 展开的资产列表 */}
                                {isExpanded && (
                                    <div style={{
                                        marginTop: '12px',
                                        paddingTop: '12px',
                                        borderTop: '1px solid var(--color-border-glass)'
                                    }}>
                                        {taskConfig?.assets.length === 0 ? (
                                            <div style={{
                                                padding: '12px',
                                                textAlign: 'center',
                                                color: 'var(--color-text-tertiary)',
                                                fontSize: '11px',
                                                background: 'var(--color-bg-input)',
                                                borderRadius: '6px'
                                            }}>
                                                此任务暂无资产配置
                                            </div>
                                        ) : (
                                            taskConfig?.assets.map(asset => (
                                                <AssetItem
                                                    key={asset.id}
                                                    asset={getMergedAsset(taskName, asset)}
                                                    taskName={taskName}
                                                    onUpdate={(updates) => updateAsset(taskName, asset.id, updates)}
                                                    onDelete={() => deleteAsset(taskName, asset.id)}
                                                    onCaptureBase64={() => onCaptureAsset(taskName, asset.name, 'base64')}
                                                    onCaptureROI={() => onCaptureAsset(taskName, asset.name, 'roi')}
                                                    hasPendingChanges={hasPendingChanges(taskName, asset.id)}
                                                    onSave={() => saveAsset(taskName, asset.id)}
                                                />
                                            ))
                                        )}

                                        <button
                                            class="bgi-btn secondary"
                                            style={{ marginTop: '8px', fontSize: '11px', padding: '6px' }}
                                            onClick={() => addAsset(taskName)}
                                        >
                                            + 添加资产
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
