'use client';

import { useState, useEffect } from 'react';
import { X, Shield } from 'lucide-react';
import { grantAllConsent, denyAllConsent } from '@/lib/analytics';

const STORAGE_KEY = 'pmhnp_cookie_consent';

/**
 * Cookie consent banner â€” Consent Mode v2 compliant.
 * 
 * On accept: calls grantAllConsent() which updates GA4 consent signals.
 * On deny: calls denyAllConsent() which keeps analytics in cookieless mode.
 * Stores choice in localStorage so it never shows again.
 */
export default function CookieConsent() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                // Delay to avoid layout shift on first render
                setTimeout(() => setShow(true), 1500);
            }
        } catch { /* noop */ }
    }, []);

    const accept = () => {
        setShow(false);
        grantAllConsent();
        try { localStorage.setItem(STORAGE_KEY, 'accepted'); } catch { /* noop */ }
    };

    const deny = () => {
        setShow(false);
        denyAllConsent();
        try { localStorage.setItem(STORAGE_KEY, 'denied'); } catch { /* noop */ }
    };

    if (!show) return null;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-[9990] p-4"
            style={{
                background: 'linear-gradient(to top, rgba(6,14,24,0.98), rgba(6,14,24,0.9))',
                backdropFilter: 'blur(8px)',
                borderTop: '1px solid var(--border-color)',
            }}
        >
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Shield size={18} style={{ color: '#2DD4BF', flexShrink: 0 }} />
                    <p>
                        We use cookies for analytics and to improve your experience.
                        By continuing, you agree to our{' '}
                        <a href="/privacy" className="underline" style={{ color: '#2DD4BF' }}>
                            Privacy Policy
                        </a>.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={deny}
                        className="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                        style={{
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-color)',
                        }}
                    >
                        Decline
                    </button>
                    <button
                        onClick={accept}
                        className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }}
                    >
                        Accept All
                    </button>
                    <button
                        onClick={deny}
                        className="p-2 rounded-lg transition-colors cursor-pointer"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
