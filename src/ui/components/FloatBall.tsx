import { h } from 'preact';
import { useDraggable } from '../hooks/useDraggable';

interface FloatBallProps {
    initialPos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onClick: () => void;
}

export function FloatBall({ initialPos, onPosChange, onClick }: FloatBallProps) {
    const { pos, isDocked, isDragging, isNearDock, startDrag } = useDraggable({
        initialPos,
        onDragEnd: onPosChange,
        canDock: true, // 开启吸附
        dockThreshold: 50
    });

    // 防止拖拽过程中触发点击
    const handleClick = (e: MouseEvent) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 如果是吸附状态或正常状态，触发点击
        onClick();
    };

    return (
        <>
            {/* Dock indicator - 显示在左侧屏幕边缘 */}
            {isNearDock && !isDocked && (
                <div
                    class="dock-indicator active"
                    title="释放以吸附到侧边"
                />
            )}

            {/* Floating ball */}
            <div
                class={`bgi-float-ball ${isDocked ? 'docked' : ''} ${isDragging ? 'dragging' : ''}`}
                style={{
                    top: pos.y,
                    left: pos.x,
                    pointerEvents: 'auto'
                }}
                onMouseDown={startDrag}
                onClick={handleClick}
                title={isDocked ? "BetterGi 控制台 (已吸附)" : "BetterGi 控制台"}
            >
                {isDocked ? '' : '⚙️'}
            </div>
        </>
    );
}
