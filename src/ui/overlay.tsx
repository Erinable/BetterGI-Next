import { h, render } from 'preact';
import { CropLayer } from './components/CropLayer'; // [新增]
import { useState } from 'preact/hooks';
import { App } from './components/App';
import { DebugLayer } from './components/DebugLayer';
import { FloatBall } from './components/FloatBall';
import { bus, EVENTS } from '../utils/event-bus';
import cssContent from './styles-compat.css';

function Root() {
    const [showPanel, setShowPanel] = useState(false);

    // [修复2] 状态提升：位置由父组件管理，这样切换时不会丢失
    const [ballPos, setBallPos] = useState({ x: 0, y: 100 }); // 默认为吸附状态 x=0
    const [panelPos, setPanelPos] = useState({ x: 100, y: 100 });
    const [isCropping, setIsCropping] = useState(false); // [新增] 状态

	const handleCropStart = () => {
        // [新增] 截图开始时，必须停止引擎正在跑的任务（如 Preview）
        // 这解决了“截图时预览还在跑”和“旧绿框不消失”的问题
        bus.emit(EVENTS.TASK_STOP);
        setShowPanel(false); // 隐藏面板
        setIsCropping(true); // 显示截图蒙版
    };

    const handleCropConfirm = (rect: { x: number, y: number, w: number, h: number }) => {
        setIsCropping(false);
        setShowPanel(true); // 恢复面板
        // 发送给 Engine
        bus.emit(EVENTS.CROP_REQUEST, rect);
    };

	return (
        <div id="bgi-ui-root">
            {/* 调试层常驻 */}
            <DebugLayer />

			{/* [新增] 截图层，优先级最高 */}
            {isCropping && (
                <CropLayer
                    onConfirm={handleCropConfirm}
                    onCancel={() => { setIsCropping(false); setShowPanel(true); }}
                />
            )}

            {/* 常规 UI 逻辑 */}
            {!isCropping && (
                !showPanel ? (
                    <FloatBall
                        initialPos={ballPos}
                        onPosChange={setBallPos} // 球移动后更新父组件状态
                        onClick={() => setShowPanel(true)}
                    />
                ) : (
                    <App
                        initialPos={panelPos}
                        onPosChange={setPanelPos} // 面板移动后更新父组件状态
                        onClose={() => setShowPanel(false)}
					    onCrop={handleCropStart} // [新增] 传入回调}
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
