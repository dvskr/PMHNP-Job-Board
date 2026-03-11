'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, X } from 'lucide-react';

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

export default function PushNotificationPrompt() {
    const [show, setShow] = useState(false);
    const [status, setStatus] = useState<'idle' | 'subscribing' | 'done'>('idle');

    useEffect(() => {
        // Don't show if: no VAPID key, no push support, already dismissed, or already subscribed
        if (!VAPID_KEY || typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        const dismissed = localStorage.getItem(DISMISS_KEY);
        if (dismissed) return;

        // Check if already subscribed
        navigator.serviceWorker.ready.then(reg => {
            reg.pushManager.getSubscription().then(sub => {
                if (!sub) {
                    // Show prompt after 15 seconds on the page
                    setTimeout(() => setShow(true), 15000);
                }
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
                bottom: 80,
                right: 16,
                zIndex: 9990,
                width: 320,
                maxWidth: 'calc(100vw - 32px)',
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                animation: 'slideInRight 0.3s ease',
            }}
        >
            <div style={{ padding: '16px 20px' }}>
                <button
                    onClick={handleDismiss}
                    aria-label="Dismiss"
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 4,
                    }}
                >
                    <X size={16} />
                </button>

                {status === 'done' ? (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 14, margin: 0 }}>
                            ✓ Notifications enabled!
                        </p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <Bell size={18} style={{ color: '#2DD4BF' }} />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                                    Get job notifications
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                                    Be the first to know about new PMHNP jobs
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleSubscribe}
                            disabled={status === 'subscribing'}
                            style={{
                                width: '100%', padding: '10px 16px', borderRadius: 10,
                                border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                color: '#fff', opacity: status === 'subscribing' ? 0.7 : 1,
                            }}
                        >
                            {status === 'subscribing' ? 'Enabling...' : 'Enable Notifications'}
                        </button>
                    </>
                )}
            </div>

            <style jsx>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
        </div>
    );
}
