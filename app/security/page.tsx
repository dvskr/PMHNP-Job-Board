import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import {
    ShieldCheck,
    Lock,
    Eye,
    AlertTriangle,
    FileLock2,
    Mail,
} from 'lucide-react';
import { brand } from '@/config/brand';

export const metadata: Metadata = {
    title: 'Security & Trust',
    description: `How ${brand.name} protects your data: encryption, sub-processors, consent, soft-delete, virus scanning, incident response, and compliance posture.`,
    alternates: { canonical: `${brand.baseUrl}/security` },
    robots: { index: true, follow: true },
};

interface PracticeProps {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}

function Practice({ icon, title, children }: PracticeProps) {
    return (
        <section style={{ display: 'flex', gap: '14px', marginTop: '28px' }}>
            <div
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ECFDF5',
                    color: '#059669',
                }}
            >
                {icon}
            </div>
            <div>
                <h2
                    style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#1A2E35',
                        margin: '4px 0 8px 0',
                    }}
                >
                    {title}
                </h2>
                <div style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.7 }}>{children}</div>
            </div>
        </section>
    );
}

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow:
        '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};

const linkStyle: React.CSSProperties = { color: '#0D9488', textDecoration: 'underline' };

export default function SecurityPage() {
    return (
        <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '48px 16px 80px' }}>
            <BreadcrumbSchema
                items={[
                    { name: 'Home', url: brand.baseUrl },
                    { name: 'Security', url: `${brand.baseUrl}/security` },
                ]}
            />
            <article style={{ ...clayCard, maxWidth: '820px', margin: '0 auto', padding: '48px 40px' }}>
                <header style={{ marginBottom: '8px' }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 14px',
                            background: '#ECFDF5',
                            color: '#059669',
                            borderRadius: '20px',
                            fontSize: '13px',
                            fontWeight: 700,
                            marginBottom: '16px',
                        }}
                    >
                        <ShieldCheck size={14} /> Trust Center
                    </div>
                    <h1
                        style={{
                            fontSize: 'clamp(2rem, 5vw, 2.75rem)',
                            fontWeight: 800,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35',
                            margin: '0 0 12px 0',
                            lineHeight: 1.15,
                        }}
                    >
                        Security & <span style={{ color: '#059669' }}>Trust</span>
                    </h1>
                    <p style={{ fontSize: '15px', color: '#6B7F8A', margin: 0, lineHeight: 1.6 }}>
                        Last updated: 2026-04-30
                    </p>
                </header>

                <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.75, marginTop: '32px' }}>
                    {brand.name} handles personal information that matters — resumes, contact details,
                    sometimes credentialing identifiers. This page explains how we protect that data,
                    which vendors we share it with, and what to do if you spot a security issue.
                    It is intentionally specific. If a customer or auditor wants more detail, the
                    documents linked below back every claim with code and policy references.
                </p>

                <Practice icon={<Lock size={20} />} title="Encryption everywhere">
                    All traffic is served over TLS 1.3 with HSTS enabled (`includeSubDomains; preload`).
                    Data at rest is encrypted by default in Supabase Postgres and Supabase Storage.
                    Resume files are stored in a private bucket and only accessed via signed URLs that
                    expire after one hour, so a leaked link cannot be replayed days later.
                </Practice>

                <Practice icon={<FileLock2 size={20} />} title="Resume & file safety">
                    Resume uploads are virus-scanned before they are written to storage. The scan
                    refuses executables, scripts, macro-laden Office files, password-protected
                    archives, and XML external-entity payloads. In the rare case the scanning
                    service itself is unreachable we accept the upload and log the gap, rather
                    than block legitimate users. Aggregate counters track scanner availability so
                    we know quickly if it stays offline.
                </Practice>

                <Practice icon={<Eye size={20} />} title="Privacy by default">
                    <p>
                        Analytics and advertising cookies default to <strong>denied</strong> and only
                        load after the visitor explicitly accepts. Vercel Speed Insights waits for
                        the same consent. Visitors from the EEA, UK, Switzerland, Canada, Brazil, and
                        Australia see a strict opt-in banner; visitors in implied-consent regions
                        keep one-click control via the &quot;Cookie Settings&quot; link in the footer
                        and the <Link href="/do-not-sell" style={linkStyle}>Do Not Sell or Share</Link>{' '}
                        page.
                    </p>
                    <p>
                        We honor the Global Privacy Control (Sec-GPC) and Do Not Track (DNT) browser
                        signals as a binding opt-out — no banner appears, no analytics fire.
                    </p>
                </Practice>

                <Practice icon={<ShieldCheck size={20} />} title="Authentication & access">
                    <p>
                        Authentication is handled by Supabase Auth. Session cookies are HttpOnly +
                        Secure + SameSite=Lax. Password resets are rate-limited to 3 requests per
                        hour per IP and respond identically whether or not the email is registered,
                        so attackers can&apos;t enumerate accounts.
                    </p>
                    <p>
                        Account deletion is soft-delete with a 30-day grace window — accidental
                        deletions are reversible. After the grace period, a daily cron hard-purges
                        the record and the matching Supabase Auth identity. Inactive accounts that
                        haven&apos;t logged in for 23 months receive a warning email and are then
                        soft-deleted; total dormancy lifecycle to hard delete is ~25 months.
                    </p>
                </Practice>

                <Practice icon={<AlertTriangle size={20} />} title="Incident response">
                    <p>
                        Every sensitive action (account deletion, data export, role change, DSAR
                        receipt, soft-delete purge) is recorded in an append-only audit log. We
                        operate a written incident-response runbook with a 72-hour notification
                        commitment that aligns with GDPR Art. 33 — privacy regulators get notified,
                        affected users receive a plain-language email, and a post-incident review is
                        published within 30 days.
                    </p>
                    <p>
                        Spotted something suspicious? Email{' '}
                        <a href={`mailto:${brand.email.security}`} style={linkStyle}>
                            {brand.email.security}
                        </a>
                        . We acknowledge within one business day.
                    </p>
                </Practice>

                <h2
                    style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#1A2E35',
                        marginTop: '40px',
                        marginBottom: '12px',
                    }}
                >
                    Compliance posture
                </h2>
                <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.75 }}>
                    We are committed to good privacy hygiene now and progressively to formal
                    attestations as the platform grows.
                </p>
                <div style={{ ...clayCard, padding: '20px 24px', marginTop: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#6B7F8A', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                                <th style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>Framework</th>
                                <th style={{ padding: '8px', fontWeight: 600 }}>Status</th>
                            </tr>
                        </thead>
                        <tbody style={{ color: '#1A2E35' }}>
                            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                <td style={{ padding: '12px 8px 12px 0' }}>GDPR / UK GDPR</td>
                                <td style={{ padding: '12px 8px' }}>
                                    Aligned. DPIA on file — see <Link href="/privacy" style={linkStyle}>Privacy Policy</Link> §11–§16.
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                <td style={{ padding: '12px 8px 12px 0' }}>CCPA / CPRA</td>
                                <td style={{ padding: '12px 8px' }}>
                                    Aligned. <Link href="/do-not-sell" style={linkStyle}>Opt-out endpoint</Link>{' '}
                                    + GPC honored.
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                <td style={{ padding: '12px 8px 12px 0' }}>PCI-DSS</td>
                                <td style={{ padding: '12px 8px' }}>
                                    SAQ-A. Card data captured by Stripe Checkout — never stored on our infrastructure.
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                <td style={{ padding: '12px 8px 12px 0' }}>SOC 2</td>
                                <td style={{ padding: '12px 8px' }}>
                                    In progress — Type 1 attestation planned when our first enterprise customer requires it. Most controls are already in place; see audit summary below.
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                <td style={{ padding: '12px 8px 12px 0' }}>HIPAA</td>
                                <td style={{ padding: '12px 8px' }}>
                                    Not applicable — we do not process Protected Health Information. Job seekers may voluntarily disclose health-related items in resumes; that content is not parsed for clinical data.
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: '12px 8px 12px 0' }}>CASL / PIPEDA / LGPD</td>
                                <td style={{ padding: '12px 8px' }}>
                                    Strict opt-in for marketing email; double opt-in on job alerts. Sub-processors disclosed.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h2
                    style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#1A2E35',
                        marginTop: '40px',
                        marginBottom: '12px',
                    }}
                >
                    Documents we publish
                </h2>
                <ul style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.85, paddingLeft: '20px' }}>
                    <li>
                        <Link href="/privacy" style={linkStyle}>Privacy Policy</Link> — what we collect, why, retention.
                    </li>
                    <li>
                        <Link href="/sub-processors" style={linkStyle}>Sub-processors</Link> — every vendor with DPA + privacy-policy links.
                    </li>
                    <li>
                        <Link href="/data-request" style={linkStyle}>Data Request</Link> — file access / deletion / correction requests.
                    </li>
                    <li>
                        <Link href="/do-not-sell" style={linkStyle}>Do Not Sell or Share</Link> — CCPA / CPRA one-click opt-out.
                    </li>
                    <li>
                        <Link href="/terms" style={linkStyle}>Terms of Service</Link>.
                    </li>
                </ul>
                <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.75, marginTop: '12px' }}>
                    Internal documents we&apos;ll share on request to enterprise prospects: incident-response
                    runbook, DPIA, and the 25-gap compliance audit with closure evidence.
                </p>

                <h2
                    style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#1A2E35',
                        marginTop: '40px',
                        marginBottom: '12px',
                    }}
                >
                    Reporting a vulnerability
                </h2>
                <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.75 }}>
                    If you believe you&apos;ve found a security vulnerability, please email{' '}
                    <a href={`mailto:${brand.email.security}`} style={linkStyle}>
                        {brand.email.security}
                    </a>{' '}
                    with reproduction steps and any affected URLs. We commit to:
                </p>
                <ul style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.85, paddingLeft: '20px' }}>
                    <li>Acknowledge receipt within one business day.</li>
                    <li>Provide a triage update within five business days.</li>
                    <li>Not pursue legal action against good-faith researchers who follow these guidelines.</li>
                    <li>Credit you publicly (if you wish) once the issue is resolved.</li>
                </ul>
                <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.75, marginTop: '12px' }}>
                    Please do not exfiltrate data, run automated denial-of-service, or test against
                    accounts that aren&apos;t yours. We do not currently run a paid bug bounty program;
                    we acknowledge contributions in writing.
                </p>

                <div
                    style={{
                        marginTop: '40px',
                        paddingTop: '24px',
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                        color: '#6B7F8A',
                        fontSize: '14px',
                    }}
                >
                    <Mail size={16} /> Privacy questions:&nbsp;
                    <a href={`mailto:${brand.email.privacy}`} style={linkStyle}>
                        {brand.email.privacy}
                    </a>
                    &nbsp;·&nbsp;Security reports:&nbsp;
                    <a href={`mailto:${brand.email.security}`} style={linkStyle}>
                        {brand.email.security}
                    </a>
                </div>
            </article>
        </div>
    );
}
