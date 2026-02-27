import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { MapPin, TrendingUp, Building2, Bell, MapPinned } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Job } from '@/lib/types';

// Force dynamic rendering - don't try to statically generate during build
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

// ─── State mappings ──────────────────────────────────────────────────────────

const STATE_CODES: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
    .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

// ─── Slug utilities ──────────────────────────────────────────────────────────

/**
 * Parse a city slug like "new-york-ny" into { cityName, stateName, stateCode }
 * The last segment (after the final hyphen) is the 2-letter state code.
 */
function parseCitySlug(slug: string): { cityName: string; stateName: string; stateCode: string } | null {
    const normalized = slug.toLowerCase().trim();

    // Extract the last 2-char segment as the state code
    const match = normalized.match(/^(.+)-([a-z]{2})$/);
    if (!match) return null;

    const [, citySlugPart, stateCodeRaw] = match;
    const stateCode = stateCodeRaw.toUpperCase();
    const stateName = CODE_TO_STATE[stateCode];

    if (!stateName) return null;

    // Convert city slug back to proper name (e.g. "new-york" → "New York")
    const cityName = citySlugPart
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return { cityName, stateName, stateCode };
}

/**
 * Build a city slug from city name and state code
 */
function buildCitySlug(cityName: string, stateCode: string): string {
    return `${cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stateCode.toLowerCase()}`;
}

/**
 * When a slug has no state code suffix (e.g. "virginia-beach" instead of "virginia-beach-va"),
 * look up the DB for any city that matches and return the canonical slug.
 */
async function resolveAmbiguousSlug(slug: string): Promise<string | null> {
    const normalized = slug.toLowerCase().trim();
    const cityName = normalized
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    // Find the first published job in a city matching this name
    const match = await prisma.job.findFirst({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            stateCode: { not: null },
        },
        select: { city: true, stateCode: true },
        orderBy: { createdAt: 'desc' },
    });

    if (match?.city && match?.stateCode) {
        return buildCitySlug(match.city, match.stateCode);
    }

    return null;
}

// ─── Data fetching ──────────────────────────────────────────────────────────

interface EmployerGroupResult {
    employer: string;
    _count: { employer: number };
}

interface ProcessedEmployer {
    name: string;
    count: number;
}

async function getCityJobs(cityName: string, stateName: string, stateCode: string) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        orderBy: [
            { isFeatured: 'desc' },
            { createdAt: 'desc' },
        ],
        take: 50,
    });

    return jobs;
}

async function getCityStats(cityName: string, stateName: string, stateCode: string) {
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
            normalizedMinSalary: { not: null },
            normalizedMaxSalary: { not: null },
        },
        _avg: {
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
        },
        _min: {
            normalizedMinSalary: true,
        },
        _max: {
            normalizedMaxSalary: true,
        },
    });

    const avgMinSalary = salaryData._avg.normalizedMinSalary || 0;
    const avgMaxSalary = salaryData._avg.normalizedMaxSalary || 0;
    const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000);
    const minSalary = salaryData._min.normalizedMinSalary
        ? Math.round(salaryData._min.normalizedMinSalary / 1000)
        : 0;
    const maxSalary = salaryData._max.normalizedMaxSalary
        ? Math.round(salaryData._max.normalizedMaxSalary / 1000)
        : 0;

    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        _count: {
            employer: true,
        },
        orderBy: {
            _count: {
                employer: 'desc',
            },
        },
        take: 5,
    });

    const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
        name: e.employer,
        count: e._count.employer,
    }));

    return {
        totalJobs,
        avgSalary,
        minSalary,
        maxSalary,
        topEmployers: processedEmployers,
    };
}

/**
 * Fetch other cities in the same state for related links
 */
