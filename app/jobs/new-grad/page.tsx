import { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap, Sparkles, Users, BookOpen, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, Plane, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

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
 * Fetch new grad jobs with pagination
 */
async function getNewGradJobs(skip: number = 0, take: number = 20) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
            ],
        },
        orderBy: [
            { isFeatured: 'desc' },
            { createdAt: 'desc' },
        ],
        skip,
        take,
    });

    return jobs;
}

/**
 * Fetch new grad job statistics
 */
async function getNewGradStats() {
    // Total new grad jobs
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
            ],
        },
    });

    // Average salary for new grad positions
    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
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

    // Companies hiring new grads
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
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
export async function generateMetadata(): Promise<Metadata> {
    const stats = await getNewGradStats();

    return {
        title: 'New Grad PMHNP Jobs - Entry Level Psychiatric NP Positions',
        description: `Find new graduate PMHNP jobs and entry-level psychiatric nurse practitioner positions. Fellowships, residencies, and new grad friendly employers. ${stats.totalJobs} positions available.`,
        keywords: ['new grad pmhnp', 'entry level pmhnp', 'pmhnp fellowship', 'new graduate psychiatric nurse practitioner', 'pmhnp residency'],
        openGraph: {
            title: `${stats.totalJobs} New Grad PMHNP Jobs - Entry Level Positions`,
            description: 'Browse new graduate and entry-level psychiatric mental health nurse practitioner positions. Fellowships, residencies, mentorship programs.',
            type: 'website',
        },
        alternates: {
            canonical: 'https://pmhnphiring.com/jobs/new-grad',
        },
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

/**
 * New grad jobs page
 */
export default async function NewGradJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getNewGradJobs(skip, limit),
        getNewGradStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {/* Breadcrumb Schema */}
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "New Grad", url: "https://pmhnphiring.com/jobs/new-grad" }
            ]} />
            {/* Hero Section */}
            <section className="bg-teal-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <GraduationCap className="h-8 w-8" />
                            <Sparkles className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            New Grad PMHNP Jobs
                        </h1>
                        <p className="text-sm text-teal-200 text-center mt-2 mb-4">
                            Last Updated: February 2026 | Entry-level PMHNP opportunities
                        </p>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">
                            Discover {stats.totalJobs} entry-level and new graduate psychiatric nurse practitioner positions
                        </p>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-teal-100">New Grad Positions</div>
                            </div>
                            {stats.avgSalary > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                                    <div className="text-sm text-teal-100">Avg. Salary</div>
                                </div>
                            )}
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                                <div className="text-sm text-teal-100">Hiring Employers</div>
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
                                Why New Grad PMHNP Positions Matter
                            </h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <Users className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Mentorship Programs</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Many new grad positions include dedicated mentorship from experienced PMHNPs, helping you build confidence and clinical skills.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <BookOpen className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Training Provided</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Fellowships and residencies offer structured training programs, reduced caseloads, and ongoing education to support your transition.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <TrendingUp className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Career Growth</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Starting with a supportive employer sets the foundation for long-term career success and professional development.
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
                                    All New Grad Positions ({stats.totalJobs})
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
                                    <GraduationCap className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                        No new grad positions available
                                    </h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                                        We don&apos;t have any active new grad PMHNP positions right now. Check back soon or browse all jobs!
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
                                                    href={`/jobs/new-grad?page=${page - 1}`}
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
                                                    href={`/jobs/new-grad?page=${page + 1}`}
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
                                    Get New Grad Job Alerts
                                </h3>
                                <p className="text-sm text-teal-100 mb-4">
                                    Be the first to know about new graduate-friendly PMHNP positions.
                                </p>
                                <Link
                                    href="/job-alerts"
                                    className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                                >
                                    Create Alert
                                </Link>
                            </div>

                            {/* Companies Hiring New Grads */}
                            {stats.topEmployers.length > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                                        <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>New Grad Friendly</h3>
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
                                        Based on new grad PMHNP positions with salary data. Salaries typically increase after the first year.
                                    </p>
                                </div>
                            )}

                            {/* New Grad Tips */}
                            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>New Grad Tips</h3>
                                </div>
                                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Look for positions with mentorship or supervision</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Ask about caseload expectations and ramp-up period</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Consider fellowships for structured training</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Prioritize learning over salary initially</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                                        <span>Network with PMHNPs during clinicals</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Additional Resources Section */}
                    <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                            What to Look For as a New Grad PMHNP
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Fellowship Programs
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    PMHNP fellowships are typically 1-year programs with reduced caseloads, weekly supervision,
                                    and structured didactic training. They&apos;re excellent for building confidence.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Collaborative Agreements
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Many positions offer collaborative physician relationships for new grads. This provides
                                    a safety net while you develop independent practice skills.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Reasonable Expectations
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Quality employers offer gradual caseload increases—starting with 4-6 patients per day
                                    and building to full productivity over 6-12 months.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                    Setting Selection
                                </h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    Consider your comfort level: outpatient offers predictability, while inpatient provides
                                    more acute experience. Community mental health centers often welcome new grads.
                                </p>
                            </div>
                        </div>
                    </div>

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
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Plane className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} />
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
            <section className="mt-12 mb-8 container mx-auto px-4">
                <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Explore More PMHNP Resources</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link href="/salary-guide" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💰 2026 Salary Guide</h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Average PMHNP salary is $155,000+. See pay by state, experience, and setting.</p>
                    </Link>

                    <Link href="/jobs/locations" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📍 Jobs by Location</h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse PMHNP positions by state and city.</p>
                    </Link>

                    <Link href="/jobs/remote" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏠 Remote Jobs</h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Telehealth and work-from-home PMHNP positions.</p>
                    </Link>

                    <Link href="/jobs/travel" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>✈️ Travel Jobs</h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Locum tenens positions with premium pay.</p>
                    </Link>

                    <Link href="/jobs/telehealth" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💻 Telehealth Jobs</h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Virtual psychiatric care positions.</p>
                    </Link>
                </div>
            </section>
        </div>
    );
}
