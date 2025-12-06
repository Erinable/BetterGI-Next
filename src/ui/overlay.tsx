import { h, render } from 'preact';
import { CropLayer } from './components/CropLayer'; // [新增]
import { useState } from 'preact/hooks';
import { App } from './components/App';
import { DebugLayer } from './components/DebugLayer';
import { FloatBall } from './components/FloatBall';
import { bus, EVENTS } from '../utils/event-bus';
import { config as configManager } from '../core/config-manager';
import cssContent from './styles-compat.css';

function Root() {
    const [showPanel, setShowPanel] = useState(false);

    // 位置状态
    const [ballPos, setBallPos] = useState({ x: 0, y: 100 });
    const [panelPos, setPanelPos] = useState({ x: 100, y: 100 });

    // 截图状态
    const [isCropping, setIsCropping] = useState(false);

    // 新增: ROI 添加状态
    const [isAddingRoi, setIsAddingRoi] = useState(false);
    const [pendingRoiRect, setPendingRoiRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

    const handleCropStart = () => {
        bus.emit(EVENTS.TASK_STOP);
        setShowPanel(false);
        setIsCropping(true);
    };

    const handleCropConfirm = (rect: { x: number, y: number, w: number, h: number }) => {
        setIsCropping(false);
        setShowPanel(true);
        bus.emit(EVENTS.CROP_REQUEST, rect);
    };

    // 新增: ROI 添加流程
    const handleAddRoiStart = () => {
        setShowPanel(false);
        setIsAddingRoi(true);
    };

    const handleRoiDrawConfirm = (rect: { x: number, y: number, w: number, h: number }) => {
        setPendingRoiRect(rect);
        setIsAddingRoi(false);
        // 弹出命名对话框
        const name = prompt('请输入 ROI 区域名称:', '新区域');
        if (name) {
            const scope = prompt('请输入作用域 (global=全局, Preview=预览, 或任务名):', 'global') || 'global';
            configManager.addROI({
                name,
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
                scope
            });
        }
        setShowPanel(true);
        setPendingRoiRect(null);
    };

    return (
        <div id="bgi-ui-root">
            {/* 调试层常驻 */}
            <DebugLayer />

            {/* 截图层 */}
            {isCropping && (
                <CropLayer
                    onConfirm={handleCropConfirm}
                    onCancel={() => { setIsCropping(false); setShowPanel(true); }}
                />
            )}

            {/* ROI 绘制层 */}
            {isAddingRoi && (
                <CropLayer
                    onConfirm={handleRoiDrawConfirm}
                    onCancel={() => { setIsAddingRoi(false); setShowPanel(true); }}
                />
            )}

            {/* 常规 UI */}
            {!isCropping && !isAddingRoi && (
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
                        onCrop={handleCropStart}
                        onAddRoi={handleAddRoiStart}
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
