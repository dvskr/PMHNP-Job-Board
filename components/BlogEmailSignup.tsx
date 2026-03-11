'use client';

import { useState, useEffect } from 'react';

export default function BlogEmailSignup({ source }: { source: string }) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

    // F4: Mount mid-article signup into slot if it exists
    useEffect(() => {
        const slot = document.getElementById('mid-article-signup');
        if (!slot || slot.dataset.rendered === '1') return;
        slot.dataset.rendered = '1';

        slot.innerHTML = `
            <div style="margin:32px 0;padding:20px;border-radius:12px;background:linear-gradient(135deg,#f0fdfa,#ecfdf5);border:1px solid #99f6e4;text-align:center">
                <p style="font-weight:700;font-size:15px;color:#0f172a;margin:0 0 4px">📬 Enjoying this article?</p>
                <p style="font-size:13px;color:#475569;margin:0 0 12px">Get PMHNP career tips and job alerts in your inbox.</p>
                <form id="mid-signup-form" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                    <input id="mid-signup-email" type="email" required placeholder="you@email.com"
                        style="padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;width:220px;outline:none" />
                    <button type="submit"
                        style="padding:8px 18px;border-radius:8px;border:none;font-weight:700;font-size:13px;background:linear-gradient(135deg,#2DD4BF,#0D9488);color:#fff;cursor:pointer">
                        Subscribe
                    </button>
                </form>
                <p id="mid-signup-msg" style="font-size:12px;color:#2DD4BF;font-weight:600;margin:8px 0 0;display:none">✓ Subscribed!</p>
            </div>
        `;

        const form = document.getElementById('mid-signup-form');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('mid-signup-email') as HTMLInputElement;
            const msg = document.getElementById('mid-signup-msg');
            if (!input?.value) return;
            try {
                await fetch('/api/email-job', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: input.value, source: `blog_mid_${source}` }),
                });
                if (form) form.style.display = 'none';
                if (msg) msg.style.display = 'block';
            } catch { /* silent */ }
        });
    }, [source]);

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
