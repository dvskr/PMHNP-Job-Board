import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Building2 } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Sub-processors',
    description:
        'List of sub-processors used by PMHNP Hiring to operate the service, including the data shared, processing location, and DPA status. Updated as vendors change.',
    alternates: { canonical: 'https://pmhnphiring.com/sub-processors' },
    robots: { index: true, follow: true },
};

interface SubProcessor {
    name: string;
    purpose: string;
    dataShared: string;
    location: string;
    transferMechanism: string;
    dpa: string;
    privacyUrl: string;
}

const SUB_PROCESSORS: SubProcessor[] = [
    {
        name: 'Vercel, Inc.',
        purpose: 'Application hosting, edge functions, performance telemetry (Speed Insights)',
        dataShared: 'IP address, request metadata, performance vitals (only after consent)',
        location: 'United States',
        transferMechanism: 'Standard Contractual Clauses (SCCs)',
        dpa: 'https://vercel.com/legal/dpa',
        privacyUrl: 'https://vercel.com/legal/privacy-policy',
    },
    {
        name: 'Supabase, Inc.',
        purpose: 'Database, authentication, file storage (resumes, profile assets)',
        dataShared: 'Account credentials, profile data, application data, uploaded files',
        location: 'United States (us-east-1)',
        transferMechanism: 'Standard Contractual Clauses (SCCs)',
        dpa: 'https://supabase.com/dpa',
        privacyUrl: 'https://supabase.com/privacy',
    },
    {
        name: 'Stripe Payments Europe, Ltd.',
        purpose: 'Payment processing for employer job postings (hosted Checkout)',
        dataShared: 'Billing email, billing country, payment metadata. Card data is captured directly by Stripe and never touches our servers.',
        location: 'European Union & United States',
        transferMechanism: 'Standard Contractual Clauses (SCCs)',
        dpa: 'https://stripe.com/legal/dpa',
        privacyUrl: 'https://stripe.com/privacy',
    },
    {
        name: 'Resend, Inc.',
        purpose: 'Transactional email (account, application, alert) and marketing email (job alerts)',
        dataShared: 'Recipient email address, message content, delivery metadata',
        location: 'United States',
        transferMechanism: 'Standard Contractual Clauses (SCCs)',
        dpa: 'https://resend.com/legal/dpa',
        privacyUrl: 'https://resend.com/legal/privacy-policy',
    },
    {
        name: 'Google LLC (Google Analytics 4)',
        purpose: 'Aggregate usage analytics to understand how visitors use the site',
        dataShared:
            'Anonymized IP, user agent, page views, custom events. Loaded only after explicit analytics consent (Consent Mode v2). Ads/personalization signals stay disabled.',
        location: 'United States & global Google infrastructure',
        transferMechanism: 'Standard Contractual Clauses (SCCs); IP anonymization enabled',
        dpa: 'https://business.safety.google/processorterms/',
        privacyUrl: 'https://policies.google.com/privacy',
    },
    {
        name: 'Functional Software, Inc. (Sentry)',
        purpose: 'Application error monitoring (build-time wired; client init currently disabled)',
        dataShared: 'Stack traces, request URL, anonymized user identifier (when active)',
        location: 'United States',
        transferMechanism: 'Standard Contractual Clauses (SCCs)',
        dpa: 'https://sentry.io/legal/dpa/',
        privacyUrl: 'https://sentry.io/privacy/',
    },
];

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow:
        '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};
const h2Style: React.CSSProperties = { fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', marginTop: '40px' };
const h3Style: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: '#1A2E35', marginBottom: '8px' };
const pStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.75, marginBottom: '14px' };
const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#6B7F8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' };
const valueStyle: React.CSSProperties = { fontSize: '14px', color: '#1A2E35', lineHeight: 1.55 };

export default function SubProcessorsPage() {
    return (
        <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '48px 16px 80px' }}>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Sub-processors', url: 'https://pmhnphiring.com/sub-processors' },
            ]} />
            <article style={{ ...clayCard, maxWidth: '880px', margin: '0 auto', padding: '48px 40px' }}>
                <header style={{ marginBottom: '40px', paddingBottom: '32px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                        <Building2 size={14} /> Vendor Transparency
                    </div>
                    <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 12px 0', lineHeight: 1.15 }}>
                        Sub-<span style={{ color: '#1D4ED8' }}>processors</span>
                    </h1>
                    <p style={{ fontSize: '15px', color: '#6B7F8A', margin: 0, lineHeight: 1.6 }}>Last updated: 2026-04-30</p>
                </header>

                <p style={pStyle}>
                    To operate PMHNP Hiring we use a small set of third-party service providers (&quot;sub-processors&quot;).
                    Each sub-processor only receives the data necessary for its specific function and is bound by a Data
                    Processing Agreement that mirrors the protections in our{' '}
                    <Link href="/privacy" style={{ color: '#1D4ED8', textDecoration: 'underline' }}>Privacy Policy</Link>.
                </p>
                <p style={pStyle}>
                    We notify customers of material changes to this list at least 30 days before they take effect via
                    a banner on this page and (for active employer accounts) an email to the billing contact.
                </p>

                <h2 style={h2Style}>Active sub-processors</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {SUB_PROCESSORS.map((sp) => (
                        <section
                            key={sp.name}
                            style={{
                                ...clayCard,
                                padding: '24px',
                                boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.04)',
                            }}
                        >
                            <h3 style={h3Style}>{sp.name}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '12px' }}>
                                <div>
                                    <div style={labelStyle}>Purpose</div>
                                    <div style={valueStyle}>{sp.purpose}</div>
                                </div>
                                <div>
                                    <div style={labelStyle}>Data shared</div>
                                    <div style={valueStyle}>{sp.dataShared}</div>
                                </div>
                                <div>
                                    <div style={labelStyle}>Processing location</div>
                                    <div style={valueStyle}>{sp.location}</div>
                                </div>
                                <div>
                                    <div style={labelStyle}>Transfer mechanism</div>
                                    <div style={valueStyle}>{sp.transferMechanism}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
                                <a href={sp.dpa} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#1D4ED8', fontWeight: 600 }}>
                                    DPA →
                                </a>
                                <a href={sp.privacyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#1D4ED8', fontWeight: 600 }}>
                                    Privacy policy →
                                </a>
                            </div>
                        </section>
                    ))}
                </div>

                <h2 style={h2Style}>Cross-border transfers</h2>
                <p style={pStyle}>
                    Several of our sub-processors are based in the United States. Where personal data of residents of
                    the European Economic Area, the United Kingdom, or Switzerland is transferred outside its country
                    of origin, the transfer is governed by the European Commission&apos;s Standard Contractual Clauses
                    (SCCs) included in each sub-processor&apos;s DPA, supplemented by additional safeguards (encryption
                    in transit and at rest, IP anonymization for analytics, and access controls).
                </p>

                <h2 style={h2Style}>Questions or DPA requests</h2>
                <p style={pStyle}>
                    If you are an employer customer and need a counter-signed Data Processing Addendum, or you have
                    any question about this list, contact{' '}
                    <a href="mailto:privacy@pmhnphiring.com" style={{ color: '#1D4ED8', textDecoration: 'underline' }}>
                        privacy@pmhnphiring.com
                    </a>.
                </p>
            </article>
        </div>
    );
}
