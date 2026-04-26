'use client';

import Link from 'next/link';
import { Building2, Globe, Briefcase, ExternalLink } from 'lucide-react';

interface Company {
    id: string;
    name: string;
    description: string | null;
    website: string | null;
    logoUrl: string | null;
    jobCount: number;
    isVerified: boolean;
}

interface AboutEmployerProps {
    employerName: string;
    company?: Company | null;
    otherJobsCount?: number;
    companyWebsite?: string | null;
}

/* â•â•â• Clay card tokens â•â•â• */
const clayCard: React.CSSProperties = {
    backgroundColor: '#F7FBF8',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 14px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
    padding: '22px 24px',
    marginBottom: '16px',
};

const iconContainer: React.CSSProperties = {
    width: '48px', height: '48px',
    borderRadius: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: '#E0F2F1',
    boxShadow: '2px 2px 5px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.7)',
};

export default function AboutEmployer({
    employerName,
    company,
    otherJobsCount = 0,
    companyWebsite,
}: AboutEmployerProps) {
    // Resolve website: prefer company record, fall back to job-level data
    const websiteUrl = company?.website || companyWebsite || null;
    const displayName = company?.name || employerName;

    // Employer jobs link â€” uses the employer filter param which is handled by the filter system
    const employerLink = `/jobs?employer=${encodeURIComponent(displayName)}`;

    // If we have company data from the database
    if (company && company.description) {
        return (
            <section style={clayCard}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
                    {company.logoUrl ? (
                        <img
                            src={company.logoUrl}
                            alt={`${company.name} logo`}
                            style={{
                                width: '52px', height: '52px', objectFit: 'contain',
                                borderRadius: '14px',
                                border: '1px solid rgba(0,0,0,0.06)',
                                boxShadow: '2px 2px 5px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
                            }}
                        />
                    ) : (
                        <div style={iconContainer}>
                            <Building2 style={{ width: '24px', height: '24px', color: '#0D9488' }} />
                        </div>
                    )}
                    <div>
                        <h2 style={{
                            fontSize: '18px', fontWeight: 700,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: 'var(--text-primary)',
                            margin: 0, lineHeight: 1.3,
                        }}>
                            About {company.name}
                        </h2>
                        {company.isVerified && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                backgroundColor: '#CCFBF1', color: '#0F766E',
                                boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.5), 1px 1px 2px rgba(0,0,0,0.03)',
                                marginTop: '4px',
                            }}>
                                âœ“ Verified Employer
                            </span>
                        )}
                        {websiteUrl && (
                            <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    fontSize: '12px', color: '#0D9488', marginTop: '4px',
                                    textDecoration: 'none',
                                }}
                            >
                                <Globe style={{ width: '12px', height: '12px' }} />
                                {websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                <ExternalLink style={{ width: '10px', height: '10px' }} />
                            </a>
                        )}
                    </div>
                </div>

                <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                    {company.description}
                </p>

                {otherJobsCount > 0 && (
                    <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                        <Link
                            href={employerLink}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                fontSize: '13px', fontWeight: 600, color: '#0D9488',
                                textDecoration: 'none',
                            }}
                        >
                            <Briefcase style={{ width: '14px', height: '14px' }} />
                            View {otherJobsCount} other job{otherJobsCount > 1 ? 's' : ''} from {company.name}
                        </Link>
                    </div>
                )}
            </section>
        );
    }

    // Fallback: Generic employer section when no company data
    return (
        <section style={clayCard}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
                <div style={iconContainer}>
                    <Building2 style={{ width: '24px', height: '24px', color: '#0D9488' }} />
                </div>
                <div>
                    <h2 style={{
                        fontSize: '18px', fontWeight: 700,
                        fontFamily: 'var(--font-lora), Georgia, serif',
                        color: 'var(--text-primary)',
                        margin: 0,
                    }}>
                        About {employerName}
                    </h2>
                    {websiteUrl && (
                        <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                fontSize: '12px', color: '#0D9488', marginTop: '4px',
                                textDecoration: 'none',
                            }}
                        >
                            <Globe style={{ width: '12px', height: '12px' }} />
                            {websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            <ExternalLink style={{ width: '10px', height: '10px' }} />
                        </a>
                    )}
                </div>
            </div>

            <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                {employerName} is hiring for this PMHNP position. Psychiatric Mental Health Nurse Practitioners
                play a critical role in addressing the growing demand for mental health services across the United States.
                This employer is actively seeking qualified candidates to join their team.
            </p>

            {otherJobsCount > 0 && (
                <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <Link
                        href={employerLink}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            fontSize: '13px', fontWeight: 600, color: '#0D9488',
                            textDecoration: 'none',
                        }}
                    >
                        <Briefcase style={{ width: '14px', height: '14px' }} />
                        View {otherJobsCount} other job{otherJobsCount > 1 ? 's' : ''} from this employer
                    </Link>
                </div>
            )}
        </section>
    );
}
