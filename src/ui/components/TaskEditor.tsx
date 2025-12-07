// src/ui/components/TaskEditor.tsx
// 任务资产编辑器组件

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { config as configManager, TaskConfig, TaskAsset } from '../../core/config-manager';
import { bus, EVENTS } from '../../utils/event-bus';
import { AssetItem } from './AssetItem';

interface TaskEditorProps {
    registeredTasks: string[];  // 已注册的任务名列表
    onCaptureAsset: (taskName: string, assetName: string, mode: 'base64' | 'roi') => void;
}

export function TaskEditor({ registeredTasks, onCaptureAsset }: TaskEditorProps) {
    const [expandedTask, setExpandedTask] = useState<string | null>(null);
    const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>([]);

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

    // 切换任务启用状态
    const toggleTaskEnabled = (taskName: string, enabled: boolean) => {
        configManager.setTaskEnabled(taskName, enabled);
        refreshConfigs();
        bus.emit(EVENTS.TASK_CONFIG_UPDATE, taskName);
    };

    // 更新资产
    const updateAsset = (taskName: string, assetId: string, updates: Partial<TaskAsset>) => {
        const taskConfig = configManager.getTaskConfig(taskName);
        if (!taskConfig) return;

        const asset = taskConfig.assets.find(a => a.id === assetId);
        if (asset) {
            configManager.setTaskAsset(taskName, { ...asset, ...updates });
            refreshConfigs();
            bus.emit(EVENTS.ASSETS_CHANGED, taskName);
        }
    };

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
                                                    asset={asset}
                                                    taskName={taskName}
                                                    onUpdate={(updates) => updateAsset(taskName, asset.id, updates)}
                                                    onDelete={() => deleteAsset(taskName, asset.id)}
                                                    onCaptureBase64={() => onCaptureAsset(taskName, asset.name, 'base64')}
                                                    onCaptureROI={() => onCaptureAsset(taskName, asset.name, 'roi')}
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
