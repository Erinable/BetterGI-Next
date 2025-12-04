import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

interface CropLayerProps {
    onConfirm: (rect: { x: number, y: number, w: number, h: number }) => void;
    onCancel: () => void;
}

export function CropLayer({ onConfirm, onCancel }: CropLayerProps) {
    const [startPos, setStartPos] = useState<{ x: number, y: number } | null>(null);
    const [currPos, setCurrPos] = useState<{ x: number, y: number } | null>(null);
    const isDrawing = useRef(false);

    const handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return; // 只响应左键
        e.preventDefault();
        e.stopPropagation();
        isDrawing.current = true;
        setStartPos({ x: e.clientX, y: e.clientY });
        setCurrPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDrawing.current) return;
        setCurrPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
        if (!isDrawing.current || !startPos) return;
        isDrawing.current = false;
        
        // 计算最终矩形
        const x = Math.min(startPos.x, e.clientX);
        const y = Math.min(startPos.y, e.clientY);
        const w = Math.abs(e.clientX - startPos.x);
        const h = Math.abs(e.clientY - startPos.y);

        if (w > 5 && h > 5) {
            onConfirm({ x, y, w, h });
        } else {
            // 如果框太小，视为取消或误触
            onCancel();
        }
    };

    // ESC 取消
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // 计算渲染用的样式
    let rectStyle = {};
    if (startPos && currPos) {
        const x = Math.min(startPos.x, currPos.x);
        const y = Math.min(startPos.y, currPos.y);
        const w = Math.abs(currPos.x - startPos.x);
        const h = Math.abs(currPos.y - startPos.y);
        rectStyle = { left: x, top: y, width: w, height: h };
    }

    return (
        <div 
            style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                zIndex: 99999, cursor: 'crosshair',
                background: 'rgba(0,0,0,0.3)', // 半透明遮罩
                pointerEvents: 'auto' // 必须捕获鼠标事件
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* 提示文字 */}
            <div style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                color: 'white', background: 'rgba(0,0,0,0.7)', padding: '5px 10px',
                borderRadius: '4px', pointerEvents: 'none'
            }}>
                按住左键框选目标区域，ESC 取消
            </div>

            {/* 选框高亮 */}
            {startPos && (
                <div style={{
                    position: 'absolute', 
                    border: '2px solid #00ff00',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', // 巧妙的遮罩效果：框外变暗
                    ...rectStyle
                }}></div>
            )}
        </div>
    );
}
