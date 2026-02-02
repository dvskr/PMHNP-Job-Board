import { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, Clock, DollarSign, Heart, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, Plane, GraduationCap } from 'lucide-react';
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
 * Fetch per diem/PRN jobs with pagination
 */
async function getPerDiemJobs(skip: number = 0, take: number = 20) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'per diem', mode: 'insensitive' } },
                { title: { contains: 'per-diem', mode: 'insensitive' } },
                { title: { contains: 'prn', mode: 'insensitive' } },
                { title: { contains: 'part-time', mode: 'insensitive' } },
                { title: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'per diem', mode: 'insensitive' } },
                { jobType: { contains: 'part-time', mode: 'insensitive' } },
                { jobType: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'prn', mode: 'insensitive' } },
            ],
            NOT: {
                jobType: { equals: 'Full-Time', mode: 'insensitive' },
            },
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
 * Fetch per diem job statistics
 */
async function getPerDiemStats() {
    // Total per diem/PRN jobs
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'per diem', mode: 'insensitive' } },
                { title: { contains: 'per-diem', mode: 'insensitive' } },
                { title: { contains: 'prn', mode: 'insensitive' } },
                { title: { contains: 'part-time', mode: 'insensitive' } },
                { title: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'per diem', mode: 'insensitive' } },
                { jobType: { contains: 'part-time', mode: 'insensitive' } },
                { jobType: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'prn', mode: 'insensitive' } },
            ],
            NOT: {
                jobType: { equals: 'Full-Time', mode: 'insensitive' },
            },
        },
    });

    // Average salary for per diem positions
    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'per diem', mode: 'insensitive' } },
                { title: { contains: 'per-diem', mode: 'insensitive' } },
                { title: { contains: 'prn', mode: 'insensitive' } },
                { title: { contains: 'part-time', mode: 'insensitive' } },
                { title: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'per diem', mode: 'insensitive' } },
                { jobType: { contains: 'part-time', mode: 'insensitive' } },
                { jobType: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'prn', mode: 'insensitive' } },
            ],
            NOT: {
                jobType: { equals: 'Full-Time', mode: 'insensitive' },
            },
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

    // Companies hiring for per diem positions
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'per diem', mode: 'insensitive' } },
                { title: { contains: 'per-diem', mode: 'insensitive' } },
                { title: { contains: 'prn', mode: 'insensitive' } },
                { title: { contains: 'part-time', mode: 'insensitive' } },
                { title: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'per diem', mode: 'insensitive' } },
                { jobType: { contains: 'part-time', mode: 'insensitive' } },
                { jobType: { contains: 'part time', mode: 'insensitive' } },
                { jobType: { contains: 'prn', mode: 'insensitive' } },
            ],
            NOT: {
                jobType: { equals: 'Full-Time', mode: 'insensitive' },
            },
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
    const stats = await getPerDiemStats();

    return {
        title: 'Per Diem PMHNP Jobs - PRN & Part-Time Psychiatric NP Positions',
        description: `Find per diem and PRN PMHNP jobs. Flexible part-time psychiatric nurse practitioner positions. Set your own schedule. ${stats.totalJobs} positions available.`,
        keywords: ['per diem pmhnp', 'prn pmhnp jobs', 'part time pmhnp', 'flexible pmhnp positions', 'casual pmhnp work'],
        openGraph: {
            title: `${stats.totalJobs} Per Diem PMHNP Jobs - PRN & Part-Time Positions`,
            description: 'Browse per diem and PRN psychiatric mental health nurse practitioner positions. Flexible schedules, higher hourly rates.',
            type: 'website',
        },
        alternates: {
            canonical: '/jobs/per-diem',
        },
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

/**
 * Per diem jobs page
 */
export default async function PerDiemJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getPerDiemJobs(skip, limit),
        getPerDiemStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            {/* Breadcrumb Schema */}
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Per Diem", url: "https://pmhnphiring.com/jobs/per-diem" }
            ]} />
            {/* Hero Section */}
            <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Calendar className="h-8 w-8" />
                            <Clock className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Per Diem PMHNP Jobs
                        </h1>
                        <p className="text-sm text-blue-200 text-center mt-2 mb-4">
                            Last Updated: February 2026 | Per diem PMHNP positions
                        </p>
                        <p className="text-lg md:text-xl text-blue-100 mb-6">
                            Discover {stats.totalJobs} per diem, PRN, and part-time psychiatric nurse practitioner positions
                        </p>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-blue-100">Flexible Positions</div>
                            </div>
                            {stats.avgSalary > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                                    <div className="text-sm text-blue-100">Avg. Salary</div>
                                </div>
                            )}
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                                <div className="text-sm text-blue-100">Hiring Employers</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-7xl mx-auto">
                    {/* Benefits Section */}
                    <div className="mb-8 md:mb-12">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">
                                Why Choose Per Diem/PRN Work?
                            </h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                            <Calendar className="h-6 w-6 text-purple-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-2">Flexible Schedule</h3>
                                        <p className="text-sm text-gray-600">
                                            Choose when you work. Pick up shifts that fit your lifestyle, whether that&apos;s weekends, evenings, or just a few days a month.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                            <DollarSign className="h-6 w-6 text-green-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-2">Higher Hourly Rates</h3>
                                        <p className="text-sm text-gray-600">
                                            Per diem positions often pay 15-30% more per hour than salaried roles to compensate for the lack of benefits.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                            <Heart className="h-6 w-6 text-blue-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-2">Work-Life Balance</h3>
                                        <p className="text-sm text-gray-600">
                                            Perfect for semi-retirement, parents, or those pursuing other interests. Control your hours without sacrificing your career.
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
                                <h2 className="text-xl font-semibold text-gray-900">
                                    All Per Diem Positions ({stats.totalJobs})
                                </h2>
                                <Link
                                    href="/jobs"
                                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                >
                                    View All Jobs →
                                </Link>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        No per diem positions available
                                    </h3>
                                    <p className="text-gray-600 mb-6">
                                        We don&apos;t have any active per diem PMHNP positions right now. Check back soon!
                                    </p>
                                    <Link
                                        href="/jobs"
                                        className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
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
                                                    href={`/jobs/per-diem?page=${page - 1}`}
                                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                                >
                                                    ← Previous
                                                </Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed">
                                                    ← Previous
                                                </span>
                                            )}

                                            <span className="text-sm text-gray-600">
                                                Page {page} of {totalPages}
                                            </span>

                                            {page < totalPages ? (
                                                <Link
                                                    href={`/jobs/per-diem?page=${page + 1}`}
                                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                                >
                                                    Next →
                                                </Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed">
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
                            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">
                                    Get Per Diem Job Alerts
                                </h3>
                                <p className="text-sm text-blue-100 mb-4">
                                    Be the first to know about new per diem and PRN PMHNP positions.
                                </p>
                                <Link
                                    href="/job-alerts"
                                    className="block w-full text-center px-4 py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                                >
                                    Create Alert
                                </Link>
                            </div>

                            {/* Companies Hiring Per Diem */}
                            {stats.topEmployers.length > 0 && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Building2 className="h-5 w-5 text-blue-600" />
                                        <h3 className="font-bold text-gray-900">Top Employers</h3>
                                    </div>
                                    <ul className="space-y-3">
                                        {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                                            <li key={index} className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700 truncate flex-1">
                                                    {employer.name}
                                                </span>
                                                <span className="text-sm font-medium text-blue-600 ml-2">
                                                    {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Salary Insights */}
                            {stats.avgSalary > 0 && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp className="h-5 w-5 text-green-600" />
                                        <h3 className="font-bold text-gray-900">Salary Insights</h3>
                                    </div>
                                    <div className="mb-4">
                                        <div className="text-3xl font-bold text-gray-900">
                                            ${stats.avgSalary}k
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            Average annual equivalent
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Per diem rates often translate to higher annualized pay when worked consistently. Hourly rates typically range from $65-$125/hr.
                                    </p>
                                </div>
                            )}

                            {/* Per Diem Tips */}
                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Lightbulb className="h-5 w-5 text-amber-600" />
                                    <h3 className="font-bold text-gray-900">Per Diem Tips</h3>
                                </div>
                                <ul className="space-y-3 text-sm text-gray-700">
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Register with multiple facilities for more shifts</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Keep your credentials current and accessible</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Consider your own malpractice insurance</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Track hours for tax purposes (1099 income)</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Build relationships for priority shift offers</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Additional Resources Section */}
                    <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 md:p-8 border border-blue-200">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            Per Diem vs Full-Time: What&apos;s Right for You?
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Per Diem Benefits
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    Higher hourly rates, complete schedule flexibility, no mandatory overtime,
                                    and the ability to work at multiple facilities. Ideal for those who value autonomy.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Considerations
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    Per diem typically means no benefits (health insurance, PTO, retirement).
                                    You&apos;ll need to plan for taxes, insurance, and irregular income.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Who It&apos;s Best For
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    PMHNPs who have benefits through a spouse, those semi-retired, parents wanting
                                    flexible schedules, or those testing different practice settings.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Getting Started
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    Many per diem positions require at least 1 year of experience. Start by
                                    registering with staffing agencies and local hospitals&apos; PRN pools.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 border-t border-gray-200 pt-12">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Explore Other Job Types</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/jobs/remote" className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-600 transition-colors">
                                    <Wifi className="h-5 w-5 text-blue-600 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold text-gray-900">Remote Jobs</div>
                                <div className="text-sm text-gray-500 mt-1">Work from home</div>
                            </Link>
                            <Link href="/jobs/telehealth" className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-300 hover:shadow-md transition-all group">
                                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-600 transition-colors">
                                    <Video className="h-5 w-5 text-purple-600 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold text-gray-900">Telehealth Jobs</div>
                                <div className="text-sm text-gray-500 mt-1">Virtual care</div>
                            </Link>
                            <Link href="/jobs/travel" className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:shadow-md transition-all group">
                                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors">
                                    <Plane className="h-5 w-5 text-teal-600 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold text-gray-900">Travel Jobs</div>
                                <div className="text-sm text-gray-500 mt-1">Locum tenens</div>
                            </Link>
                            <Link href="/jobs/new-grad" className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all group">
                                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-600 transition-colors">
                                    <GraduationCap className="h-5 w-5 text-indigo-600 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold text-gray-900">New Grad Jobs</div>
                                <div className="text-sm text-gray-500 mt-1">Entry level</div>
                            </Link>
                        </div>
                    </div>
                </div>
                <section className="mt-12 mb-8 container mx-auto px-4">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Explore More PMHNP Resources</h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Link href="/salary-guide" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                            <h3 className="font-semibold text-blue-600">💰 2026 Salary Guide</h3>
                            <p className="text-sm text-gray-600 mt-1">Average PMHNP salary is $155,000+. See pay by state, experience, and setting.</p>
                        </Link>

                        <Link href="/jobs/locations" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                            <h3 className="font-semibold text-blue-600">📍 Jobs by Location</h3>
                            <p className="text-sm text-gray-600 mt-1">Browse PMHNP positions by state and city.</p>
                        </Link>

                        <Link href="/jobs/remote" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                            <h3 className="font-semibold text-blue-600">🏠 Remote Jobs</h3>
                            <p className="text-sm text-gray-600 mt-1">Telehealth and work-from-home PMHNP positions.</p>
                        </Link>

                        <Link href="/jobs/travel" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                            <h3 className="font-semibold text-blue-600">✈️ Travel Jobs</h3>
                            <p className="text-sm text-gray-600 mt-1">Locum tenens positions with premium pay.</p>
                        </Link>

                        <Link href="/jobs/telehealth" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                            <h3 className="font-semibold text-blue-600">💻 Telehealth Jobs</h3>
                            <p className="text-sm text-gray-600 mt-1">Virtual psychiatric care positions.</p>
                        </Link>
                    </div>
                </section>
            </div>
            );
}