async function getRelatedCities(
    stateName: string,
    stateCode: string,
    currentCity: string
): Promise<{ name: string; count: number; slug: string }[]> {
    const cityData = await prisma.job.groupBy({
        by: ['city'],
        where: {
            isPublished: true,
            city: { not: null },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        _count: {
            city: true,
        },
        orderBy: {
            _count: {
                city: 'desc',
            },
        },
        take: 12,
    });

    return cityData
        .filter(c => c.city && c.city.trim().length > 0 && c.city.toLowerCase() !== currentCity.toLowerCase())
        .slice(0, 8)
        .map(c => ({
            name: c.city as string,
            count: c._count.city,
            slug: buildCitySlug(c.city as string, stateCode),
        }));
}

// ─── Props & Metadata ────────────────────────────────────────────────────────

interface CityPageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
    try {
        const { slug } = await params;
        let parsed = parseCitySlug(slug);

        if (!parsed) {
            // Try resolving slug without state code
            const canonical = await resolveAmbiguousSlug(slug);
            if (canonical) parsed = parseCitySlug(canonical);
            if (!parsed) return { title: 'City Not Found' };
        }

        const { cityName, stateName, stateCode } = parsed;
        const stats = await getCityStats(cityName, stateName, stateCode);

        const salaryStr = stats.avgSalary > 0 ? ` | $${stats.avgSalary}k Avg` : '';
        const title = `PMHNP Jobs in ${cityName}, ${stateCode} | ${stats.totalJobs} Open Positions${salaryStr}`;
        const description = `Find ${stats.totalJobs} PMHNP jobs in ${cityName}, ${stateName}. Psychiatric NP positions with salary transparency. Remote, telehealth, and in-person roles updated daily.`;

        return {
            title,
            description,
            openGraph: {
                title: `${stats.totalJobs} PMHNP Jobs in ${cityName}, ${stateCode}${salaryStr}`,
                description,
                type: 'website',
                images: [{
                    url: `/api/og?type=page&title=${encodeURIComponent(`PMHNP Jobs in ${cityName}, ${stateCode}`)}&subtitle=${encodeURIComponent(`${stats.totalJobs} psychiatric NP positions`)}`,
                    width: 1200,
                    height: 630,
                    alt: `PMHNP Jobs in ${cityName}, ${stateCode}`,
                }],
            },
            alternates: {
                canonical: `https://pmhnphiring.com/jobs/city/${slug}`,
            },
            // Noindex for thin pages with fewer than 10 jobs
            ...(stats.totalJobs < 10 && {
                robots: {
                    index: false,
                    follow: true,
                },
            }),
        };
    } catch (error) {
        console.error('Error generating city metadata:', error);
        return {
            title: 'PMHNP Jobs by City',
            description: 'Find psychiatric mental health nurse practitioner jobs by city.',
        };
    }
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default async function CityJobsPage({ params }: CityPageProps) {
    const { slug } = await params;
    let parsed = parseCitySlug(slug);

    if (!parsed) {
        // Try resolving slug without state code → redirect to canonical URL
        const canonical = await resolveAmbiguousSlug(slug);
        if (canonical) {
            redirect(`/jobs/city/${canonical}`);
        }
        notFound();
    }

    const { cityName, stateName, stateCode } = parsed;

    // Fetch all data in parallel
    const [jobs, stats, relatedCities] = await Promise.all([
        getCityJobs(cityName, stateName, stateCode),
        getCityStats(cityName, stateName, stateCode),
        getRelatedCities(stateName, stateCode, cityName),
    ]);

    const stateSlug = stateName.toLowerCase().replace(/\s+/g, '-');

    const breadcrumbItems = [
        { label: 'Home', href: '/' },
        { label: 'Jobs', href: '/jobs' },
        { label: stateName, href: `/jobs/state/${stateSlug}` },
        { label: cityName },
    ];

    const salaryRange = stats.minSalary > 0 && stats.maxSalary > 0
        ? `$${stats.minSalary}k–$${stats.maxSalary}k`
        : null;

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
            {/* Breadcrumb Schema */}
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: stateName, url: `https://pmhnphiring.com/jobs/state/${stateSlug}` },
                { name: cityName, url: `https://pmhnphiring.com/jobs/city/${slug}` }
            ]} />

            {/* Visual Breadcrumbs */}
            <div className="container mx-auto px-4 pt-4">
                <Breadcrumbs items={breadcrumbItems} />
            </div>

            {/* Hero Section */}
            <section className="bg-gradient-to-r from-teal-600 to-teal-700 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <MapPin className="h-8 w-8" />
                            <span className="text-lg font-medium">{cityName}, {stateCode}</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            PMHNP Jobs in {cityName}, {stateName}
                        </h1>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">
                            {stats.totalJobs} psychiatric mental health nurse practitioner {stats.totalJobs === 1 ? 'position' : 'positions'} in {cityName}
                        </p>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-teal-100">Open Positions</div>
                            </div>
                            {stats.avgSalary > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                                    <div className="text-sm text-teal-100">Avg. Salary</div>
                                </div>
                            )}
                            {stats.topEmployers.length > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                                    <div className="text-sm text-teal-100">Top Employers</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-7xl mx-auto">
                    {/* City Intro */}
                    <div className="mb-8 md:mb-12">
                        <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-gray-200 dark:border-[var(--border-color)] p-6 md:p-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">
                                About PMHNP Jobs in {cityName}, {stateName}
                            </h2>
                            <p className="text-gray-600 leading-relaxed mb-4">
                                Find PMHNP jobs in {cityName}, {stateName}. Browse {stats.totalJobs} psychiatric
                                mental health nurse practitioner {stats.totalJobs === 1 ? 'position' : 'positions'} including remote,
                                telehealth, inpatient, and outpatient roles.
                                {salaryRange && ` ${cityName} PMHNPs earn between ${salaryRange} per year.`}
                            </p>
                            <p className="text-gray-600 leading-relaxed">
                                Whether you&apos;re seeking full-time, part-time, or travel positions, {cityName} offers
                                diverse opportunities across various healthcare settings. New positions are added daily.
                            </p>
                        </div>
                    </div>

                    {/* Related Cities */}
                    {relatedCities.length > 0 && (
                        <div className="mb-8 md:mb-12">
                            <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-gray-200 dark:border-[var(--border-color)] p-6 md:p-8">
                                <div className="flex items-center gap-3 mb-4">
                                    <MapPinned className="h-6 w-6 text-teal-600" />
                                    <h2 className="text-2xl font-bold text-gray-900">
                                        More Cities in {stateName}
                                    </h2>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {relatedCities.map((city) => (
                                        <Link
                                            key={city.slug}
                                            href={`/jobs/city/${city.slug}`}
                                            className="flex items-center justify-between p-3 bg-gray-50 hover:bg-teal-50 dark:bg-[var(--bg-tertiary)] dark:hover:bg-[rgba(20,184,166,0.1)] rounded-lg border border-gray-200 dark:border-[var(--border-color)] hover:border-teal-300 dark:hover:border-[rgba(20,184,166,0.3)] transition-colors"
                                        >
                                            <span className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] truncate">{city.name}</span>
                                            <span className="text-xs text-teal-600 font-semibold ml-2">
                                                {city.count}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid lg:grid-cols-4 gap-8">
                        {/* Main Content */}
                        <div className="lg:col-span-3">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-[var(--text-primary)]">
                                    All Jobs ({stats.totalJobs})
                                </h2>
                                <Link
                                    href={`/jobs/state/${stateSlug}`}
                                    className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                                >
                                    All {stateName} Jobs →
                                </Link>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl border border-gray-200 dark:border-[var(--border-color)] p-8">
                                    <div className="text-center mb-8">
                                        <MapPin className="h-12 w-12 text-teal-500 mx-auto mb-4" />
                                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                                            No PMHNP Jobs in {cityName} Right Now
                                        </h3>
                                        <p className="text-gray-600 max-w-md mx-auto">
                                            We don&apos;t have any active positions in {cityName} at the moment,
                                            but new jobs are added daily. Here are some alternatives:
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Link
                                            href={`/jobs/state/${stateSlug}`}
                                            className="flex flex-col p-4 bg-teal-50 hover:bg-teal-100 dark:bg-[rgba(20,184,166,0.08)] dark:hover:bg-[rgba(20,184,166,0.15)] rounded-lg border border-teal-200 dark:border-[rgba(20,184,166,0.25)] transition-colors"
                                        >
                                            <span className="font-semibold text-teal-900 dark:text-teal-300">📍 All {stateName} Jobs</span>
                                            <span className="text-sm text-teal-700 dark:text-teal-400 mt-1">Browse all positions statewide</span>
                                        </Link>
                                        <Link
                                            href="/jobs/remote"
                                            className="flex flex-col p-4 bg-purple-50 hover:bg-purple-100 dark:bg-[rgba(147,51,234,0.08)] dark:hover:bg-[rgba(147,51,234,0.15)] rounded-lg border border-purple-200 dark:border-[rgba(147,51,234,0.25)] transition-colors"
                                        >
                                            <span className="font-semibold text-purple-900 dark:text-purple-300">🏠 Remote PMHNP Jobs</span>
                                            <span className="text-sm text-purple-700 dark:text-purple-400 mt-1">Work from anywhere with telehealth positions</span>
                                        </Link>
                                        <Link
                                            href={`/job-alerts?location=${encodeURIComponent(cityName + ', ' + stateCode)}`}
                                            className="flex flex-col p-4 bg-green-50 hover:bg-green-100 dark:bg-[rgba(16,185,129,0.08)] dark:hover:bg-[rgba(16,185,129,0.15)] rounded-lg border border-green-200 dark:border-[rgba(16,185,129,0.25)] transition-colors"
                                        >
                                            <span className="font-semibold text-green-900 dark:text-emerald-300">🔔 Set Up Job Alerts</span>
                                            <span className="text-sm text-green-700 dark:text-emerald-400 mt-1">Get notified when {cityName} jobs are posted</span>
                                        </Link>
                                        <Link
                                            href="/jobs"
                                            className="flex flex-col p-4 bg-blue-50 hover:bg-blue-100 dark:bg-[rgba(59,130,246,0.08)] dark:hover:bg-[rgba(59,130,246,0.15)] rounded-lg border border-blue-200 dark:border-[rgba(59,130,246,0.25)] transition-colors"
                                        >
                                            <span className="font-semibold text-blue-900 dark:text-blue-300">🔍 View All PMHNP Jobs</span>
                                            <span className="text-sm text-blue-700 dark:text-blue-400 mt-1">Browse all jobs nationwide</span>
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                                    {jobs.map((job: Job) => (
                                        <JobCard key={job.id} job={job} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="lg:col-span-1">
                            {/* Job Alert CTA */}
                            <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">
                                    Get {cityName} Job Alerts
                                </h3>
                                <p className="text-sm text-teal-100 mb-4">
                                    Be the first to know about new PMHNP positions in {cityName}, {stateCode}.
                                </p>
                                <Link
                                    href={`/job-alerts?location=${encodeURIComponent(cityName + ', ' + stateCode)}`}
                                    className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                                >
                                    Create Alert
                                </Link>
                            </div>

                            {/* Top Employers */}
                            {stats.topEmployers.length > 0 && (
                                <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-gray-200 dark:border-[var(--border-color)] p-6 mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Building2 className="h-5 w-5 text-teal-600" />
                                        <h3 className="font-bold text-gray-900">Top Employers in {cityName}</h3>
                                    </div>
                                    <ul className="space-y-3">
                                        {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                                            <li key={index} className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700 truncate flex-1">
                                                    {employer.name}
                                                </span>
                                                <span className="text-sm font-medium text-teal-600 ml-2">
                                                    {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Salary Insights */}
                            {stats.avgSalary > 0 && (
                                <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-gray-200 dark:border-[var(--border-color)] p-6 mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp className="h-5 w-5 text-green-600" />
                                        <h3 className="font-bold text-gray-900">Salary Insights</h3>
                                    </div>
                                    <div className="mb-4">
                                        <div className="text-3xl font-bold text-gray-900">
                                            ${stats.avgSalary}k
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            Average annual salary
                                        </div>
                                    </div>
                                    {salaryRange && (
                                        <div className="mb-4">
                                            <div className="text-lg font-semibold text-gray-800">
                                                {salaryRange}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                Salary range
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-500">
                                        Based on PMHNP positions in {cityName}, {stateCode} with salary data.
                                    </p>
                                    <Link href="/salary-guide" className="text-sm text-teal-600 hover:text-teal-700 mt-2 inline-block">
                                        View full 2026 Salary Guide →
                                    </Link>
                                </div>
                            )}

                            {/* Back to State */}
                            <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-gray-200 dark:border-[var(--border-color)] p-6">
                                <h3 className="font-bold text-gray-900 mb-3">Quick Links</h3>
                                <ul className="space-y-2 text-sm">
                                    <li>
                                        <Link href={`/jobs/state/${stateSlug}`} className="text-teal-600 hover:text-teal-700">
                                            All PMHNP Jobs in {stateName} →
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/jobs" className="text-teal-600 hover:text-teal-700">
                                            View All PMHNP Jobs →
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/jobs/remote" className="text-teal-600 hover:text-teal-700">
                                            Remote PMHNP Jobs →
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/salary-guide" className="text-teal-600 hover:text-teal-700">
                                            2026 Salary Guide →
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Related Resources */}
                    <section className="mt-12 mb-8">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-[var(--text-primary)] mb-4">Explore More PMHNP Opportunities</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Link href={`/jobs/state/${stateSlug}`} className="block p-4 bg-white dark:bg-[var(--bg-secondary)] border border-gray-200 dark:border-[var(--border-color)] rounded-lg hover:border-teal-300 dark:hover:border-[rgba(20,184,166,0.3)] hover:shadow-sm transition-all">
                                <h3 className="font-semibold text-teal-600 dark:text-[#2DD4BF]">📍 All {stateName} Jobs</h3>
                                <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mt-1">Browse all PMHNP positions across {stateName}.</p>
                            </Link>

                            <Link href="/salary-guide" className="block p-4 bg-white dark:bg-[var(--bg-secondary)] border border-gray-200 dark:border-[var(--border-color)] rounded-lg hover:border-teal-300 dark:hover:border-[rgba(20,184,166,0.3)] hover:shadow-sm transition-all">
                                <h3 className="font-semibold text-teal-600 dark:text-[#2DD4BF]">💰 2026 PMHNP Salary Guide</h3>
                                <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mt-1">See how {cityName} compares to other cities and states.</p>
                            </Link>

                            <Link href="/jobs/remote" className="block p-4 bg-white dark:bg-[var(--bg-secondary)] border border-gray-200 dark:border-[var(--border-color)] rounded-lg hover:border-teal-300 dark:hover:border-[rgba(20,184,166,0.3)] hover:shadow-sm transition-all">
                                <h3 className="font-semibold text-teal-600 dark:text-[#2DD4BF]">🏠 Remote PMHNP Jobs</h3>
                                <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mt-1">Work from anywhere with telehealth and remote positions.</p>
                            </Link>

                            <Link href="/jobs/new-grad" className="block p-4 bg-white dark:bg-[var(--bg-secondary)] border border-gray-200 dark:border-[var(--border-color)] rounded-lg hover:border-teal-300 dark:hover:border-[rgba(20,184,166,0.3)] hover:shadow-sm transition-all">
                                <h3 className="font-semibold text-teal-600 dark:text-[#2DD4BF]">🎓 New Grad PMHNP Jobs</h3>
                                <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mt-1">Entry-level positions for newly certified psychiatric NPs.</p>
                            </Link>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
