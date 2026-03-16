'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be inside ToastProvider');
    return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, type: ToastType = 'success') => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto dismiss
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}

            {/* Toast Container */}
            <div
                className="fixed bottom-4 right-4 z-[9998] flex flex-col gap-2 pointer-events-none"
                style={{ maxWidth: 360 }}
            >
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className="pointer-events-auto animate-slide-in-right"
                        style={{
                            padding: '12px 16px',
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 14,
                            fontWeight: 500,
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            ...(t.type === 'success' ? {
                                background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.1))',
                                border: '1px solid rgba(34,197,94,0.3)',
                                color: '#4ade80',
                            } : t.type === 'error' ? {
                                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))',
                                border: '1px solid rgba(239,68,68,0.3)',
                                color: '#f87171',
                            } : {
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.1))',
                                border: '1px solid rgba(59,130,246,0.3)',
                                color: '#60a5fa',
                            }),
                        }}
                        onClick={() => dismiss(t.id)}
                    >
                        <span style={{ fontSize: 18 }}>
                            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
                        </span>
                        <span style={{ color: 'var(--text-primary)', flex: 1 }}>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Slide-in animation */}
            <style jsx global>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(100px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .animate-slide-in-right {
                    animation: slideInRight 0.3s ease-out;
                }
            `}</style>
        </ToastContext.Provider>
    );
}
