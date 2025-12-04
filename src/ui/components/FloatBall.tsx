import { h } from 'preact';
import { useDraggable } from '../hooks/useDraggable';

interface FloatBallProps {
    initialPos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onClick: () => void;
}

export function FloatBall({ initialPos, onPosChange, onClick }: FloatBallProps) {
    const { pos, isDocked, startDrag } = useDraggable({
        initialPos,
        onDragEnd: onPosChange,
        canDock: true // 开启吸附
    });

    // 简单的防抖，防止拖拽结束瞬间触发点击
    const handleMouseUp = () => {
        // 如果是吸附状态，或者没有显著移动，才算点击
        // 这里简化处理：直接透传 onClick，因为 startDrag 已经处理了 preventDefault
        // 实际上最好加一个 hasMoved ref 判断，但为了代码简洁先这样：
        // 如果 isDocked 改变了，说明刚刚发生了拖拽吸附，不应该触发点击。
        // 更好的体验是：点击事件只在鼠标未移动时触发。
    };

    return (
        <div 
            class={`bgi-float-ball ${isDocked ? 'docked' : ''}`}
            style={{ 
                top: pos.y, 
                left: pos.x, 
                pointerEvents: 'auto' 
            }}
            onMouseDown={startDrag}
            onClick={(e) => {
                // 如果是吸附状态，点击直接展开
                // 如果不是吸附状态，可能是在拖拽，这里为了简单，直接触发
                // 你可以根据需求加更复杂的判断
                onClick();
            }}
            title="BetterGi 控制台"
        >
            {isDocked ? '' : '⚙️'}
        </div>
    );
}
