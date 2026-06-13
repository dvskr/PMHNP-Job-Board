'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, ScrollText, LogIn } from 'lucide-react';

const REQUEST_TYPES: { value: string; label: string; description: string }[] = [
    {
        value: 'access',
        label: 'Access my data',
        description: 'Receive a copy of the personal information we hold about you.',
    },
    {
        value: 'deletion',
        label: 'Delete my account & data',
        description: 'Permanently remove your profile, applications, and uploaded files.',
    },
    {
        value: 'correction',
        label: 'Correct my data',
        description: 'Fix something inaccurate in your profile that you cannot edit yourself.',
    },
    {
        value: 'portability',
        label: 'Export my data (portability)',
        description: 'Download a structured copy you can move to another service.',
    },
    {
        value: 'object',
        label: 'Object to processing',
        description: 'Ask us to stop a specific use of your data (e.g. AI candidate matching).',
    },
    {
        value: 'restrict',
        label: 'Restrict processing',
        description: 'Pause use of your data while a dispute is resolved.',
    },
    {
        value: 'opt_out_sale',
        label: 'Opt out of sale or sharing (CCPA)',
        description: 'Stop sharing your information for cross-context behavioral advertising.',
    },
];

const JURISDICTIONS = [
    { value: '', label: '— Choose if you know —' },
    { value: 'gdpr', label: 'EEA / UK / Switzerland (GDPR / UK GDPR / FADP)' },
    { value: 'ccpa', label: 'California (CCPA / CPRA)' },
    { value: 'lgpd', label: 'Brazil (LGPD)' },
    { value: 'pipeda', label: 'Canada (PIPEDA)' },
    { value: 'other', label: 'Other / not sure' },
];

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};
const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '6px', display: 'block' };
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: '14px',
    borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.10)',
    background: '#F5F0EB',
    color: '#1A2E35',
    outline: 'none',
};
const helpStyle: React.CSSProperties = { fontSize: '12px', color: '#6B7F8A', marginTop: '6px' };
const pStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.7, marginBottom: '14px' };

