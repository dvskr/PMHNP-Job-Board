'use client';

import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

const STORAGE_KEY = 'pmhnp_pwa_install_dismissed';
const SUPPRESS_DAYS = 30;

/**
 * PWA install banner — shows on mobile after 3+ visits.
 * Uses the beforeinstallprompt event when available, otherwise shows a manual hint.
 */
export default function PWAInstallBanner() {
    const [show, setShow] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

    useEffect(() => {
        // Only mobile
        if (typeof window === 'undefined' || window.innerWidth > 768) return;

        // Check suppression
        try {
            const dismissed = localStorage.getItem(STORAGE_KEY);
            if (dismissed) {
                const elapsed = Date.now() - parseInt(dismissed, 10);
                if (elapsed < SUPPRESS_DAYS * 24 * 60 * 60 * 1000) return;
            }
        } catch { return; }

        // Check visit count
        try {
            const visits = parseInt(localStorage.getItem('pmhnp_visit_count') || '0', 10) + 1;
            localStorage.setItem('pmhnp_visit_count', visits.toString());
            if (visits < 3) return;
        } catch { return; }

        // Don't show if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        // Listen for the install prompt
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShow(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Fallback for iOS/Safari (no beforeinstallprompt) — show hint after 2s
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        let timer: NodeJS.Timeout | null = null;
        if (isIOS) {
            timer = setTimeout(() => setShow(true), 2000);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            if (timer) clearTimeout(timer);
        };
    }, []);

    const dismiss = () => {
        setShow(false);
        try { localStorage.setItem(STORAGE_KEY, Date.now().toString()); } catch { /* noop */ }
    };

    const install = async () => {
        if (deferredPrompt && 'prompt' in deferredPrompt) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (deferredPrompt as any).prompt();
        }
        dismiss();
    };

    if (!show) return null;

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[9985] animate-slide-down"
            style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(13,148,136,0.08))',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(45,212,191,0.2)',
            }}
        >
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Download size={18} style={{ color: '#2DD4BF' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Add PMHNP Hiring to your home screen for quick access
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {deferredPrompt ? (
                        <button
                            onClick={install}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer"
                            style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }}
                        >
                            Install
                        </button>
                    ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Tap share → Add to Home Screen
                        </span>
                    )}
                    <button onClick={dismiss} className="p-1 cursor-pointer" style={{ color: 'var(--text-muted)' }} aria-label="Dismiss">
                        <X size={16} />
                    </button>
                </div>
            </div>

            <style jsx global>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-down {
                    animation: slideDown 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}
