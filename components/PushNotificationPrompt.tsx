'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const DISMISS_KEY = 'pmhnp_push_prompt_dismissed';
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Push notification prompt — only for logged-in users on 3rd+ visit.
 * Shows as a subtle bottom-left card to avoid competing with feedback (bottom-right).
 */
export default function PushNotificationPrompt() {
    const [show, setShow] = useState(false);
    const [status, setStatus] = useState<'idle' | 'subscribing' | 'done'>('idle');

    useEffect(() => {
        if (!VAPID_KEY || typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        // Already dismissed permanently
        if (localStorage.getItem(DISMISS_KEY)) return;

        // Only show on 3rd+ visit
        const visits = parseInt(localStorage.getItem('pmhnp_visit_count') || '0', 10);
        if (visits < 3) return;

        // Only show for logged-in users
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;

            // Check if already subscribed
            navigator.serviceWorker.ready.then(reg => {
                reg.pushManager.getSubscription().then(sub => {
                    if (!sub) {
                        // Show after 20 seconds (not immediately)
                        setTimeout(() => setShow(true), 20000);
                    }
                });
            });
        });

        // Register service worker
        navigator.serviceWorker.register('/push-sw.js').catch(() => { });
    }, []);

    const handleSubscribe = useCallback(async () => {
        setStatus('subscribing');
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource,
            });

            await fetch('/api/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: subscription.toJSON() }),
            });

            setStatus('done');
            setTimeout(() => {
                setShow(false);
                localStorage.setItem(DISMISS_KEY, '1');
            }, 2000);
        } catch {
            setShow(false);
            localStorage.setItem(DISMISS_KEY, '1');
        }
    }, []);

    const handleDismiss = () => {
        setShow(false);
        localStorage.setItem(DISMISS_KEY, '1');
    };

    if (!show) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 20,
                left: 16,
                zIndex: 9988,
                width: 300,
                maxWidth: 'calc(100vw - 32px)',
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                animation: 'pushSlideIn 0.3s ease',
            }}
        >
            <div style={{ padding: '14px 16px' }}>
                <button
                    onClick={handleDismiss}
                    aria-label="Dismiss"
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 4,
                    }}
                >
                    <X size={14} />
                </button>

                {status === 'done' ? (
                    <div style={{ textAlign: 'center', padding: '4px 0' }}>
                        <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 13, margin: 0 }}>
                            ✓ Notifications enabled!
                        </p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: 'rgba(45,212,191,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <Bell size={16} style={{ color: '#2DD4BF' }} />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                                    Get notified about new jobs
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                                    We&apos;ll only notify you about relevant PMHNP positions
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleDismiss}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid var(--border-color)', cursor: 'pointer',
                                    background: 'transparent', fontSize: 12, fontWeight: 600,
                                    color: 'var(--text-muted)',
                                }}
                            >
                                Not now
                            </button>
                            <button
                                onClick={handleSubscribe}
                                disabled={status === 'subscribing'}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 8,
                                    border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                                    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                    color: '#fff', opacity: status === 'subscribing' ? 0.7 : 1,
                                }}
                            >
                                {status === 'subscribing' ? 'Enabling...' : 'Enable'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <style jsx>{`
                @keyframes pushSlideIn {
                    from { opacity: 0; transform: translateX(-20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
