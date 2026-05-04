'use client';

/**
 * Self-service opt-in toggle for the weekly AI recommendations digest email.
 *
 * Sibling to NewsletterPreference but for a different mailing — this one
 * is the AI-curated weekly digest of personalized job matches, not the
 * general newsletter. Each toggles independently.
 *
 * Reads + writes /api/user/email-preferences/ai-digest, which is hard-
 * scoped to the caller's own tenant. Optimistic update on toggle; reverts
 * on failure.
 */

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function AIRecommendationsToggle(): React.JSX.Element {
    const [optIn, setOptIn] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/user/email-preferences/ai-digest');
                if (!cancelled && res.ok) {
                    const data = await res.json() as { enabled: boolean };
                    setOptIn(!!data.enabled);
                }
            } catch {
                /* silent — leave default off */
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const toggle = async (): Promise<void> => {
        if (saving) return;
        const next = !optIn;
        setOptIn(next);
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/user/email-preferences/ai-digest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok) {
                setOptIn(!next); // revert
                setError('Failed to save preference. Please try again.');
            }
        } catch {
            setOptIn(!next);
            setError('Failed to save preference. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
            padding: '14px',
            background: 'linear-gradient(145deg, #F5F3FF, #EDE9FE)',
            border: '1px solid #DDD6FE',
            borderRadius: '12px',
            marginTop: '12px',
        }}>
            <Sparkles size={18} style={{ color: '#7C3AED', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#4C1D95', marginBottom: '4px' }}>
                    Weekly AI job match digest
                </div>
                <div style={{ fontSize: '13px', color: '#6B21A8', marginBottom: '10px', lineHeight: 1.4 }}>
                    Get a once-a-week email with the top jobs picked for your profile by our AI matcher.
                    Sent every Monday morning. {loaded && (optIn ? 'You\'re subscribed.' : 'Not subscribed.')}
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={optIn}
                        onChange={toggle}
                        disabled={!loaded || saving}
                        style={{ width: '16px', height: '16px', accentColor: '#7C3AED' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#4C1D95' }}>
                        {saving ? 'Saving…' : optIn ? 'Subscribed — uncheck to unsubscribe' : 'Subscribe to digest'}
                    </span>
                </label>
                {error && (
                    <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '6px' }}>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
