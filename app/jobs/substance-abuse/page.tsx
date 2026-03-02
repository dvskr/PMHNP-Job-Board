import { Metadata } from 'next';
import Link from 'next/link';
import { Pill, Heart, DollarSign, Shield, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, Calendar, Plane, Building, Users } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';

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

async function getSubstanceAbuseJobs(skip: number = 0, take: number = 20) {
    return prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'substance', mode: 'insensitive' } },
                { title: { contains: 'addiction', mode: 'insensitive' } },
                { title: { contains: 'MAT', mode: 'insensitive' } },
                { title: { contains: 'suboxone', mode: 'insensitive' } },
                { title: { contains: 'dual diagnosis', mode: 'insensitive' } },
                { title: { contains: 'SUD', mode: 'insensitive' } },
                { description: { contains: 'substance abuse', mode: 'insensitive' } },
                { description: { contains: 'medication-assisted treatment', mode: 'insensitive' } },
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

async function getSubstanceAbuseStats() {
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'substance', mode: 'insensitive' } },
                { title: { contains: 'addiction', mode: 'insensitive' } },
                { title: { contains: 'MAT', mode: 'insensitive' } },
                { title: { contains: 'suboxone', mode: 'insensitive' } },
                { title: { contains: 'dual diagnosis', mode: 'insensitive' } },
                { title: { contains: 'SUD', mode: 'insensitive' } },
                { description: { contains: 'substance abuse', mode: 'insensitive' } },
                { description: { contains: 'medication-assisted treatment', mode: 'insensitive' } },
            ],
        },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'substance', mode: 'insensitive' } },
                { title: { contains: 'addiction', mode: 'insensitive' } },
                { title: { contains: 'MAT', mode: 'insensitive' } },
                { description: { contains: 'substance abuse', mode: 'insensitive' } },
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
                { title: { contains: 'substance', mode: 'insensitive' } },
                { title: { contains: 'addiction', mode: 'insensitive' } },
                { title: { contains: 'MAT', mode: 'insensitive' } },
                { description: { contains: 'substance abuse', mode: 'insensitive' } },
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
    const [stats, params] = await Promise.all([getSubstanceAbuseStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Substance Abuse PMHNP Jobs — Addiction & MAT Psych NP ($130K-180K)`,
        description: `Find ${stats.totalJobs} substance abuse and addiction PMHNP jobs paying $130K-$180K+. MAT clinics, dual diagnosis, Suboxone prescriber, and rehab psychiatric nurse practitioner positions. High demand, rewarding work.`,
        keywords: ['substance abuse pmhnp', 'addiction pmhnp jobs', 'MAT pmhnp', 'suboxone prescriber', 'dual diagnosis pmhnp', 'SUD nurse practitioner'],
        openGraph: {
            title: `${stats.totalJobs} Substance Abuse PMHNP Jobs — Addiction Treatment`,
            description: 'Browse addiction and substance abuse psychiatric nurse practitioner positions. MAT clinics, rehab, dual diagnosis roles.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Substance Abuse PMHNP Jobs`)}&subtitle=${encodeURIComponent('Addiction & MAT psychiatric NP positions')}`,
                width: 1200, height: 630, alt: 'Substance Abuse PMHNP Jobs',
            }],
        },
        alternates: { canonical: 'https://pmhnphiring.com/jobs/substance-abuse' },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function SubstanceAbuseJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([getSubstanceAbuseJobs(skip, limit), getSubstanceAbuseStats()]);
    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Substance Abuse", url: "https://pmhnphiring.com/jobs/substance-abuse" }
            ]} />

            <section className="bg-teal-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Pill className="h-8 w-8" />
                            <Heart className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">Substance Abuse & Addiction PMHNP Jobs</h1>
                        <p className="text-sm text-teal-200 mt-2 mb-4">Last Updated: March 2026 | MAT, dual diagnosis & addiction treatment</p>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">Discover {stats.totalJobs} addiction and substance abuse PMHNP positions</p>
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center"><div className="text-3xl font-bold">{stats.totalJobs}</div><div className="text-sm text-teal-100">SUD Positions</div></div>
                            {stats.avgSalary > 0 && (<div className="text-center"><div className="text-3xl font-bold">${stats.avgSalary}k</div><div className="text-sm text-teal-100">Avg. Salary</div></div>)}
                            <div className="text-center"><div className="text-3xl font-bold">{stats.topEmployers.length}</div><div className="text-sm text-teal-100">Hiring Organizations</div></div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8 md:mb-12">
                        <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Why Specialize in Addiction Psychiatry?</h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Shield className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Critical Need</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>The opioid crisis and rising substance use disorders have created massive demand for addiction-trained PMHNPs. There are not enough prescribers for MAT nationwide.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Heart className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Life-Changing Impact</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Help patients recover from addiction and rebuild their lives. MAT with buprenorphine reduces opioid overdose deaths by 50%+. Your work literally saves lives.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Competitive Pay + Bonuses</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Addiction PMHNP positions often include sign-on bonuses, loan repayment (NHSC), and incentive pay. Many positions qualify for Public Service Loan Forgiveness.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-3">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>All Addiction Positions ({stats.totalJobs})</h2>
                                <Link href="/jobs" className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
                            </div>
                            {jobs.length === 0 ? (
                                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Pill className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No substance abuse jobs available</h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Check back soon for new addiction PMHNP positions!</p>
                                    <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">{jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}</div>
                                    {totalPages > 1 && (
                                        <div className="mt-8 flex items-center justify-center gap-4">
                                            {page > 1 ? <Link href={`/jobs/substance-abuse?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>← Previous</Link> : <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>← Previous</span>}
                                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                                            {page < totalPages ? <Link href={`/jobs/substance-abuse?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Next →</Link> : <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>Next →</span>}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="lg:col-span-1">
                            <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">Get Addiction Job Alerts</h3>
                                <p className="text-sm text-teal-100 mb-4">Be the first to know about new substance abuse PMHNP positions.</p>
                                <Link href="/job-alerts" className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors">Create Alert</Link>
                            </div>
                            {stats.topEmployers.length > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4"><Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /><h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Employers</h3></div>
                                    <ul className="space-y-3">{stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (<li key={index} className="flex items-center justify-between"><span className="text-sm truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{employer.name}</span><span className="text-sm font-medium ml-2" style={{ color: 'var(--color-primary)' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span></li>))}</ul>
                                </div>
                            )}
                            {stats.avgSalary > 0 && (
                                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center gap-2 mb-4"><TrendingUp className="h-5 w-5 text-green-500" /><h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Salary Insights</h3></div>
                                    <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>${stats.avgSalary}k</div>
                                    <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Average annual salary</div>
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Many addiction PMHNP positions qualify for NHSC loan repayment up to $50K and PSLF after 10 years of service.</p>
                                </div>
                            )}
                            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="flex items-center gap-2 mb-4"><Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /><h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Addiction Tips</h3></div>
                                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Get X-waiver training for buprenorphine prescribing</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Learn motivational interviewing techniques</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Consider ASAM certification for career advancement</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Explore NHSC loan repayment programs</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Build skills in dual diagnosis treatment</span></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Addiction PMHNP Career Resources</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Common Settings</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>MAT clinics, residential rehab, detox centers, opioid treatment programs (OTPs), FQHCs, correctional facilities, and integrated behavioral health settings.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Key Medications</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Buprenorphine (Suboxone), naltrexone (Vivitrol), methadone management, acamprosate, disulfiram, and psychiatric medications for comorbid conditions (SSRIs, mood stabilizers).</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Certifications & Training</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>DEA X-waiver (now universal), ASAM certification, CARN-AP credential, motivational interviewing training, and evidence-based treatment certifications boost competitiveness.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Loan Repayment</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Many addiction positions in underserved areas qualify for NHSC loan repayment ($50K for 2 years), PSLF at nonprofit employers, and state-specific loan forgiveness programs.</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 pt-12" style={{ borderTop: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Explore Other Job Types</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/jobs/outpatient" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Users className="h-5 w-5 text-blue-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Outpatient</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Clinic-based</div>
                            </Link>
                            <Link href="/jobs/inpatient" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-red-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Building className="h-5 w-5 text-red-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Inpatient</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Hospital-based</div>
                            </Link>
                            <Link href="/jobs/remote" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Wifi className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Remote</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Work from home</div>
                            </Link>
                            <Link href="/jobs/telehealth" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Video className="h-5 w-5 text-purple-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Telehealth</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Virtual care</div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <CategoryFAQ category="substance-abuse" totalJobs={stats.totalJobs} />
        </div>
    );
}
