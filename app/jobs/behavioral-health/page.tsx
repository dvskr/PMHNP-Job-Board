import { Metadata } from 'next';
import Link from 'next/link';
import { Heart, DollarSign, TrendingUp, Building2, Bell, Wifi, Video, Plane, GraduationCap, Calendar, Brain } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';

// ISR caching
export const revalidate = 3600;

interface EmployerGroupResult {
    employer: string;
    _count: { employer: number };
}

interface ProcessedEmployer {
    name: string;
    count: number;
}

const BEHAVIORAL_HEALTH_KEYWORDS = [
    { title: { contains: 'behavioral health', mode: 'insensitive' as const } },
    { title: { contains: 'behavioral', mode: 'insensitive' as const } },
    { title: { contains: 'mental health', mode: 'insensitive' as const } },
    { title: { contains: 'psychiatric', mode: 'insensitive' as const } },
    { title: { contains: 'psych NP', mode: 'insensitive' as const } },
    { title: { contains: 'PMHNP', mode: 'insensitive' as const } },
    { description: { contains: 'behavioral health', mode: 'insensitive' as const } },
    { description: { contains: 'behavioral health facility', mode: 'insensitive' as const } },
];

async function getBehavioralHealthJobs(skip = 0, take = 20) {
    return prisma.job.findMany({
        where: { isPublished: true, OR: BEHAVIORAL_HEALTH_KEYWORDS },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
    });
}

async function getBehavioralHealthStats() {
    const totalJobs = await prisma.job.count({
        where: { isPublished: true, OR: BEHAVIORAL_HEALTH_KEYWORDS },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: BEHAVIORAL_HEALTH_KEYWORDS,
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
        where: { isPublished: true, OR: BEHAVIORAL_HEALTH_KEYWORDS },
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
    const [stats, params] = await Promise.all([getBehavioralHealthStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Behavioral Health NP Jobs — Psychiatric & Mental Health Positions`,
        description: `Find ${stats.totalJobs} behavioral health nurse practitioner jobs. Positions across inpatient, outpatient, community mental health, telehealth, and residential settings. Average salary $${stats.avgSalary || 155}K+.`,
        keywords: ['behavioral health NP jobs', 'behavioral health nurse practitioner', 'mental health NP jobs', 'psychiatric NP positions', 'PMHNP behavioral health'],
        openGraph: {
            title: `${stats.totalJobs} Behavioral Health NP Jobs`,
            description: 'Browse behavioral health and psychiatric nurse practitioner positions across all settings.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Behavioral Health NP Jobs`)}&subtitle=${encodeURIComponent('Psychiatric & mental health positions')}`,
                width: 1200, height: 630, alt: 'Behavioral Health NP Jobs',
            }],
        },
        alternates: { canonical: 'https://pmhnphiring.com/jobs/behavioral-health' },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function BehavioralHealthJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getBehavioralHealthJobs(skip, limit),
        getBehavioralHealthStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Behavioral Health", url: "https://pmhnphiring.com/jobs/behavioral-health" }
            ]} />

            {/* Hero */}
            <section className="bg-indigo-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Brain className="h-8 w-8" />
                            <Heart className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Behavioral Health NP Jobs
                        </h1>
                        <p className="text-sm text-indigo-200 text-center mt-2 mb-4">
                            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | Psychiatric & behavioral health positions
                        </p>
                        <p className="text-lg md:text-xl text-indigo-100 mb-6">
                            Discover {stats.totalJobs} behavioral health and psychiatric nurse practitioner positions
                        </p>

                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-indigo-100">BH Positions</div>
                            </div>
                            {stats.avgSalary > 0 && (
                                <div className="text-center">
                                    <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                                    <div className="text-sm text-indigo-100">Avg. Salary</div>
                                </div>
                            )}
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                                <div className="text-sm text-indigo-100">Hiring Employers</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-7xl mx-auto">
                    {/* About Behavioral Health */}
                    <div className="mb-8 md:mb-12">
                        <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                                Why Behavioral Health NP Careers?
                            </h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <TrendingUp className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>45% Job Growth</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Behavioral health NP positions are growing faster than nearly every other healthcare profession through 2032.
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
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>$155K+ Average</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Behavioral health NPs earn competitive salaries with opportunities exceeding $200K in private practice and specialty roles.
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
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Meaningful Impact</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Over 160 million Americans live in mental health shortage areas. Your work directly addresses the behavioral health crisis.
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
                                    All Behavioral Health Positions ({stats.totalJobs})
                                </h2>
                                <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>
                                    View All Jobs →
                                </Link>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Brain className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                        No behavioral health positions available right now
                                    </h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                                        Check back soon for new behavioral health NP positions.
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
                                                <Link href={`/jobs/behavioral-health?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                                    ← Previous
                                                </Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                                                    ← Previous
                                                </span>
                                            )}
                                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                                            {page < totalPages ? (
                                                <Link href={`/jobs/behavioral-health?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
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
                            <div className="bg-indigo-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">Get BH Job Alerts</h3>
                                <p className="text-sm text-indigo-100 mb-4">Be the first to know about new behavioral health NP positions.</p>
                                <Link href="/job-alerts" className="block w-full text-center px-4 py-2 bg-white text-indigo-700 rounded-lg font-medium hover:bg-indigo-50 transition-colors">
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
                            Types of Behavioral Health NP Settings
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Outpatient Behavioral Health</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Community mental health centers, group practices, and outpatient clinics treating depression, anxiety, ADHD, PTSD, and more in an office or telehealth setting.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Inpatient Psychiatry</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Hospital-based psychiatric units managing acute crises, psychotic episodes, and stabilization. Often team-based with psychiatrists and social workers.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Residential Treatment</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Long-term residential programs for eating disorders, substance use recovery, and treatment-resistant conditions requiring structured therapeutic environments.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Integrated Primary Care</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Embedded behavioral health within primary care practices, FQHCs, and health systems. Collaborative care model addressing mental health alongside physical health.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Explore Other Job Types */}
                    <div className="mt-12 pt-12" style={{ borderTop: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Explore Other Job Types</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/jobs/remote" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
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
                            <Link href="/jobs/addiction" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <Heart className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Addiction Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>SUD & MAT</div>
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
                        <Link href="/blog" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📝 Career Guides</h3>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Expert guides on salary, licensing, interviews, and career growth.</p>
                        </Link>
                    </div>
                </section>

                <CategoryFAQ category="behavioral-health" totalJobs={stats.totalJobs} />
            </div>
        </div>
    );
}
