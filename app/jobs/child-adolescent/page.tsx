import { Metadata } from 'next';
import Link from 'next/link';
import { Baby, Heart, DollarSign, BookOpen, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, Calendar, Plane, Building, Users, Pill } from 'lucide-react';
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

async function getChildAdolescentJobs(skip: number = 0, take: number = 20) {
    return prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'child', mode: 'insensitive' } },
                { title: { contains: 'adolescent', mode: 'insensitive' } },
                { title: { contains: 'pediatric', mode: 'insensitive' } },
                { title: { contains: 'youth', mode: 'insensitive' } },
                { title: { contains: 'CAPMHNP', mode: 'insensitive' } },
                { description: { contains: 'child and adolescent', mode: 'insensitive' } },
                { description: { contains: 'pediatric psychiatry', mode: 'insensitive' } },
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

async function getChildAdolescentStats() {
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'child', mode: 'insensitive' } },
                { title: { contains: 'adolescent', mode: 'insensitive' } },
                { title: { contains: 'pediatric', mode: 'insensitive' } },
                { title: { contains: 'youth', mode: 'insensitive' } },
                { title: { contains: 'CAPMHNP', mode: 'insensitive' } },
                { description: { contains: 'child and adolescent', mode: 'insensitive' } },
                { description: { contains: 'pediatric psychiatry', mode: 'insensitive' } },
            ],
        },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'child', mode: 'insensitive' } },
                { title: { contains: 'adolescent', mode: 'insensitive' } },
                { title: { contains: 'pediatric', mode: 'insensitive' } },
                { description: { contains: 'child and adolescent', mode: 'insensitive' } },
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
                { title: { contains: 'child', mode: 'insensitive' } },
                { title: { contains: 'adolescent', mode: 'insensitive' } },
                { title: { contains: 'pediatric', mode: 'insensitive' } },
                { description: { contains: 'child and adolescent', mode: 'insensitive' } },
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
    const [stats, params] = await Promise.all([getChildAdolescentStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Child & Adolescent PMHNP Jobs — Pediatric Psych NP ($125K-180K)`,
        description: `Find ${stats.totalJobs} child and adolescent PMHNP jobs paying $125K-$180K+. Pediatric psychiatric nurse practitioner positions in schools, clinics, and children's hospitals. ADHD, anxiety, and behavioral health specialists needed.`,
        keywords: ['child pmhnp jobs', 'adolescent pmhnp', 'pediatric psychiatric nurse practitioner', 'child psychiatry np', 'CAPMHNP jobs'],
        openGraph: {
            title: `${stats.totalJobs} Child & Adolescent PMHNP Jobs`,
            description: 'Browse pediatric psychiatric nurse practitioner positions. Schools, children\'s hospitals, and youth behavioral health.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Child & Adolescent PMHNP Jobs`)}&subtitle=${encodeURIComponent('Pediatric psychiatric NP positions')}`,
                width: 1200, height: 630, alt: 'Child & Adolescent PMHNP Jobs',
            }],
        },
        alternates: { canonical: 'https://pmhnphiring.com/jobs/child-adolescent' },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function ChildAdolescentJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([getChildAdolescentJobs(skip, limit), getChildAdolescentStats()]);
    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Child & Adolescent", url: "https://pmhnphiring.com/jobs/child-adolescent" }
            ]} />

            <section className="bg-teal-600 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Baby className="h-8 w-8" />
                            <Heart className="h-8 w-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">Child & Adolescent PMHNP Jobs</h1>
                        <p className="text-sm text-teal-200 mt-2 mb-4">Last Updated: March 2026 | Pediatric psychiatry & youth behavioral health</p>
                        <p className="text-lg md:text-xl text-teal-100 mb-6">Discover {stats.totalJobs} pediatric psychiatric nurse practitioner positions</p>
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
                            <div className="text-center"><div className="text-3xl font-bold">{stats.totalJobs}</div><div className="text-sm text-teal-100">Pediatric Positions</div></div>
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
                            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Why Specialize in Child & Adolescent Psychiatry?</h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Heart className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Critical Shortage</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>The youth mental health crisis has created unprecedented demand. There are only ~8,000 child psychiatrists for 74 million US children. PMHNPs are essential to filling this gap.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><BookOpen className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>School-Based Opportunities</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Growing demand for school-based mental health providers. Many districts now embed PMHNPs directly in schools, offering unique schedules aligned with the academic calendar.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0"><div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}><DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /></div></div>
                                    <div>
                                        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Growing Compensation</h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pediatric PMHNP salaries have increased 15-20% in recent years due to extreme demand. Subspecialty expertise in ASD, ADHD, and eating disorders commands premium pay.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-3">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>All Pediatric Positions ({stats.totalJobs})</h2>
                                <Link href="/jobs" className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
                            </div>
                            {jobs.length === 0 ? (
                                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Baby className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No child/adolescent jobs available</h3>
                                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Check back soon for new pediatric PMHNP positions!</p>
                                    <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">{jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}</div>
                                    {totalPages > 1 && (
                                        <div className="mt-8 flex items-center justify-center gap-4">
                                            {page > 1 ? <Link href={`/jobs/child-adolescent?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>← Previous</Link> : <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>← Previous</span>}
                                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                                            {page < totalPages ? <Link href={`/jobs/child-adolescent?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Next →</Link> : <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>Next →</span>}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="lg:col-span-1">
                            <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                                <Bell className="h-8 w-8 mb-3" />
                                <h3 className="text-lg font-bold mb-2">Get Pediatric Job Alerts</h3>
                                <p className="text-sm text-teal-100 mb-4">Be the first to know about new child & adolescent PMHNP positions.</p>
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
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Pediatric PMHNP roles in children&apos;s hospitals and academic medical centers often include full benefits, tuition assistance, and research opportunities.</p>
                                </div>
                            )}
                            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="flex items-center gap-2 mb-4"><Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /><h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Pediatric Tips</h3></div>
                                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Get trained in play therapy and age-appropriate assessments</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Learn family systems therapy for parent involvement</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Stay current on pediatric psychopharmacology dosing</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Consider school-based positions for work-life balance</span></li>
                                    <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Build expertise in ADHD, anxiety, and ASD</span></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Child & Adolescent PMHNP Career Resources</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Common Settings</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Children&apos;s hospitals, school-based health centers, pediatric clinics, residential treatment facilities, juvenile justice systems, foster care agencies, and university-affiliated practices.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Common Conditions</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>ADHD, anxiety disorders, depression, autism spectrum disorder (ASD), oppositional defiant disorder, eating disorders, trauma/PTSD, and emerging personality disorders in adolescents.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Certifications</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>While the standard PMHNP certification (ANCC) covers across-the-lifespan, additional training in child/adolescent psychiatry through fellowships or CE courses enhances competitiveness significantly.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Unique Considerations</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pediatric prescribing requires careful attention to growth effects, FDA black box warnings, and evidence-based guidelines (AAP, AACAP). Family involvement and school coordination are essential components of treatment.</p>
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
                            <Link href="/jobs/substance-abuse" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-amber-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Pill className="h-5 w-5 text-amber-500 group-hover:text-white transition-colors" /></div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Addiction</div>
                                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>MAT & SUD</div>
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
                        </div>
                    </div>
                </div>
            </div>

            <CategoryFAQ category="child-adolescent" totalJobs={stats.totalJobs} />
        </div>
    );
}
