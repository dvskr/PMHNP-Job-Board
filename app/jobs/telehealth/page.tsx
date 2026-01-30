import { Metadata } from 'next';
import Link from 'next/link';
import { Video, Monitor, Globe, Clock, TrendingUp, Building2, Lightbulb, Bell, Wifi, Plane, GraduationCap, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';

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
 * Fetch telehealth jobs with pagination
 */
async function getTelehealthJobs(skip: number = 0, take: number = 10) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'telehealth', mode: 'insensitive' } },
                { title: { contains: 'telemedicine', mode: 'insensitive' } },
                { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
                { description: { contains: 'telehealth', mode: 'insensitive' } },
                { description: { contains: 'telemedicine', mode: 'insensitive' } },
                { description: { contains: 'telepsychiatry', mode: 'insensitive' } },
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
 * Fetch telehealth job statistics
 */
async function getTelehealthStats() {
    // Total telehealth jobs
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'telehealth', mode: 'insensitive' } },
                { title: { contains: 'telemedicine', mode: 'insensitive' } },
                { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
                { description: { contains: 'telehealth', mode: 'insensitive' } },
                { description: { contains: 'telemedicine', mode: 'insensitive' } },
                { description: { contains: 'telepsychiatry', mode: 'insensitive' } },
            ],
        },
    });

    // Average salary for telehealth positions
    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'telehealth', mode: 'insensitive' } },
                { title: { contains: 'telemedicine', mode: 'insensitive' } },
                { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
                { description: { contains: 'telehealth', mode: 'insensitive' } },
                { description: { contains: 'telemedicine', mode: 'insensitive' } },
                { description: { contains: 'telepsychiatry', mode: 'insensitive' } },
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

    // Top telehealth employers
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'telehealth', mode: 'insensitive' } },
                { title: { contains: 'telemedicine', mode: 'insensitive' } },
                { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
                { description: { contains: 'telehealth', mode: 'insensitive' } },
                { description: { contains: 'telemedicine', mode: 'insensitive' } },
                { description: { contains: 'telepsychiatry', mode: 'insensitive' } },
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
    const stats = await getTelehealthStats();

    return {
        title: 'Telehealth PMHNP Jobs - Telepsychiatry Nurse Practitioner Positions',
        description: `Find telehealth PMHNP jobs and telepsychiatry positions. Provide virtual psychiatric care from home. Video visit psychiatric NP roles. ${stats.totalJobs} positions available.`,
        keywords: ['telehealth pmhnp', 'telepsychiatry jobs', 'virtual pmhnp', 'telemedicine psychiatric nurse practitioner'],
        openGraph: {
            title: `${stats.totalJobs} Telehealth PMHNP Jobs - Virtual Psychiatric Care`,
            description: 'Browse telehealth and telepsychiatry psychiatric mental health nurse practitioner positions. Work from home, competitive pay.',
            type: 'website',
        },
        alternates: {
            canonical: '/jobs/telehealth',
        },
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

/**
 * Telehealth jobs page
 */
export default async function TelehealthJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getTelehealthJobs(skip, limit),
        getTelehealthStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            {/* Hero Section */}
            <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Video className="h-8 w-8" />
                            <Monitor className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Telehealth PMHNP Jobs
                        </h1>
                        <p className="text-lg md:text-xl text-blue-100 mb-6">
                            Discover {stats.totalJobs} telehealth and telepsychiatry psychiatric nurse practitioner positions
                        </p>

                        {/* Stats Bar */}
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-blue-100">Telehealth Positions</div>
                            </div>
                            {stats.avgSalary > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                                    <div className="text-sm text-blue-100">Avg. Salary</div>
                                </div>
                            )}
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                                <div className="text-sm text-blue-100">Telehealth Employers</div>
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
                                Why Telehealth PMHNP Practice?
                            </h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                            <Video className="h-6 w-6 text-purple-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-2">Virtual Patient Care</h3>
                                        <p className="text-sm text-gray-600">
                                            Provide quality psychiatric care through video visits. Many patients prefer the convenience and privacy of telehealth appointments.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                            <Monitor className="h-6 w-6 text-blue-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-2">Work From Home</h3>
                                        <p className="text-sm text-gray-600">
                                            Eliminate commute time and create your ideal home office setup. Focus on patient care without the overhead of a physical clinic.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                            <Globe className="h-6 w-6 text-green-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-2">Multi-State Practice</h3>
                                        <p className="text-sm text-gray-600">
                                            Many telehealth employers help with multi-state licensure, expanding your patient reach and practice opportunities.
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
                                    All Telehealth Positions ({stats.totalJobs})
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
                                    <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        No telehealth jobs available
                                    </h3>
                                    <p className="text-gray-600 mb-6">
                                        We don&apos;t have any active telehealth PMHNP positions right now. Check back soon!
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
                                                    href={`/jobs/telehealth?page=${page - 1}`}
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
                                                    href={`/jobs/telehealth?page=${page + 1}`}
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
                                    Get Telehealth Job Alerts
                                </h3>
                                <p className="text-sm text-blue-100 mb-4">
                                    Be the first to know about new telehealth and telepsychiatry PMHNP positions.
                                </p>
                                <Link
                                    href="/job-alerts"
                                    className="block w-full text-center px-4 py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                                >
                                    Create Alert
                                </Link>
                            </div>

                            {/* Top Telehealth Employers */}
                            {stats.topEmployers.length > 0 && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Building2 className="h-5 w-5 text-blue-600" />
                                        <h3 className="font-bold text-gray-900">Top Telehealth Employers</h3>
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
                                            Average annual salary
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Telehealth positions often offer competitive pay with reduced overhead. Salaries vary by employer and state requirements.
                                    </p>
                                </div>
                            )}

                            {/* Telehealth Tips */}
                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Lightbulb className="h-5 w-5 text-amber-600" />
                                    <h3 className="font-bold text-gray-900">Telehealth Tips</h3>
                                </div>
                                <ul className="space-y-3 text-sm text-gray-700">
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Invest in quality camera, microphone, and lighting</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Ensure reliable high-speed internet</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Create a professional, private workspace</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Learn telehealth-specific assessment techniques</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-amber-600 font-bold">•</span>
                                        <span>Consider multi-state licensure for more opportunities</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Additional Resources Section */}
                    <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 md:p-8 border border-blue-200">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            Telehealth vs In-Person Practice
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Telehealth Advantages
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    No commute, flexible scheduling, lower overhead costs, and the ability to see patients across multiple states. Many patients prefer the convenience of virtual visits.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Technology Requirements
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    You&apos;ll need a HIPAA-compliant video platform, reliable internet, professional camera setup, and a private, well-lit workspace for video consultations.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Licensure Considerations
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    You must be licensed in the state where your patient is located. Many telehealth employers assist with multi-state licensure and credentialing.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-2">
                                    Clinical Considerations
                                </h3>
                                <p className="text-sm text-gray-600 mb-3">
                                    While most psychiatric assessments adapt well to telehealth, some situations may require in-person evaluation. Emergency protocols differ in virtual settings.
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
                            <Link href="/jobs/per-diem" className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-green-300 hover:shadow-md transition-all group">
                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-600 transition-colors">
                                    <Calendar className="h-5 w-5 text-green-600 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold text-gray-900">Per Diem Jobs</div>
                                <div className="text-sm text-gray-500 mt-1">Flexible shifts</div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
