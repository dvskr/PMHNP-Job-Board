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
}

export default function AboutEmployer({
    employerName,
    company,
    otherJobsCount = 0
}: AboutEmployerProps) {
    // If we have company data from the database
    if (company && company.description) {
        return (
            <section
                className="rounded-2xl p-5 md:p-6 lg:p-8 mb-4 lg:mb-6"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
                <div className="flex items-start gap-4 mb-4">
                    {company.logoUrl ? (
                        <img
                            src={company.logoUrl}
                            alt={`${company.name} logo`}
                            className="w-16 h-16 object-contain rounded-lg"
                            style={{ border: '1px solid var(--border-color)' }}
                        />
                    ) : (
                        <div
                            className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: 'var(--bg-tertiary)' }}
                        >
                            <Building2 className="w-8 h-8" style={{ color: '#2DD4BF' }} />
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            About {company.name}
                            {company.isVerified && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                    Verified Employer
                                </span>
                            )}
                        </h2>
                        {company.website && (
                            <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm flex items-center gap-1 mt-1 hover:underline"
                                style={{ color: '#2DD4BF' }}
                            >
                                <Globe className="w-3.5 h-3.5" />
                                {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                </div>

                <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                    {company.description}
                </p>

                {company.jobCount > 1 && (
                    <div className="pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                        <Link
                            href={`/jobs?employer=${encodeURIComponent(company.name)}`}
                            className="inline-flex items-center gap-2 font-medium hover:underline"
                            style={{ color: '#2DD4BF' }}
                        >
                            <Briefcase className="w-4 h-4" />
                            View all {company.jobCount} jobs from {company.name}
                        </Link>
                    </div>
                )}
            </section>
        );
    }

    // Fallback: Generic employer section when no company data
    return (
        <section
            className="rounded-2xl p-5 md:p-6 lg:p-8 mb-4 lg:mb-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        >
            <div className="flex items-start gap-4 mb-4">
                <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                    <Building2 className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        About {employerName}
                    </h2>
                </div>
            </div>

            <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                {employerName} is hiring for this PMHNP position. Psychiatric Mental Health Nurse Practitioners
                play a critical role in addressing the growing demand for mental health services across the United States.
                This employer is actively seeking qualified candidates to join their team.
            </p>

            {otherJobsCount > 0 && (
                <div className="pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <Link
                        href={`/jobs?employer=${encodeURIComponent(employerName)}`}
                        className="inline-flex items-center gap-2 font-medium hover:underline"
                        style={{ color: '#2DD4BF' }}
                    >
                        <Briefcase className="w-4 h-4" />
                        View {otherJobsCount} other job{otherJobsCount > 1 ? 's' : ''} from this employer
                    </Link>
                </div>
            )}
        </section>
    );
}
