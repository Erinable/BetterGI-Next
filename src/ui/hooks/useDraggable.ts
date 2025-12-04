import { useState, useRef, useEffect } from 'preact/hooks';

interface DragOptions {
    initialPos?: { x: number; y: number };
    onDragEnd?: (pos: { x: number; y: number }) => void;
    canDock?: boolean; // 是否开启左侧吸附
}

export function useDraggable(options: DragOptions = {}) {
    // 状态提升：如果父组件传了 initialPos，就用父组件的，否则用默认值
    const [pos, setPos] = useState(options.initialPos || { x: 20, y: 100 });
    const [isDocked, setIsDocked] = useState(false);
    
    const dragging = useRef(false);
    const offset = useRef({ x: 0, y: 0 });

    // 同步外部传入的初始位置 (解决复位问题的关键)
    useEffect(() => {
        if (options.initialPos) {
            setPos(options.initialPos);
            // 如果初始位置 x=0，自动视为已吸附
            if (options.canDock && options.initialPos.x === 0) setIsDocked(true);
        }
    }, [options.initialPos]);

    const startDrag = (e: MouseEvent) => {
        if (e.button !== 0) return; // 只响应左键
        e.preventDefault();
        
        dragging.current = true;
        offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        
        if (options.canDock) setIsDocked(false); // 拖拽开始，解除吸附
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            e.preventDefault();
            
            const newX = e.clientX - offset.current.x;
            const newY = e.clientY - offset.current.y;
            setPos({ x: newX, y: newY });
        };

        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;

            let finalPos = pos;
            // 处理吸附逻辑
            if (options.canDock) {
                // 如果当前位置（在拖拽中已经是最新）靠左 < 50px
                // 注意：这里需要再次读取最新的 pos 状态，或者直接用 DOM 计算，
                // 但为了简单，我们在下一次 render 时修正，或者在这里用 ref 记录
                // 简单方案：在 onMove 里更新了 pos，这里直接判断 pos.x 是不安全的（闭包陷阱）。
                // 更好的做法是依赖 setState 的回调，但这里我们用一个简单的 hack: 
                // 再次触发一次 setPos，检查值。
                setPos(p => {
                    if (p.x < 50) {
                        setIsDocked(true);
                        finalPos = { ...p, x: 0 };
                        return finalPos;
                    }
                    return p;
                });
            }

            // 通知父组件保存位置
            if (options.onDragEnd) {
                // setTimeout 确保读到的是吸附后的坐标
                setTimeout(() => options.onDragEnd!(finalPos), 0);
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []); // 依赖空数组，利用 setPos 的函数式更新解决闭包问题

    return { pos, isDocked, startDrag };
}
