import { h, ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface ModalProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    children: ComponentChildren;
    footer?: ComponentChildren;
}

export function Modal({ title, isOpen, onClose, children, footer }: ModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    // Close on ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(4px)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'fadeIn 0.2s ease-out',
                pointerEvents: 'auto'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={modalRef}
                class="bgi-panel"
                style={{
                    position: 'relative',
                    width: '320px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    transform: 'translateY(0)',
                    animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
            >
                <div class="header" style={{ marginBottom: '16px', flexShrink: 0 }}>
                    <strong>{title}</strong>
                    <div class="close-btn" onClick={onClose}>×</div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', marginBottom: footer ? '16px' : '0' }}>
                    {children}
                </div>

                {footer && (
                    <div style={{
                        marginTop: 'auto',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        borderTop: '1px solid var(--color-border-glass)',
                        paddingTop: '16px'
                    }}>
                        {footer}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            `}</style>
        </div>
    );
}