export default function DataRequestPage() {
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState<{ id: string; respondBy: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    // The API verifies identity via the session (only the data subject can file
    // a request), so an anonymous visitor would fill the whole form and hit a
    // 401. Detect auth up-front: prefill the email for signed-in users, and show
    // a sign-in prompt + no-account email fallback for everyone else.
    const [authEmail, setAuthEmail] = useState<string | null>(null);
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        let active = true;
        fetch('/api/auth/me')
            .then((r) => r.json())
            .then((d) => { if (active) setAuthEmail(d?.id ? (d.email ?? null) : null); })
            .catch(() => { /* treat as anonymous */ })
            .finally(() => { if (active) setAuthChecked(true); });
        return () => { active = false; };
    }, []);

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        const fd = new FormData(e.currentTarget);
        try {
            const res = await fetch('/api/data-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: fd.get('email'),
                    fullName: (fd.get('fullName') as string)?.trim() || undefined,
                    type: fd.get('type'),
                    description: (fd.get('description') as string)?.trim() || undefined,
                    jurisdiction: (fd.get('jurisdiction') as string) || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to submit');
            }
            setSubmitted({ id: data.id, respondBy: data.respondBy });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '48px 16px 80px' }}>
            <article style={{ ...clayCard, maxWidth: '720px', margin: '0 auto', padding: '48px 40px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                    <ScrollText size={14} /> Privacy Rights
                </div>
                <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.4rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 12px 0', lineHeight: 1.15 }}>
                    Data Request
                </h1>
                <p style={pStyle}>
                    Use this form to exercise your privacy rights under GDPR, UK GDPR, CCPA / CPRA, LGPD, or
                    PIPEDA. We acknowledge requests immediately and respond within 30 days (or 45 for CCPA), in
                    line with the regulation that applies to you.
                </p>
                <p style={pStyle}>
                    For account self-service, you can also{' '}
                    <Link href="/settings" style={{ color: '#0D9488', textDecoration: 'underline' }}>edit your profile</Link>
                    , <Link href="/settings" style={{ color: '#0D9488', textDecoration: 'underline' }}>export your data</Link>, or
                    {' '}<Link href="/settings" style={{ color: '#0D9488', textDecoration: 'underline' }}>delete your account</Link>{' '}
                    directly. This form is for everything else.
                </p>

                {authChecked && !authEmail ? (
                    <div
                        style={{
                            ...clayCard,
                            padding: '24px',
                            background: '#EFF6FF',
                            border: '1px solid rgba(29,78,216,0.2)',
                            marginTop: '24px',
                        }}
                    >
                        <p style={{ ...pStyle, fontWeight: 700, color: '#1E3A8A', marginBottom: '8px' }}>
                            Please sign in to submit a request
                        </p>
                        <p style={{ ...pStyle, marginBottom: '16px' }}>
                            To protect your data, we verify your identity through your account before
                            acting on a privacy request. Sign in and we&apos;ll tie the request to the
                            right person automatically.
                        </p>
                        <Link
                            href="/login?redirectTo=/data-request"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '12px 22px', borderRadius: '14px',
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                color: '#fff', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
                            }}
                        >
                            <LogIn size={16} /> Sign in to continue
                        </Link>
                        <p style={{ ...helpStyle, marginTop: '16px' }}>
                            Don&apos;t have an account? You can still file a request by emailing{' '}
                            <a href="mailto:support@pmhnphiring.com?subject=Privacy%20Data%20Request" style={{ color: '#0D9488', textDecoration: 'underline' }}>support@pmhnphiring.com</a>{' '}
                            — we&apos;ll verify your identity another way.
                        </p>
                    </div>
                ) : submitted ? (
                    <div
                        style={{
                            ...clayCard,
                            padding: '24px',
                            background: '#ECFDF5',
                            border: '1px solid rgba(5,150,105,0.25)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            marginTop: '24px',
                        }}
                    >
                        <CheckCircle2 size={22} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <p style={{ ...pStyle, marginBottom: '6px', color: '#065F46', fontWeight: 700 }}>
                                Request received.
                            </p>
                            <p style={{ ...pStyle, marginBottom: '6px', color: '#065F46' }}>
                                Reference ID: <code style={{ fontFamily: 'var(--font-mono)', background: '#fff', padding: '2px 6px', borderRadius: '6px' }}>{submitted.id}</code>
                            </p>
                            <p style={{ ...pStyle, marginBottom: 0, color: '#065F46' }}>
                                We will respond by{' '}
                                <strong>{new Date(submitted.respondBy).toLocaleDateString(undefined, { dateStyle: 'long' })}</strong>.
                                If we need to verify your identity, we&apos;ll email you within 5 business days.
                            </p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '32px' }}>
                        <div>
                            <label htmlFor="email" style={labelStyle}>Email address *</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                maxLength={254}
                                defaultValue={authEmail ?? ''}
                                readOnly={!!authEmail}
                                style={{ ...inputStyle, ...(authEmail ? { background: '#EDF2EE', cursor: 'not-allowed' } : {}) }}
                            />
                            <p style={helpStyle}>
                                {authEmail
                                    ? 'This is your account email — we verify requests against it and reply here.'
                                    : 'Use the email associated with your account. We’ll reply here.'}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="fullName" style={labelStyle}>Full name (optional)</label>
                            <input id="fullName" name="fullName" type="text" maxLength={120} style={inputStyle} />
                        </div>

                        <div>
                            <label htmlFor="type" style={labelStyle}>What would you like us to do? *</label>
                            <select id="type" name="type" required style={inputStyle} defaultValue="">
                                <option value="" disabled>— Choose a request type —</option>
                                {REQUEST_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                            <p style={helpStyle}>
                                {/* Inline glossary so users don't have to hunt through the policy. */}
                                Not sure which fits? <Link href="/privacy#11" style={{ color: '#0D9488', textDecoration: 'underline' }}>See descriptions in the Privacy Policy</Link>.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="jurisdiction" style={labelStyle}>Where are you a resident? (optional)</label>
                            <select id="jurisdiction" name="jurisdiction" style={inputStyle} defaultValue="">
                                {JURISDICTIONS.map((j) => (
                                    <option key={j.value} value={j.value}>{j.label}</option>
                                ))}
                            </select>
                            <p style={helpStyle}>
                                Helps us pick the right SLA. We default to the strictest one if you skip this.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="description" style={labelStyle}>Anything else we should know? (optional)</label>
                            <textarea id="description" name="description" rows={5} maxLength={2000} style={{ ...inputStyle, resize: 'vertical', minHeight: '120px' }} />
                            <p style={helpStyle}>
                                E.g. specific records to delete, the alternate email you used, or which AI decision you want reviewed.
                            </p>
                        </div>

                        {error && (
                            <p style={{ color: '#B91C1C', fontSize: '13px', margin: 0 }}>{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                padding: '14px 24px',
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                color: '#fff',
                                fontSize: '15px',
                                fontWeight: 700,
                                border: '1px solid rgba(255,255,255,0.3)',
                                boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.25)',
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                opacity: submitting ? 0.7 : 1,
                                alignSelf: 'flex-start',
                            }}
                        >
                            {submitting ? 'Submitting…' : 'Submit Request'}
                        </button>

                        <p style={{ ...helpStyle, marginTop: '4px' }}>
                            By submitting you confirm the information is accurate and consent to us processing
                            it to respond to your request. Read our{' '}
                            <Link href="/privacy" style={{ color: '#0D9488', textDecoration: 'underline' }}>Privacy Policy</Link>.
                        </p>
                    </form>
                )}
            </article>
        </div>
    );
}
