'use client';

import { useState } from 'react';

export default function BlogEmailSignup({ source }: { source: string }) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');




    if (status === 'done') {
        return <p style={{ fontSize: '14px', color: '#2DD4BF', fontWeight: 700 }}>✓ You&apos;re subscribed!</p>;
    }

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                if (!email) return;
                setStatus('loading');
                try {
                    await fetch('/api/email-job', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, source }),
                    });
                    setStatus('done');
                } catch {
                    setStatus('error');
                }
            }}
            style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}
        >
            <input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                    padding: '10px 14px', borderRadius: '8px',
                    border: '1px solid #d1d5db', fontSize: '13px',
                    width: '240px', outline: 'none',
                }}
            />
            <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                    padding: '10px 20px', borderRadius: '8px',
                    border: 'none', fontWeight: 700, fontSize: '13px',
                    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                    color: '#fff', cursor: 'pointer',
                    opacity: status === 'loading' ? 0.7 : 1,
                }}
            >
                {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
            </button>
            {status === 'error' && (
                <p style={{ width: '100%', fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
                    Something went wrong. Try again.
                </p>
            )}
        </form>
    );
}
