import { Metadata } from 'next';
import Link from 'next/link';
import { Users, Briefcase, DollarSign, Clock, Heart, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap, Calendar, Plane, Building, Shield } from 'lucide-react';
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

async function getOutpatientJobs(skip: number = 0, take: number = 20) {
    return prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'outpatient', mode: 'insensitive' } },
                { title: { contains: 'out-patient', mode: 'insensitive' } },
                { title: { contains: 'clinic', mode: 'insensitive' } },
                { title: { contains: 'private practice', mode: 'insensitive' } },
                { title: { contains: 'community mental health', mode: 'insensitive' } },
                { description: { contains: 'outpatient', mode: 'insensitive' } },
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
}

async function getOutpatientStats() {
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'outpatient', mode: 'insensitive' } },
                { title: { contains: 'out-patient', mode: 'insensitive' } },
                { title: { contains: 'clinic', mode: 'insensitive' } },
                { title: { contains: 'private practice', mode: 'insensitive' } },
                { title: { contains: 'community mental health', mode: 'insensitive' } },
                { description: { contains: 'outpatient', mode: 'insensitive' } },
            ],
        },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'outpatient', mode: 'insensitive' } },
                { title: { contains: 'out-patient', mode: 'insensitive' } },
                { title: { contains: 'clinic', mode: 'insensitive' } },
                { title: { contains: 'private practice', mode: 'insensitive' } },
                { description: { contains: 'outpatient', mode: 'insensitive' } },
            ],
            normalizedMinSalary: { not: null },
            normalizedMaxSalary: { not: null },
        },
        _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    });

    const avgSalary = Math.round(((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000);

    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'outpatient', mode: 'insensitive' } },
                { title: { contains: 'clinic', mode: 'insensitive' } },
                { title: { contains: 'private practice', mode: 'insensitive' } },
                { description: { contains: 'outpatient', mode: 'insensitive' } },
            ],
        },
        _count: { employer: true },
        orderBy: { _count: { employer: 'desc' } },
        take: 8,
    });

    return {
        totalJobs,
        avgSalary,
        topEmployers: topEmployers.map((e: EmployerGroupResult) => ({ name: e.employer, count: e._count.employer })),
    };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const [stats, params] = await Promise.all([getOutpatientStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Outpatient PMHNP Jobs — Clinic & Private Practice ($130K-190K)`,
        description: `Find ${stats.totalJobs} outpatient PMHNP jobs paying $130K-$190K+. Clinic, private practice, and community mental health psychiatric nurse practitioner positions with M-F schedules. Apply today.`,
        keywords: ['outpatient pmhnp jobs', 'outpatient psychiatric nurse practitioner', 'pmhnp private practice', 'clinic pmhnp jobs', 'community mental health pmhnp'],
        openGraph: {
            title: `${stats.totalJobs} Outpatient PMHNP Jobs — Clinic & Private Practice`,
            description: 'Browse outpatient psychiatric nurse practitioner positions in clinics, private practices, and community mental health centers.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Outpatient PMHNP Jobs`)}&subtitle=${encodeURIComponent('Clinic & private practice positions')}`,
                width: 1200, height: 630, alt: 'Outpatient PMHNP Jobs',
            }],
        },
        alternates: { canonical: 'https://pmhnphiring.com/jobs/outpatient' },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function OutpatientJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([getOutpatientJobs(skip, limit), getOutpatientStats()]);
    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Outpatient", url: "https://pmhnphiring.com/jobs/outpatient" }
            ]} />

            <section className="bg-teal-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Users className="h-8 w-8" />
                            <Heart className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Outpatient PMHNP Jobs
                        </h1>
                        <p className="text-sm text-teal-200 mt-2 mb-4">
                            Last Updated: March 2026 | Clinic, private practice & community mental health
                        </p>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">
                            Discover {stats.totalJobs} outpatient psychiatric nurse practitioner positions
                        </p>
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                                <div className="text-sm text-teal-100">Outpatient Positions</div>
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
                    <div className="mb-8 md:mb-12">
                        <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Why Work as an Outpatient PMHNP?</h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Clock className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Work-Life Balance</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Most outpatient positions offer Monday-Friday schedules with no nights, weekends, or on-call requirements. Predictable hours for better personal life.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Heart className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Long-Term Patient Relationships</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Build meaningful therapeutic relationships over months and years. See patients improve through ongoing medication management and therapy support.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Private Practice Potential</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Outpatient experience is the foundation for starting your own practice. Many PMHNPs transition to private practice earning $200K+ with full autonomy.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-3">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>All Outpatient Positions ({stats.totalJobs})</h2>
                                <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Users className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No outpatient jobs available</h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Check back soon for new outpatient PMHNP positions!</p>
                                    <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                                        {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
                                    </div>
                                    {totalPages > 1 && (
                                        <div className="mt-8 flex items-center justify-center gap-4">
                                            {page > 1 ? (
                                                <Link href={`/jobs/outpatient?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>← Previous</Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>← Previous</span>
                                            )}
                                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                                            {page < totalPages ? (
                                                <Link href={`/jobs/outpatient?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Next →</Link>
                                            ) : (
                                                <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>Next →</span>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="lg:col-span-1">
                            <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">Get Outpatient Job Alerts</h3>
                                <p className="text-sm text-teal-100 mb-4">Be the first to know about new outpatient PMHNP positions.</p>
                                <Link href="/job-alerts" className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors">Create Alert</Link>
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

                            {stats.avgSalary > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp className="h-5 w-5 text-green-500" />
                                        <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Salary Insights</h3>
                                    </div>
                                    <div className="mb-4">
                                        <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>${stats.avgSalary}k</div>
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Average annual salary</div>
                                    </div>
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Based on outpatient PMHNP positions. Private practice roles may earn significantly more with productivity-based compensation.</p>
                                </div>
                            )}

                            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Outpatient Tips</h3>
                                </div>
                                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Start with structured clinic experience before private practice</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Build expertise in evidence-based psychotherapy integration</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Negotiate productivity bonuses if seeing above threshold</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Consider part-time private practice alongside W-2 employment</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Get comfortable with therapy modalities (CBT, DBT, MI)</span></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Outpatient PMHNP Career Resources</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Common Settings</h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Outpatient PMHNPs work in private practices, community mental health centers (CMHCs), group practices, university counseling centers, federally qualified health centers (FQHCs), and integrated primary care clinics.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Typical Caseload</h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Outpatient PMHNPs typically see 12-20 patients per day for medication management (15-30 min appointments) or 6-8 patients with therapy integration (45-60 min). Panel sizes range from 300-800 active patients.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Path to Private Practice</h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Most PMHNPs gain 2-3 years of outpatient experience before launching a private practice. Key steps: obtain independent practice authority (state-dependent), get credentialed with insurance panels, and build referral networks.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Compensation Structure</h3>
                                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>W-2 positions typically offer $130K-$190K base salary plus benefits. 1099/private practice PMHNPs can earn $200K-$300K+ based on patient volume, with overhead costs of $2K-$5K/month for a solo practice.</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 pt-12" style={{ borderTop: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Explore Other Job Types</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/jobs/inpatient" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-red-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Building className="h-5 w-5 text-red-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Inpatient Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Hospital-based</div>
                            </Link>
                            <Link href="/jobs/remote" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Wifi className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Remote Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Work from home</div>
                            </Link>
                            <Link href="/jobs/telehealth" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Video className="h-5 w-5 text-purple-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Telehealth Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Virtual care</div>
                            </Link>
                            <Link href="/jobs/travel" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Plane className="h-5 w-5 text-orange-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Travel Jobs</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Locum tenens</div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <CategoryFAQ category="outpatient" totalJobs={stats.totalJobs} />
        </div>
    );
}
