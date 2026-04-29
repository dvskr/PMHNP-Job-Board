'use client';

import { useState, useEffect, FormEvent } from 'react';
import { X, Mail, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'pmhnp_sticky_bar_dismissed';

/**
 * B8: Sticky email signup bar at bottom of page
 * Appears after scrolling past hero section.
 * Dismissible — remembers for session via localStorage.
 */
export default function StickyEmailBar() {
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    useEffect(() => {
        // Check if already dismissed
        try {
            if (localStorage.getItem(STORAGE_KEY)) {
                setDismissed(true);
                return;
            }
        } catch { /* noop */ }

        const handleScroll = () => {
            // Show after scrolling 600px (past hero)
            setVisible(window.scrollY > 600);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
        setStatus('loading');
        try {
            await fetch('/api/job-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, frequency: 'daily', newsletterOptIn: true }),
            });
        } catch { /* silent */ }
        setStatus('done');
        setEmail('');
        setTimeout(handleDismiss, 3000);
    };

    if (dismissed || !visible) return null;

    return (
        <div
            className="fixed left-0 right-0 z-[60] sticky-email-bar"
            style={{
                bottom: 0,
                background: 'rgba(237,245,244,0.97)',
                backdropFilter: 'blur(12px)',
                borderTop: '1px solid rgba(13,148,136,0.15)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
                animation: 'slideUp 0.4s ease-out',
            }}
        >
            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                @media (max-width: 767px) {
                    .sticky-email-bar {
                        bottom: 60px !important;
                    }
                }
                @media (max-width: 480px) {
                    .sticky-email-bar {
                        display: none !important;
                    }
                }
            `}</style>

            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap justify-center">
                {status === 'done' ? (
                    <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>
                        ✓ Subscribed! Check your inbox.
                    </p>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <Mail size={16} style={{ color: '#2DD4BF' }} />
                            <span className="text-sm font-semibold whitespace-nowrap" style={{ color: '#2D3748' }}>
                                Get daily PMHNP jobs in your inbox
                            </span>
                        </div>
                        <form onSubmit={handleSubmit} className="flex items-center gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                className="px-3 py-2 rounded-lg text-sm outline-none"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #CBD5E0',
                                    color: '#2D3748',
                                    width: '200px',
                                }}
                            />
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                                style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }}
                            >
                                {status === 'loading' ? '...' : (
                                    <>Subscribe <ArrowRight size={14} /></>
                                )}
                            </button>
                        </form>
                    </>
                )}

                {/* Dismiss */}
                <button
                    onClick={handleDismiss}
                    className="p-1.5 rounded-md transition-colors cursor-pointer"
                    style={{ color: '#718096' }}
                    aria-label="Dismiss"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
