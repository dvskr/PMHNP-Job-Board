import { Metadata } from 'next';
import Link from 'next/link';
import { Heart, DollarSign, TrendingUp, Building2, Bell, Wifi, Video, Plane, GraduationCap, Calendar, Shield } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface EmployerGroupResult {
    employer: string;
    _count: { employer: number };
}

interface ProcessedEmployer {
    name: string;
    count: number;
}

const ADDICTION_KEYWORDS = [
    { title: { contains: 'addiction', mode: 'insensitive' as const } },
    { title: { contains: 'substance', mode: 'insensitive' as const } },
    { title: { contains: 'substance use', mode: 'insensitive' as const } },
    { title: { contains: 'SUD', mode: 'insensitive' as const } },
    { title: { contains: 'MAT', mode: 'insensitive' as const } },
    { title: { contains: 'opioid', mode: 'insensitive' as const } },
    { title: { contains: 'detox', mode: 'insensitive' as const } },
    { title: { contains: 'recovery', mode: 'insensitive' as const } },
    { title: { contains: 'suboxone', mode: 'insensitive' as const } },
    { title: { contains: 'buprenorphine', mode: 'insensitive' as const } },
    { description: { contains: 'addiction', mode: 'insensitive' as const } },
    { description: { contains: 'substance use disorder', mode: 'insensitive' as const } },
    { description: { contains: 'MAT program', mode: 'insensitive' as const } },
];

async function getAddictionJobs(skip = 0, take = 20) {
    return prisma.job.findMany({
        where: { isPublished: true, OR: ADDICTION_KEYWORDS },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
    });
}

async function getAddictionStats() {
    const totalJobs = await prisma.job.count({
        where: { isPublished: true, OR: ADDICTION_KEYWORDS },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: ADDICTION_KEYWORDS,
            normalizedMinSalary: { not: null },
            normalizedMaxSalary: { not: null },
        },
        _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    });

    const avgMin = salaryData._avg.normalizedMinSalary || 0;
    const avgMax = salaryData._avg.normalizedMaxSalary || 0;
    const avgSalary = Math.round((avgMin + avgMax) / 2 / 1000);

    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true, OR: ADDICTION_KEYWORDS },
        _count: { employer: true },
        orderBy: { _count: { employer: 'desc' } },
        take: 8,
    });

    return {
        totalJobs,
        avgSalary,
        topEmployers: topEmployers.map((e: EmployerGroupResult) => ({
            name: e.employer,
            count: e._count.employer,
        })),
    };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const [stats, params] = await Promise.all([getAddictionStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Addiction PMHNP Jobs — Substance Use & MAT Psych NP Positions`,
        description: `Find ${stats.totalJobs} addiction psychiatry and substance use disorder PMHNP jobs. Positions include MAT programs, opioid treatment, detox, and recovery centers. Psychiatric nurse practitioners specializing in addiction medicine earn $${stats.avgSalary || 155}K+ on average.`,
        keywords: ['addiction pmhnp jobs', 'substance use pmhnp', 'MAT pmhnp', 'suboxone prescriber jobs', 'addiction psychiatry NP'],
        openGraph: {
            title: `${stats.totalJobs} Addiction PMHNP Jobs - Substance Use & MAT Positions`,
            description: 'Browse addiction and substance use disorder psychiatric nurse practitioner positions. MAT, detox, and recovery center roles.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Addiction PMHNP Jobs`)}&subtitle=${encodeURIComponent('Substance use & MAT psych NP positions')}`,
                width: 1200, height: 630, alt: 'Addiction PMHNP Jobs',
            }],
        },
        alternates: { canonical: 'https://pmhnphiring.com/jobs/addiction' },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function AddictionJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getAddictionJobs(skip, limit),
        getAddictionStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Addiction", url: "https://pmhnphiring.com/jobs/addiction" }
            ]} />

            {/* Hero */}
            <section className="bg-teal-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Heart className="h-8 w-8" />
                            <Shield className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Addiction PMHNP Jobs
                        </h1>
                        <p className="text-sm text-teal-200 text-center mt-2 mb-4">
                            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | Substance use & addiction PMHNP positions
                        </p>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">
                            Discover {stats.totalJobs} addiction and substance use disorder psychiatric nurse practitioner positions
                        </p>

                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-teal-100">Addiction Positions</div>
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
                    {/* About Addiction Psychiatry */}
                    <div className="mb-8 md:mb-12">
                        <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                                Why Addiction Psychiatry for PMHNPs?
                            </h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <TrendingUp className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Critical Demand</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            The opioid epidemic and rising substance use have created an urgent need for addiction-trained psychiatric nurse practitioners across the country.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Competitive Compensation</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Addiction PMHNPs often earn premium pay due to the specialized skill set. MAT-waivered providers are especially sought after.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <Heart className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Life-Changing Impact</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Few specialties offer the profound satisfaction of helping patients recover from addiction. You&apos;re literally saving lives.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-3">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    All Addiction Positions ({stats.totalJobs})
                                </h2>
                                <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>
                                    View All Jobs →
                                </Link>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Heart className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                        No addiction positions available right now
                                    </h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                                        Check back soon for new addiction and substance use PMHNP positions.
                                    </p>
                                    <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--color-primary)' }}>
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

                                    {totalPages > 1 && (
                                        <div className="mt-8 flex items-center justify-center gap-4">
                                            {page > 1 ? (
                                                <Link href={`/jobs/addiction?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                                    ← Previous
                                                </Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                                                    ← Previous
                                                </span>
                                            )}
                                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                                            {page < totalPages ? (
                                                <Link href={`/jobs/addiction?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
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
                            <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">Get Addiction Job Alerts</h3>
                                <p className="text-sm text-teal-100 mb-4">Be the first to know about new addiction and SUD PMHNP positions.</p>
                                <Link href="/job-alerts" className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors">
                                    Create Alert
                                </Link>
                            </div>

                            {stats.topEmployers.length > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                                        <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Employers</h3>
                                    </div>
                                    <ul className="space-y-3">
                                        {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                                            <li key={index} className="flex items-center justify-between">
                                                <span className="text-sm truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{employer.name}</span>
                                                <span className="text-sm font-medium ml-2" style={{ color: 'var(--color-primary)' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Settings Types */}
                    <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                            Types of Addiction PMHNP Settings
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>MAT / Opioid Treatment Programs</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Prescribe buprenorphine (Suboxone), naltrexone (Vivitrol), and methadone in outpatient or clinic settings. High demand for X-waivered providers.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Inpatient Detox & Rehab</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Manage acute withdrawal, medication titration, and co-occurring psychiatric disorders in residential treatment facilities.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Community Mental Health</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Treat dual-diagnosis patients in CMHCs and FQHCs. Often eligible for HRSA loan repayment programs ($50K+).
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Corrections & Criminal Justice</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Provide addiction treatment in jails, prisons, and drug courts. High autonomy and often competitive pay with government benefits.
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
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Plane className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Travel Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Locum tenens</div>
                            </Link>
                            <Link href="/jobs/new-grad" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <GraduationCap className="h-5 w-5 text-indigo-500 group-hover:text-white transition-colors" />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>New Grad Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Entry level</div>
                            </Link>
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
                        <Link href="/jobs/per-diem" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📅 Per Diem / Part-Time</h3>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Flexible per diem and PRN psychiatric NP positions.</p>
                        </Link>
                    </div>
                </section>

                <CategoryFAQ category="addiction" totalJobs={stats.totalJobs} />
            </div>
        </div>
    );
}
