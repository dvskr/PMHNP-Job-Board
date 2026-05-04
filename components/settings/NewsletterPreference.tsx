'use client';

/**
 * Newsletter opt-in toggle for the candidate settings page.
 *
 * Self-fetches the current state from /api/newsletter/status so the parent
 * doesn't have to thread it through. Optimistic update on toggle; reverts
 * on failure. POSTs to /api/newsletter to persist (same endpoint the
 * dashboard previously called).
 *
 * Moved here from components/dashboard/DashboardContent.tsx — the toggle
 * lives in the settings/account surface now where the rest of the
 * preferences live.
 */

import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';

interface NewsletterPreferenceProps {
    email: string;
}

export default function NewsletterPreference({ email }: NewsletterPreferenceProps): React.JSX.Element {
    const [optIn, setOptIn] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!email) return;
        let cancelled = false;
        fetch(`/api/newsletter/status?email=${encodeURIComponent(email)}`)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((j: { optIn?: boolean }) => {
                if (!cancelled) {
                    setOptIn(!!j.optIn);
                    setLoaded(true);
                }
            })
            .catch(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
    }, [email]);

    const handleToggle = async () => {
        if (!email || saving) return;
        setSaving(true);
        const next = !optIn;
        setOptIn(next); // optimistic
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, optIn: next, source: 'settings_toggle' }),
            });
        } catch {
            setOptIn(!next); // revert
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '16px',
            padding: '14px 16px',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            background: 'var(--bg-primary)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    background: 'rgba(13,148,136,0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Send size={18} style={{ color: '#0D9488' }} />
                </div>
                <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Email Newsletter
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Get the latest jobs &amp; career tips
                    </p>
                </div>
            </div>

            <button
                type="button"
                onClick={handleToggle}
                disabled={!loaded || saving || !email}
                aria-pressed={optIn}
                aria-label={`Email newsletter ${optIn ? 'enabled' : 'disabled'} — click to toggle`}
                style={{
                    position: 'relative',
                    width: '48px', height: '26px',
                    borderRadius: '13px',
                    background: optIn ? '#0D9488' : '#E0EDE6',
                    border: '1px solid',
                    borderColor: optIn ? '#0D9488' : '#C5DDD5',
                    cursor: (!loaded || saving) ? 'not-allowed' : 'pointer',
                    opacity: loaded ? 1 : 0.55,
                    transition: 'all 0.25s ease',
                    boxShadow: optIn
                        ? '0 2px 6px rgba(13,148,136,0.3)'
                        : 'inset 2px 2px 4px rgba(0, 40, 30, 0.06), inset -1px -1px 3px rgba(255, 255, 255, 0.7)',
                    flexShrink: 0,
                }}
            >
                <div style={{
                    position: 'absolute', top: '3px', left: optIn ? '24px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#fff',
                    transition: 'all 0.25s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
                }} />
            </button>
        </div>
    );
}
