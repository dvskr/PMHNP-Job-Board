import { Metadata } from 'next';
import Link from 'next/link';
import { FileText, DollarSign, Scale, Calculator, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap, Plane, Calendar } from 'lucide-react';
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

const IC_FILTER = {
  isPublished: true,
  OR: [
    { title: { contains: '1099', mode: 'insensitive' as const } },
    { title: { contains: 'independent contractor', mode: 'insensitive' as const } },
    { title: { contains: 'contract', mode: 'insensitive' as const } },
    { title: { contains: 'contractor', mode: 'insensitive' as const } },
    { title: { contains: 'PRN', mode: 'insensitive' as const } },
  ],
};

async function getICJobs(skip: number = 0, take: number = 20) {
  return prisma.job.findMany({
    where: IC_FILTER,
    orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { originalPostedAt: 'desc' }, { createdAt: 'desc' }],
    skip,
    take,
  });
}

async function getICStats() {
  const totalJobs = await prisma.job.count({ where: IC_FILTER });

  const salaryData = await prisma.job.aggregate({
    where: { ...IC_FILTER, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
    _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
  });

  const avgMinSalary = salaryData._avg.normalizedMinSalary || 0;
  const avgMaxSalary = salaryData._avg.normalizedMaxSalary || 0;
  const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000);

  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: IC_FILTER,
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
  const [stats, params] = await Promise.all([getICStats(), searchParams]);
  const page = parseInt(params.page || '1');

  return {
    title: `${stats.totalJobs} 1099 PMHNP Jobs — Independent Contractor Psych NP`,
    description: `Find ${stats.totalJobs} 1099 PMHNP and independent contractor psychiatric nurse practitioner jobs. Higher hourly rates ($75-$150+/hr), schedule flexibility, and tax advantages. Compare 1099 vs W2 psych NP positions.`,
    keywords: ['1099 pmhnp jobs', '1099 pmhnp telehealth', 'independent contractor pmhnp', 'contract psychiatric nurse practitioner', '1099 psych NP', 'independent contractor psychiatric NP'],
    openGraph: {
      title: `${stats.totalJobs} 1099 PMHNP Jobs - Independent Contractor`,
      description: 'Browse 1099 and independent contractor psychiatric mental health nurse practitioner positions.',
      type: 'website',
    },
    alternates: { canonical: 'https://pmhnphiring.com/jobs/1099' },
    ...(page > 1 && { robots: { index: false, follow: true } }),
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function IndependentContractorJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([getICJobs(skip, limit), getICStats()]);
  const totalPages = Math.ceil(stats.totalJobs / limit);

  const icFaqs = [
    {
      question: "What is a 1099 PMHNP position?",
      answer: "A 1099 PMHNP works as an independent contractor rather than a W2 employee. You receive a 1099-NEC tax form instead of a W-2. You set your own schedule, pay your own taxes (including self-employment tax), and provide your own benefits. In exchange, you typically earn 20-40% higher gross pay than W2 positions."
    },
    {
      question: "How much do 1099 PMHNPs earn compared to W2?",
      answer: "1099 PMHNPs typically earn $75-$150+/hour gross, which is 20-40% higher than W2 rates. However, after accounting for self-employment tax (15.3%), health insurance ($500-$1,500/month), malpractice insurance ($1,500-$3,000/year), and retirement contributions, net take-home is often comparable to a W2 position paying 15-20% less."
    },
    {
      question: "What are the tax advantages of 1099 PMHNP work?",
      answer: "1099 PMHNPs can deduct business expenses including home office, mileage, professional development, malpractice insurance, health insurance premiums, retirement plan contributions (SEP-IRA up to $66,000/year or Solo 401k), technology/equipment, and professional memberships. These deductions can significantly reduce taxable income."
    },
    {
      question: "Should new grad PMHNPs take 1099 positions?",
      answer: "We generally recommend new grads start with W2 positions that offer mentorship, malpractice coverage, and benefits. 1099 work requires clinical confidence, business management skills, and financial discipline. Most PMHNPs transition to 1099 after 2-3 years of experience when they can negotiate better rates and manage the business aspects."
    },
    {
      question: "What do 1099 PMHNPs need to set up?",
      answer: "1099 PMHNPs should: 1) Form an LLC or PLLC for liability protection, 2) Get individual malpractice insurance, 3) Set up a business bank account, 4) Obtain an EIN from the IRS, 5) Register for quarterly estimated tax payments, 6) Open a SEP-IRA or Solo 401k, 7) Secure health insurance through the marketplace or spouse's plan."
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "1099 / Independent Contractor", url: "https://pmhnphiring.com/jobs/1099" }
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: icFaqs.map((faq) => ({
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
              name: '1099 PMHNP Jobs',
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
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="1099 PMHNP Jobs" />

      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <FileText className="h-8 w-8" />
              <DollarSign className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              1099 PMHNP Jobs — Independent Contractor
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | {stats.totalJobs} 1099 psych NP positions available
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Discover {stats.totalJobs} independent contractor psychiatric nurse practitioner positions
            </p>
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">1099 Positions</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">$75-150+</div>
                <div className="text-sm text-teal-100">Hourly Rate Range</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">+20-40%</div>
                <div className="text-sm text-teal-100">Higher Gross Pay</div>
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
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Why Choose 1099 / Independent Contractor PMHNP Work?</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Higher Gross Pay</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Earn $75-$150+/hour — 20-40% higher gross rates than W2 positions, with significant tax deduction opportunities.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Scale className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Schedule Control</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Set your own hours, work with multiple clients, and control your patient volume and clinical focus areas.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Calculator className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Tax Advantages</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Deduct business expenses, contribute up to $66,000/year to a SEP-IRA, and write off home office, mileage, and professional development.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 1099 vs W2 Comparison */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>1099 vs W2 PMHNP: Quick Comparison</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th className="text-left py-3 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Factor</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--color-primary)' }}>1099 (Independent Contractor)</th>
                      <th className="text-left py-3 pl-4 font-semibold" style={{ color: 'var(--text-primary)' }}>W2 (Employee)</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--text-secondary)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Gross Pay</td>
                      <td className="py-3 px-4">$75-$150+/hour</td>
                      <td className="py-3 pl-4">$55-$100/hour</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Health Insurance</td>
                      <td className="py-3 px-4">Self-provided (tax deductible)</td>
                      <td className="py-3 pl-4">Employer-sponsored</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Retirement</td>
                      <td className="py-3 px-4">SEP-IRA/Solo 401k ($66K limit)</td>
                      <td className="py-3 pl-4">Employer 401k (match)</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Malpractice</td>
                      <td className="py-3 px-4">Self-provided ($1.5-3K/yr)</td>
                      <td className="py-3 pl-4">Employer-provided</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Schedule</td>
                      <td className="py-3 px-4">You set your hours</td>
                      <td className="py-3 pl-4">Employer-defined</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Taxes</td>
                      <td className="py-3 px-4">Self-employment tax (15.3%)</td>
                      <td className="py-3 pl-4">Employer pays half FICA</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                See our full <Link href="/resources/1099-vs-w2" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>1099 vs W2 Guide for PMHNPs</Link> for a detailed breakdown with income calculators.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>All 1099 / Contract Positions ({stats.totalJobs})</h2>
                <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No 1099 jobs available</h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>We don&apos;t have any active 1099 PMHNP positions right now. Check back soon!</p>
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
                        <Link href={`/jobs/1099?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>← Previous</Link>
                      ) : (
                        <span className="px-4 py-2 text-sm font-medium rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>← Previous</span>
                      )}
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                      {page < totalPages ? (
                        <Link href={`/jobs/1099?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Next →</Link>
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
                <h3 className="text-lg font-bold mb-2">Get 1099 Job Alerts</h3>
                <p className="text-sm text-teal-100 mb-4">Be the first to know about new independent contractor PMHNP positions.</p>
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
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>1099 PMHNP Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Set aside 25-30% of income for taxes</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Form an LLC for liability protection</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Max out your SEP-IRA or Solo 401k</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Get your own malpractice policy</span></li>
                  <li className="flex gap-2"><span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span><span>Track all business expenses for deductions</span></li>
                </ul>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>1099 PMHNP FAQs</h2>
            {icFaqs.map((faq, idx) => (
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
              <Link href="/jobs/telehealth" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Video className="h-5 w-5 text-purple-500 group-hover:text-white transition-colors" /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Telehealth Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Virtual care</div>
              </Link>
              <Link href="/jobs/locum-tenens" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Plane className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Locum Tenens</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Travel assignments</div>
              </Link>
              <Link href="/jobs/private-practice" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}><Building2 className="h-5 w-5 text-green-500 group-hover:text-white transition-colors" /></div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Private Practice</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Own your practice</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
