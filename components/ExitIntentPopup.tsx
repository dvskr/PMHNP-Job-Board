'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { X, Bell, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'pmhnp_exit_popup_dismissed';
const SUPPRESS_DAYS = 14;

/**
 * Exit-intent popup for job alerts
 * Desktop: triggers on mouse leaving viewport
 * Mobile: triggers after 45s idle
 * Suppressed for 14 days after dismiss/submit
 * Skips logged-in users (they already have an account)
 */
export default function ExitIntentPopup() {
    const [isOpen, setIsOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [newsletterOptIn, setNewsletterOptIn] = useState(true);
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    const dismiss = useCallback(() => {
        setIsOpen(false);
        try {
            localStorage.setItem(STORAGE_KEY, Date.now().toString());
        } catch { /* noop */ }
    }, []);

    useEffect(() => {
        // Skip for logged-in users
        try {
            const hasAuth = document.cookie.includes('sb-') || localStorage.getItem('supabase.auth.token');
            if (hasAuth) return;
        } catch { /* noop */ }

        // Check if suppressed
        try {
            const dismissed = localStorage.getItem(STORAGE_KEY);
            if (dismissed) {
                const elapsed = Date.now() - parseInt(dismissed, 10);
                if (elapsed < SUPPRESS_DAYS * 24 * 60 * 60 * 1000) return;
            }
        } catch { /* noop */ }

        let triggered = false;

        // Desktop: mouse leave
        const handleMouseLeave = (e: MouseEvent) => {
            if (e.clientY <= 5 && !triggered) {
                triggered = true;
                setIsOpen(true);
            }
        };

        // Mobile: 45s idle timer (less aggressive)
        const mobileTimer = setTimeout(() => {
            if (!triggered && window.innerWidth < 768) {
                triggered = true;
                setIsOpen(true);
            }
        }, 45000);

        document.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            document.removeEventListener('mouseleave', handleMouseLeave);
            clearTimeout(mobileTimer);
        };
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
        setStatus('loading');
        try {
            await fetch('/api/job-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, frequency: 'daily', newsletterOptIn }),
            });
        } catch { /* silent */ }
        setStatus('done');
        setTimeout(dismiss, 2000);
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
        >
            <div
                className="relative w-full max-w-md mx-4 rounded-2xl p-8"
                style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 0 40px rgba(45,212,191,0.1)',
                }}
            >
                {/* Close button */}
                <button
                    onClick={dismiss}
                    className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Close popup"
                >
                    <X size={18} />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(232,108,44,0.1))',
                        }}
                    >
                        <Bell size={24} style={{ color: '#2DD4BF' }} />
                    </div>
                </div>

                <h3 className="text-xl font-bold text-center mb-2" style={{ color: 'var(--text-primary)' }}>
                    Don&apos;t Miss Your Dream PMHNP Job
                </h3>
                <p className="text-sm text-center mb-6" style={{ color: 'var(--text-secondary)' }}>
                    Get the latest PMHNP positions delivered to your inbox daily. No spam — just jobs.
                </p>

                {status === 'done' ? (
                    <div className="text-center py-4">
                        <p className="text-base font-semibold" style={{ color: '#22c55e' }}>
                            ✓ You&apos;re subscribed!
                        </p>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                            Check your inbox for a welcome email.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                            }}
                            autoFocus
                        />
                        <label
                            className="flex items-center gap-2 cursor-pointer select-none"
                            style={{ padding: '4px 0' }}
                        >
                            <input
                                type="checkbox"
                                checked={newsletterOptIn}
                                onChange={(e) => setNewsletterOptIn(e.target.checked)}
                                className="w-4 h-4 rounded cursor-pointer accent-[#2DD4BF]"
                            />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                Also send me the monthly PMHNP newsletter
                            </span>
                        </label>
                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                            style={{
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                            }}
                        >
                            {status === 'loading' ? 'Subscribing...' : (
                                <>Get Daily Job Alerts <ArrowRight size={16} /></>
                            )}
                        </button>
                        <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                            Free forever. Unsubscribe anytime.
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
