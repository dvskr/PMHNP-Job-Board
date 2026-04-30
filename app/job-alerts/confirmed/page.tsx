import { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Job alert confirmed',
    description: 'Your PMHNP job alert subscription has been confirmed.',
    robots: { index: false, follow: false },
};

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};

export default async function JobAlertConfirmedPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    const { status } = await searchParams;
    const ok = status === 'ok' || status === undefined;
    const headline = ok ? 'You’re all set' : status === 'invalid' ? 'Confirmation link invalid' : status === 'missing' ? 'Confirmation link incomplete' : 'Something went wrong';
    const message = ok
        ? 'Your job alert is now active. We’ll email matching PMHNP positions on your chosen schedule. You can change frequency or unsubscribe at any time from any alert email.'
        : status === 'invalid'
            ? 'This confirmation link is no longer valid. It may have already been used. If your alert isn’t firing, sign up again from the Job Alerts page and we’ll send a fresh link.'
            : status === 'missing'
                ? 'The link is missing the confirmation token. Please use the original link from the confirmation email.'
                : 'We hit an unexpected error. Please try the link in your confirmation email again, or sign up fresh.';

    return (
        <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '64px 16px 80px' }}>
            <article style={{ ...clayCard, maxWidth: '600px', margin: '0 auto', padding: '48px 40px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? '#ECFDF5' : '#FEF3C7' }}>
                    {ok ? <CheckCircle2 size={28} style={{ color: '#059669' }} /> : <AlertCircle size={28} style={{ color: '#92400E' }} />}
                </div>
                <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 12px 0', lineHeight: 1.2 }}>
                    {headline}
                </h1>
                <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.7, margin: '0 0 24px 0' }}>
                    {message}
                </p>
                <Link
                    href="/jobs"
                    style={{
                        display: 'inline-flex',
                        padding: '14px 28px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                        color: '#fff',
                        fontSize: '15px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.3)',
                        boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.25)',
                    }}
                >
                    Browse PMHNP jobs
                </Link>
            </article>
        </div>
    );
}
