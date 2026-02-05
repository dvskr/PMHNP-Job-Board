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
            <section className="bg-white shadow-md rounded-lg p-5 md:p-6 lg:p-8 mb-4 lg:mb-6">
                <div className="flex items-start gap-4 mb-4">
                    {company.logoUrl ? (
                        <img
                            src={company.logoUrl}
                            alt={`${company.name} logo`}
                            className="w-16 h-16 object-contain rounded-lg border border-gray-200"
                        />
                    ) : (
                        <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-8 h-8 text-blue-600" />
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-black flex items-center gap-2">
                            About {company.name}
                            {company.isVerified && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    Verified Employer
                                </span>
                            )}
                        </h2>
                        {company.website && (
                            <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1"
                            >
                                <Globe className="w-3.5 h-3.5" />
                                {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                </div>

                <p className="text-gray-700 leading-relaxed mb-4">
                    {company.description}
                </p>

                {company.jobCount > 1 && (
                    <div className="pt-4 border-t border-gray-200">
                        <Link
                            href={`/jobs?employer=${encodeURIComponent(company.name)}`}
                            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
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
        <section className="bg-white shadow-md rounded-lg p-5 md:p-6 lg:p-8 mb-4 lg:mb-6">
            <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-black">
                        About {employerName}
                    </h2>
                </div>
            </div>

            <p className="text-gray-700 leading-relaxed mb-4">
                {employerName} is hiring for this PMHNP position. Psychiatric Mental Health Nurse Practitioners
                play a critical role in addressing the growing demand for mental health services across the United States.
                This employer is actively seeking qualified candidates to join their team.
            </p>

            {otherJobsCount > 0 && (
                <div className="pt-4 border-t border-gray-200">
                    <Link
                        href={`/jobs?employer=${encodeURIComponent(employerName)}`}
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                    >
                        <Briefcase className="w-4 h-4" />
                        View {otherJobsCount} other job{otherJobsCount > 1 ? 's' : ''} from this employer
                    </Link>
                </div>
            )}
        </section>
    );
}
