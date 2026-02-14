'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Mail, X, Loader2, CheckCircle } from 'lucide-react';

const DISMISS_KEY = 'pmhnp_sticky_bar_dismissed';

export default function StickyEmailBar() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    // Pages where the bar should NOT appear
    const excludedPaths = ['/admin', '/employer', '/dashboard', '/settings', '/login', '/signup'];
    const isExcluded = excludedPaths.some(p => pathname?.startsWith(p));

    useEffect(() => {
        if (isExcluded) return;
        // Don't show if dismissed
        if (localStorage.getItem(DISMISS_KEY) === 'true') return;
        // Don't show if already subscribed
        if (localStorage.getItem('pmhnp_salary_unlocked') === 'true') return;

        const handleScroll = () => {
            const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
            if (scrollPercent > 0.35) {
                setVisible(true);
                window.removeEventListener('scroll', handleScroll);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isExcluded]);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, 'true');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

        setStatus('loading');
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, source: 'sticky_bar' }),
            });
        } catch { /* silent */ }
        setStatus('done');
        localStorage.setItem(DISMISS_KEY, 'true');
        setTimeout(dismiss, 2000);
    };

    if (!visible) return null;

    return (
        <div
            className="fixed bottom-0 inset-x-0 z-[55] lg:hidden animate-fade-in"
            style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                borderTop: '1px solid rgba(45,212,191,0.3)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
            }}
        >
            <div className="px-4 py-3 safe-bottom">
                {status === 'done' ? (
                    <div className="flex items-center justify-center gap-2 text-sm" style={{ color: '#2DD4BF' }}>
                        <CheckCircle size={16} />
                        <span className="font-medium">You&apos;re subscribed!</span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-white flex items-center gap-1.5">
                                <Mail size={14} style={{ color: '#2DD4BF' }} />
                                Never miss a PMHNP opportunity
                            </p>
                            <button onClick={dismiss} className="text-gray-400 p-1">
                                <X size={14} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                className="flex-1 px-3 py-2 rounded-lg text-sm bg-white/10 text-white placeholder:text-gray-400 border border-white/10 outline-none focus:border-teal-400"
                            />
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
                            >
                                {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 'Go'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
