import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Metadata } from 'next';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

interface Props {
    params: Promise<{ slug: string }>;
}

// Generate dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;

    const company = await prisma.company.findUnique({
        where: { normalizedName: slug },
        select: { name: true, description: true },
    });

    if (!company) return { title: 'Company Not Found' };

    return {
        title: `${company.name} PMHNP Jobs | PMHNP Hiring`,
        description: company.description
            ? `${company.description.substring(0, 150)}... View open PMHNP positions at ${company.name}.`
            : `Browse open Psychiatric Mental Health Nurse Practitioner (PMHNP) positions at ${company.name}. Find salary info, locations, and apply today.`,
        openGraph: {
            title: `${company.name} — PMHNP Jobs`,
            description: `Open PMHNP positions at ${company.name}`,
            url: `https://pmhnphiring.com/companies/${slug}`,
        },
        alternates: {
            canonical: `https://pmhnphiring.com/companies/${slug}`,
        },
    };
}

export default async function CompanyPage({ params }: Props) {
    const { slug } = await params;

    const company = await prisma.company.findUnique({
        where: { normalizedName: slug },
        include: {
            jobs: {
                where: {
                    isPublished: true,
                    expiresAt: { gt: new Date() },
                },
                orderBy: [
                    { isFeatured: 'desc' },
                    { createdAt: 'desc' },
                ],
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    location: true,
                    jobType: true,
                    mode: true,
                    displaySalary: true,
                    isFeatured: true,
                    isRemote: true,
                    createdAt: true,
                    city: true,
                    state: true,
                },
            },
        },
    });

    if (!company) {
        notFound();
    }

    const activeJobCount = company.jobs.length;

    return (
        <>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Companies', url: 'https://pmhnphiring.com/companies' },
                { name: company.name, url: `https://pmhnphiring.com/companies/${slug}` },
            ]} />

            <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="max-w-5xl mx-auto">

                    {/* Company Header */}
                    <div
                        className="rounded-2xl p-8 mb-8"
                        style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                    >
                        <div className="flex flex-col sm:flex-row items-start gap-6">
                            {/* Logo */}
                            <div
                                className="flex-shrink-0 w-20 h-20 rounded-xl flex items-center justify-center text-3xl font-bold"
                                style={{
                                    background: company.logoUrl
                                        ? `url(${company.logoUrl}) center/cover no-repeat`
                                        : 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                    color: '#fff',
                                }}
                            >
                                {!company.logoUrl && company.name.charAt(0).toUpperCase()}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                        {company.name}
                                    </h1>
                                    {company.isVerified && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            Verified
                                        </span>
                                    )}
                                </div>

                                {/* Meta row */}
                                <div className="flex flex-wrap items-center gap-4 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                    {company.website && (
                                        <a
                                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 hover:text-teal-600 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                                            </svg>
                                            Website
                                        </a>
                                    )}
                                    <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                                        </svg>
                                        {activeJobCount} active {activeJobCount === 1 ? 'position' : 'positions'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                        </svg>
                                        {company.jobCount} total jobs posted
                                    </span>
                                </div>

                                {/* Description */}
                                {company.description && (
                                    <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        {company.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Active Positions */}
                    <div className="mb-4">
                        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            Open Positions ({activeJobCount})
                        </h2>
                    </div>

                    {activeJobCount === 0 ? (
                        <div
                            className="rounded-lg p-12 text-center"
                            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                        >
                            <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
                                No open positions at {company.name} right now.
                            </p>
                            <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
                                Check back later or browse other PMHNP jobs.
                            </p>
                            <Link
                                href="/jobs"
                                className="inline-block bg-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
                            >
                                Browse All Jobs
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {company.jobs.map((job) => (
                                <Link
                                    key={job.id}
                                    href={job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`}
                                    className="block rounded-lg p-5 transition-all hover:shadow-md group"
                                    style={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: job.isFeatured ? '1.5px solid rgba(45,212,191,0.4)' : '1px solid var(--border-color)',
                                        textDecoration: 'none',
                                    }}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <h3 className="font-semibold text-base group-hover:text-teal-600 transition-colors" style={{ color: 'var(--text-primary)' }}>
                                                    {job.title}
                                                </h3>
                                                {job.isFeatured && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                                        Featured
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                <span>{job.location}</span>
                                                {job.jobType && <span>· {job.jobType}</span>}
                                                {job.isRemote && <span className="text-teal-600 font-medium">Remote</span>}
                                                {job.displaySalary && <span>· {job.displaySalary}</span>}
                                            </div>
                                        </div>
                                        <div className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                                            Posted {formatDate(job.createdAt.toISOString())}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Back Link */}
                    <div className="mt-8 text-center">
                        <Link
                            href="/jobs"
                            className="text-teal-600 hover:text-teal-800 font-medium text-sm hover:underline"
                        >
                            ← Browse All PMHNP Jobs
                        </Link>
                    </div>
                </div>
            </div>

            {/* JSON-LD Organization Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'Organization',
                        name: company.name,
                        url: company.website || `https://pmhnphiring.com/companies/${slug}`,
                        ...(company.logoUrl && { logo: company.logoUrl }),
                        ...(company.description && { description: company.description }),
                    }),
                }}
            />
        </>
    );
}
