import { h, render } from 'preact';
import { CropLayer } from './components/CropLayer';
import { useState } from 'preact/hooks';
import { App } from './components/App';
import { DebugLayer } from './components/DebugLayer';
import { FloatBall } from './components/FloatBall';
import { bus, EVENTS } from '../utils/event-bus';
import { config as configManager } from '../core/config-manager';
import cssContent from './styles-compat.css';

// 获取真实的页面 window (用于访问暴露的 BetterGi 对象)
const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

// 捕获上下文 (复用截图/ROI 逻辑)
interface CaptureContext {
    type: 'screenshot' | 'roi' | 'asset-base64' | 'asset-roi';
    taskName?: string;
    assetName?: string;
}

function Root() {
    const [showPanel, setShowPanel] = useState(false);

    // 位置状态
    const [ballPos, setBallPos] = useState({ x: 0, y: 100 });
    const [panelPos, setPanelPos] = useState({ x: 100, y: 100 });

    // 统一的截图/框选状态
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureContext, setCaptureContext] = useState<CaptureContext | null>(null);

    // 预览可见性状态
    const [showDebugLayer, setShowDebugLayer] = useState(true);

    // 通用截图开始
    const startCapture = (context: CaptureContext) => {
        bus.emit(EVENTS.TASK_STOP);
        setShowPanel(false);
        setCaptureContext(context);
        setIsCapturing(true);
    };

    // 通用截图确认
    const handleCaptureConfirm = async (rect: { x: number, y: number, w: number, h: number }) => {
        setIsCapturing(false);
        setShowPanel(true);

        if (!captureContext) return;

        const { type, taskName, assetName } = captureContext;

        // 坐标转换: 屏幕坐标 → 游戏坐标
        const displayInfo = (realWindow as any).BetterGi?.vision?.getDisplayInfo();
        let gameRect = rect;
        if (displayInfo) {
            gameRect = {
                x: Math.floor((rect.x - displayInfo.offsetX) / displayInfo.scaleX),
                y: Math.floor((rect.y - displayInfo.offsetY) / displayInfo.scaleY),
                w: Math.floor(rect.w / displayInfo.scaleX),
                h: Math.floor(rect.h / displayInfo.scaleY),
            };
        }

        switch (type) {
            case 'screenshot':
                // 原有截图逻辑: 发送给 engine 处理
                bus.emit(EVENTS.CROP_REQUEST, rect);
                break;

            case 'roi':
                // 原有 ROI 逻辑: 触发 Modal
                setTimeout(() => bus.emit('roi:drawn', rect), 100);
                break;

            case 'asset-base64':
                // 资产 Base64 捕获: 复用 engine 的 captureTemplate
                if (taskName && assetName) {
                    bus.emit('asset:capture-base64', { taskName, assetName, rect });
                }
                break;

            case 'asset-roi':
                // 资产 ROI 捕获: 直接更新配置
                if (taskName && assetName) {
                    const assets = configManager.getTaskAssets(taskName);
                    const asset = assets.find(a => a.name === assetName);
                    if (asset) {
                        configManager.setTaskAsset(taskName, { ...asset, roi: gameRect });
                        bus.emit(EVENTS.ASSETS_CHANGED, taskName);
                    }
                }
                break;
        }

        setCaptureContext(null);
    };

    const handleCaptureCancel = () => {
        setIsCapturing(false);
        setShowPanel(true);
        setCaptureContext(null);
    };

    const handleTogglePreview = () => {
        setShowDebugLayer(prev => !prev);
    };

    // 资产捕获快捷方法 (传给 App)
    const handleCaptureAsset = (taskName: string, assetName: string, mode: 'base64' | 'roi') => {
        startCapture({
            type: mode === 'base64' ? 'asset-base64' : 'asset-roi',
            taskName,
            assetName
        });
    };

    return (
        <div id="bgi-ui-root">
            {/* 调试层 */}
            <DebugLayer visible={showDebugLayer} />

            {/* 统一的截图/框选层 */}
            {isCapturing && (
                <CropLayer
                    onConfirm={handleCaptureConfirm}
                    onCancel={handleCaptureCancel}
                />
            )}

            {/* 常规 UI */}
            {!isCapturing && (
                !showPanel ? (
                    <FloatBall
                        initialPos={ballPos}
                        onPosChange={setBallPos}
                        onClick={() => setShowPanel(true)}
                    />
                ) : (
                    <App
                        initialPos={panelPos}
                        onPosChange={setPanelPos}
                        onClose={() => setShowPanel(false)}
                        onCrop={() => startCapture({ type: 'screenshot' })}
                        onAddRoi={() => startCapture({ type: 'roi' })}
                        onCaptureAsset={handleCaptureAsset}
                        showPreview={showDebugLayer}
                        onTogglePreview={handleTogglePreview}
                    />
                )
            )}
        </div>
    );
}

export class OverlayManager {
    constructor() {
        const host = document.createElement('div');
        host.id = 'bgi-host-root';
        Object.assign(host.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100%', height: '100%',
            zIndex: '99999', pointerEvents: 'none'
        });
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = cssContent;
        shadow.appendChild(style);

        render(<Root />, shadow);
    }
}
