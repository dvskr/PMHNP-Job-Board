import { Metadata } from 'next';
import Link from 'next/link';
import { Building, Briefcase, DollarSign, Clock, Shield, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap, Calendar, Plane } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';

// Force dynamic rendering - don't try to statically generate during build
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

// Type definition for Prisma groupBy result
interface EmployerGroupResult {
    employer: string;
    _count: { employer: number };
}

// Type definition for processed/rendered data
interface ProcessedEmployer {
    name: string;
    count: number;
}

/**
 * Fetch inpatient PMHNP jobs with pagination
 */
async function getInpatientJobs(skip: number = 0, take: number = 20) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'inpatient', mode: 'insensitive' } },
                { title: { contains: 'in-patient', mode: 'insensitive' } },
                { title: { contains: 'acute care', mode: 'insensitive' } },
                { title: { contains: 'hospital', mode: 'insensitive' } },
                { description: { contains: 'inpatient', mode: 'insensitive' } },
            ],
        },
        orderBy: [
            { isFeatured: 'desc' },
            { qualityScore: 'desc' },
            { originalPostedAt: 'desc' },
            { createdAt: 'desc' },
        ],
        skip,
        take,
    });

    return jobs;
}

/**
 * Fetch inpatient job statistics
 */
async function getInpatientStats() {
    // Total inpatient jobs
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'inpatient', mode: 'insensitive' } },
                { title: { contains: 'in-patient', mode: 'insensitive' } },
                { title: { contains: 'acute care', mode: 'insensitive' } },
                { title: { contains: 'hospital', mode: 'insensitive' } },
                { description: { contains: 'inpatient', mode: 'insensitive' } },
            ],
        },
    });

    // Average salary for inpatient positions
    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'inpatient', mode: 'insensitive' } },
                { title: { contains: 'in-patient', mode: 'insensitive' } },
                { title: { contains: 'acute care', mode: 'insensitive' } },
                { title: { contains: 'hospital', mode: 'insensitive' } },
                { description: { contains: 'inpatient', mode: 'insensitive' } },
            ],
            normalizedMinSalary: { not: null },
            normalizedMaxSalary: { not: null },
        },
        _avg: {
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
        },
    });

    const avgMinSalary = salaryData._avg.normalizedMinSalary || 0;
    const avgMaxSalary = salaryData._avg.normalizedMaxSalary || 0;
    const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000);

    // Top employers hiring for inpatient positions
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'inpatient', mode: 'insensitive' } },
                { title: { contains: 'in-patient', mode: 'insensitive' } },
                { title: { contains: 'acute care', mode: 'insensitive' } },
                { title: { contains: 'hospital', mode: 'insensitive' } },
                { description: { contains: 'inpatient', mode: 'insensitive' } },
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
        take: 8,
    });

    // Process with explicit typing
    const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
        name: e.employer,
        count: e._count.employer,
    }));

    return {
        totalJobs,
        avgSalary,
        topEmployers: processedEmployers,
    };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const [stats, params] = await Promise.all([getInpatientStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Inpatient PMHNP Jobs — Hospital & Acute Care Psych NP ($140K-200K)`,
        description: `Find ${stats.totalJobs} inpatient PMHNP jobs paying $140K-$200K+. Hospital-based psychiatric nurse practitioner positions in acute care, crisis stabilization, and psychiatric units. Apply to inpatient psych NP jobs today.`,
        keywords: ['inpatient pmhnp', 'inpatient pmhnp jobs', 'hospital pmhnp', 'acute care pmhnp', 'psychiatric hospital nurse practitioner'],
        openGraph: {
            title: `${stats.totalJobs} Inpatient PMHNP Jobs — Hospital Psych NP`,
            description: 'Browse inpatient psychiatric mental health nurse practitioner positions. Hospital-based, acute care, and crisis stabilization roles.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Inpatient PMHNP Jobs`)}&subtitle=${encodeURIComponent('Hospital & acute care psychiatric NP positions')}`,
                width: 1200,
                height: 630,
                alt: 'Inpatient PMHNP Jobs',
            }],
        },
        alternates: {
            canonical: 'https://pmhnphiring.com/jobs/inpatient',
        },
        // Prevent Google from indexing paginated variants as separate pages
        ...(page > 1 && {
            robots: {
                index: false,
                follow: true,
            },
        }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

/**
 * Inpatient PMHNP jobs page
 */
export default async function InpatientJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getInpatientJobs(skip, limit),
        getInpatientStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {/* Breadcrumb Schema */}
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Inpatient", url: "https://pmhnphiring.com/jobs/inpatient" }
            ]} />

            {/* Hero Section */}
            <section className="bg-teal-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Building className="h-8 w-8" />
                            <Shield className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Inpatient PMHNP Jobs
                        </h1>
                        <p className="text-sm text-teal-200 text-center mt-2 mb-4">
                            Last Updated: March 2026 | Hospital & acute care PMHNP positions
                        </p>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">
                            Discover {stats.totalJobs} inpatient psychiatric nurse practitioner positions in hospitals and acute care settings
                        </p>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-teal-100">Inpatient Positions</div>
                            </div>
                            {stats.avgSalary > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                                    <div className="text-sm text-teal-100">Avg. Salary</div>
                                </div>
                            )}
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                                <div className="text-sm text-teal-100">Hiring Organizations</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-7xl mx-auto">
                    {/* Benefits Section */}
                    <div className="mb-8 md:mb-12">
                        <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                                Why Work as an Inpatient PMHNP?
                            </h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Higher Base Pay</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Inpatient PMHNPs typically earn $140K-$200K+ annually due to the demanding nature and critical skills required for acute psychiatric care.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <Shield className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Structured Environment</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Hospital settings offer built-in support teams, established protocols, and access to multidisciplinary care teams including psychiatrists and social workers.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <Clock className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Defined Schedules</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Many inpatient roles offer predictable shift-based schedules (7-on/7-off, 3x12s) with no after-hours patient calls compared to outpatient settings.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8">
                        {/* Main Content */}
                        <div className="lg:col-span-3">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    All Inpatient Positions ({stats.totalJobs})
                                </h2>
                                <Link
                                    href="/jobs"
                                    className="text-sm font-medium hover:opacity-80 transition-opacity"
                                    style={{ color: 'var(--color-primary)' }}
                                >
                                    View All Jobs →
                                </Link>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Building className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                        No inpatient jobs available
                                    </h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                                        We don&apos;t have any active inpatient PMHNP positions right now. Check back soon!
                                    </p>
                                    <Link
                                        href="/jobs"
                                        className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                                        style={{ backgroundColor: 'var(--color-primary)' }}
                                    >
                                        Browse All Jobs
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                                        {jobs.map((job: Job) => (
                                            <JobCard key={job.id} job={job} />
                                        ))}
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="mt-8 flex items-center justify-center gap-4">
                                            {page > 1 ? (
                                                <Link
                                                    href={`/jobs/inpatient?page=${page - 1}`}
                                                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                                    style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                                >
                                                    ← Previous
                                                </Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                                                    ← Previous
                                                </span>
                                            )}

                                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                Page {page} of {totalPages}
                                            </span>

                                            {page < totalPages ? (
                                                <Link
                                                    href={`/jobs/inpatient?page=${page + 1}`}
                                                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                                    style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                                >
                                                    Next →
                                                </Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                                                    Next →
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="lg:col-span-1">
                            {/* Job Alert CTA */}
                            <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">
                                    Get Inpatient Job Alerts
                                </h3>
                                <p className="text-sm text-teal-100 mb-4">
                                    Be the first to know about new inpatient and hospital-based PMHNP positions.
                                </p>
                                <Link
                                    href="/job-alerts"
                                    className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                                >
                                    Create Alert
                                </Link>
                            </div>

                            {/* Top Employers */}
                            {stats.topEmployers.length > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                                        <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Employers</h3>
                                    </div>
                                    <ul className="space-y-3">
                                        {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                                            <li key={index} className="flex items-center justify-between">
                                                <span className="text-sm truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                                                    {employer.name}
                                                </span>
                                                <span className="text-sm font-medium ml-2" style={{ color: 'var(--color-primary)' }}>
                                                    {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Salary Insights */}
                            {stats.avgSalary > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp className="h-5 w-5 text-green-500" />
                                        <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Salary Insights</h3>
                                    </div>
                                    <div className="mb-4">
                                        <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                            ${stats.avgSalary}k
                                        </div>
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Average annual salary
                                        </div>
                                    </div>
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        Based on inpatient PMHNP positions with salary data. Hospital roles often include benefits, shift differentials, and sign-on bonuses.
                                    </p>
                                </div>
                            )}

                            {/* Inpatient Tips */}
                            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Inpatient Tips</h3>
                                </div>
                                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Get comfortable with crisis intervention and de-escalation</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Build strong rapport with multidisciplinary teams</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Stay current on psychopharmacology for acute conditions</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Negotiate shift differentials for nights and weekends</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Consider inpatient fellowships for specialized training</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Additional Resources Section */}
                    <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                            Inpatient PMHNP Career Resources
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Common Settings
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Inpatient PMHNPs work in psychiatric hospitals, medical center psych units, crisis stabilization units,
                                    state psychiatric facilities, and residential treatment centers. Each setting has unique patient populations
                                    and treatment approaches.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Typical Responsibilities
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Inpatient PMHNPs perform psychiatric evaluations, manage medication regimens for acute conditions,
                                    conduct risk assessments, collaborate with treatment teams, and develop discharge plans. Caseloads
                                    typically range from 12-20 patients.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Schedule & Lifestyle
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Many inpatient positions offer shift-based schedules like 7-on/7-off or 4x10s. Night and weekend shifts
                                    often come with significant pay differentials. Unlike outpatient, there are no after-hours patient calls
                                    — when your shift ends, you&apos;re off.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Career Growth
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Inpatient experience is highly valued and opens doors to leadership roles, medical director positions,
                                    and consultation-liaison psychiatry. It also provides excellent training for crisis work and complex
                                    psychopharmacology.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Explore Other Job Types */}
                    <div className="mt-12 pt-12" style={{ borderTop: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Explore Other Job Types</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/jobs/remote" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Wifi className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Remote Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Work from home</div>
                            </Link>
                            <Link href="/jobs/telehealth" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Video className="h-5 w-5 text-purple-500 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Telehealth Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Virtual care</div>
                            </Link>
                            <Link href="/jobs/travel" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Plane className="h-5 w-5 text-orange-500 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Travel Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Locum tenens</div>
                            </Link>
                            <Link href="/jobs/per-diem" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Calendar className="h-5 w-5 text-green-500 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Per Diem Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Flexible shifts</div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* FAQ Section */}
            <CategoryFAQ category="inpatient" totalJobs={stats.totalJobs} />
        </div>
    );
}
