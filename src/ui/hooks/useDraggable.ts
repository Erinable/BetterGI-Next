import { useState, useRef, useEffect } from 'preact/hooks';

interface DragOptions {
    initialPos?: { x: number; y: number };
    onDragEnd?: (pos: { x: number; y: number }) => void;
    canDock?: boolean; // 是否开启左侧吸附
    dockThreshold?: number; // 吸附阈值
}

export function useDraggable(options: DragOptions = {}) {
    // 状态提升：如果父组件传了 initialPos，就用父组件的，否则用默认值
    const [pos, setPos] = useState(options.initialPos || { x: 20, y: 100 });
    const [isDocked, setIsDocked] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isNearDock, setIsNearDock] = useState(false);

    const dragging = useRef(false);
    const offset = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const dockThreshold = options.dockThreshold || 50;

    // 同步外部传入的初始位置 (解决复位问题的关键)
    useEffect(() => {
        if (options.initialPos) {
            setPos(options.initialPos);
            // 如果初始位置 x=0，自动视为已吸附
            if (options.canDock && options.initialPos.x === 0) {
                setIsDocked(true);
            }
        }
    }, [options.initialPos]);

    const startDrag = (e: MouseEvent) => {
        if (e.button !== 0) return; // 只响应左键
        e.preventDefault();

        dragging.current = true;
        setIsDragging(true);
        offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        startPos.current = { x: pos.x, y: pos.y };

        if (options.canDock && isDocked) {
            setIsDocked(false); // 从吸附状态开始拖拽，解除吸附
        }

        // 添加全局拖拽状态样式
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    };

    const checkNearDock = (x: number) => {
        return options.canDock && x < dockThreshold;
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            e.preventDefault();

            const newX = e.clientX - offset.current.x;
            const newY = e.clientY - offset.current.y;

            // 检查是否接近吸附区域
            if (options.canDock) {
                setIsNearDock(newX < dockThreshold);
            }

            setPos({ x: newX, y: newY });
        };

        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setIsDragging(false);
            setIsNearDock(false);

            // 清理全局样式
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            let finalPos = pos;

            // 处理吸附逻辑
            if (options.canDock) {
                setPos(p => {
                    if (p.x < dockThreshold) {
                        setIsDocked(true);
                        finalPos = { ...p, x: 0 };
                        return finalPos;
                    }
                    setIsDocked(false);
                    return p;
                });
            }

            // 通知父组件保存位置
            if (options.onDragEnd) {
                // setTimeout 确保读到的是吸附后的坐标
                setTimeout(() => options.onDragEnd!(finalPos), 0);
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && dragging.current) {
                // ESC键取消拖拽，回到起始位置
                dragging.current = false;
                setIsDragging(false);
                setIsNearDock(false);
                setPos(startPos.current);

                // 清理全局样式
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                if (options.onDragEnd) {
                    setTimeout(() => options.onDragEnd!(startPos.current), 0);
                }
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('keydown', onKeyDown);

            // 清理全局样式（以防万一）
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [pos, dockThreshold, options.canDock, options.onDragEnd]);

    return {
        pos,
        isDocked,
        isDragging,
        isNearDock,
        startDrag
    };
}
