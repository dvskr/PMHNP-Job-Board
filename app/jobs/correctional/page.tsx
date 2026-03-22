import { Metadata } from 'next';
import Link from 'next/link';
import { Shield, Lock, Users, AlertTriangle, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap, Plane, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface EmployerGroupResult {
  employer: string;
  _count: { employer: number };
}

interface ProcessedEmployer {
  name: string;
  count: number;
}

const CORRECTIONAL_FILTER = {
  isPublished: true,
  OR: [
    { title: { contains: 'correctional', mode: 'insensitive' as const } },
    { title: { contains: 'corrections', mode: 'insensitive' as const } },
    { title: { contains: 'prison', mode: 'insensitive' as const } },
    { title: { contains: 'forensic', mode: 'insensitive' as const } },
    { title: { contains: 'jail', mode: 'insensitive' as const } },
    { title: { contains: 'detention', mode: 'insensitive' as const } },
    { title: { contains: 'incarcerated', mode: 'insensitive' as const } },
  ],
};

async function getCorrectionalJobs(skip: number = 0, take: number = 20) {
  return prisma.job.findMany({
    where: CORRECTIONAL_FILTER,
    orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { originalPostedAt: 'desc' }, { createdAt: 'desc' }],
    skip,
    take,
  });
}

async function getCorrectionalStats() {
  const totalJobs = await prisma.job.count({ where: CORRECTIONAL_FILTER });

  const salaryData = await prisma.job.aggregate({
    where: { ...CORRECTIONAL_FILTER, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
    _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
  });

  const avgMinSalary = salaryData._avg.normalizedMinSalary || 0;
  const avgMaxSalary = salaryData._avg.normalizedMaxSalary || 0;
  const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000);

  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: CORRECTIONAL_FILTER,
    _count: { employer: true },
    orderBy: { _count: { employer: 'desc' } },
    take: 8,
  });

  const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
    name: e.employer,
    count: e._count.employer,
  }));

  return { totalJobs, avgSalary, topEmployers: processedEmployers };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [stats, params] = await Promise.all([getCorrectionalStats(), searchParams]);
  const page = parseInt(params.page || '1');

  return {
    title: `${stats.totalJobs} Correctional PMHNP Jobs — Forensic Psych NP Positions`,
    description: `Find ${stats.totalJobs} correctional and forensic PMHNP jobs. Psychiatric nurse practitioner positions in prisons, jails, and detention facilities with 15-25% salary premiums, loan forgiveness eligibility, and high clinical autonomy.`,
    keywords: ['correctional pmhnp jobs', 'forensic psychiatric nurse practitioner', 'prison pmhnp', 'corrections psych NP', 'forensic mental health NP jobs'],
    openGraph: {
      title: `${stats.totalJobs} Correctional PMHNP Jobs`,
      description: 'Browse correctional and forensic psychiatric mental health nurse practitioner positions.',
      type: 'website',
    },
    alternates: { canonical: 'https://pmhnphiring.com/jobs/correctional' },
    ...(page > 1 && { robots: { index: false, follow: true } }),
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function CorrectionalJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([getCorrectionalJobs(skip, limit), getCorrectionalStats()]);
  const totalPages = Math.ceil(stats.totalJobs / limit);

  const correctionalFaqs = [
    {
      question: "What do correctional PMHNPs do?",
      answer: "Correctional PMHNPs provide psychiatric care to incarcerated individuals in prisons, jails, and detention facilities. They conduct mental health assessments, manage psychotropic medications, provide crisis intervention, diagnose disorders, and develop treatment plans. They often work with complex presentations including co-occurring substance use disorders."
    },
    {
      question: "How much do forensic psychiatric nurse practitioners earn?",
      answer: "Forensic and correctional PMHNPs earn 15-25% more than standard psychiatric NP roles, with average salaries of $160,000-$200,000+. Federal Bureau of Prisons positions offer additional benefits including federal pension, health insurance, and student loan repayment programs."
    },
    {
      question: "Is correctional psychiatric nursing dangerous?",
      answer: "Correctional facilities have security protocols to protect healthcare providers. While the environment requires awareness and de-escalation skills, most PMHNPs report feeling safe. Facilities provide training on security procedures, and mental health providers are typically highly respected by the incarcerated population."
    },
    {
      question: "Do you need special certification for forensic PMHNP work?",
      answer: "While not required, Forensic Nursing Certification (AFN-BC) can enhance your candidacy and earning potential. Most employers provide facility-specific training. Experience with substance abuse treatment, crisis intervention, and dual-diagnosis populations is highly valued."
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Correctional", url: "https://pmhnphiring.com/jobs/correctional" }
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: correctionalFaqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          }),
        }}
      />
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Correctional PMHNP Jobs',
              numberOfItems: stats.totalJobs,
              itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: job.title,
                url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
              })),
            }),
          }}
        />
      )}
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="Correctional PMHNP Jobs" />

      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="h-8 w-8" />
              <Lock className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Correctional &amp; Forensic PMHNP Jobs
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | Correctional psychiatric nurse practitioner positions
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Discover {stats.totalJobs} forensic and correctional psych NP positions with premium pay
            </p>
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Correctional Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">+15-25%</div>
                <div className="text-sm text-teal-100">Salary Premium</div>
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
                Why Consider Correctional Psychiatric NP Work?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <AlertTriangle className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>High Clinical Autonomy</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Work with diverse, complex psychiatric presentations including dual diagnosis, personality disorders, and acute psychosis with significant clinical independence.
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
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Premium Compensation</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Earn 15-25% more than standard PMHNP roles. Federal positions include pension, health insurance, and student loan forgiveness programs.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Users className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Make a Difference</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Provide mental health care to an underserved population that desperately needs it. Your work directly impacts rehabilitation outcomes and community safety.
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
                  All Correctional Positions ({stats.totalJobs})
                </h2>
                <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>
                  View All Jobs →
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <Shield className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No correctional jobs available</h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    We don&apos;t have any active correctional PMHNP positions right now. Check back soon!
                  </p>
                  <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--color-primary)' }}>
                    Browse All Jobs
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-4">
                      {page > 1 ? (
                        <Link href={`/jobs/correctional?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>← Previous</Link>
                      ) : (
                        <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>← Previous</span>
                      )}
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                      {page < totalPages ? (
                        <Link href={`/jobs/correctional?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Next →</Link>
                      ) : (
                        <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>Next →</span>
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
                <h3 className="text-lg font-bold mb-2">Get Correctional Job Alerts</h3>
                <p className="text-sm text-teal-100 mb-4">Be the first to know about new correctional PMHNP positions.</p>
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

              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Correctional NP Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Get trained in dual-diagnosis treatment</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Learn de-escalation techniques early</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Consider forensic nursing certification (AFN-BC)</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Federal BOP positions offer top benefits</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Ask about HRSA loan repayment eligibility</span></li>
                </ul>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Correctional PMHNP FAQs</h2>
            {correctionalFaqs.map((faq, idx) => (
              <div key={idx} className="mb-6 last:mb-0">
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-12" style={{ borderTop: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Explore Other Job Types</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/jobs/remote" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Wifi className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Remote Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Work from home</div>
              </Link>
              <Link href="/jobs/locum-tenens" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Plane className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Locum Tenens</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Travel assignments</div>
              </Link>
              <Link href="/jobs/va" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Shield className="h-5 w-5 text-blue-500 group-hover:text-white transition-colors" /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>VA Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Federal positions</div>
              </Link>
              <Link href="/jobs/inpatient" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-red-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Building2 className="h-5 w-5 text-red-500 group-hover:text-white transition-colors" /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Inpatient Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Hospital settings</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
