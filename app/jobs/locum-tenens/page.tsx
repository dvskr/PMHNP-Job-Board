import { Metadata } from 'next';
import Link from 'next/link';
import { Plane, Clock, DollarSign, Globe, MapPin, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';

// Force dynamic rendering - don't try to statically generate during build
// force-dynamic removed: it overrides revalidate and defeats ISR caching
export const revalidate = 3600; // ISR: cache for 1 hour to reduce DB load under crawl pressure

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

// Locum tenens job filter
const LOCUM_FILTER = {
  isPublished: true,
  OR: [
    { title: { contains: 'locum', mode: 'insensitive' as const } },
    { title: { contains: 'locums', mode: 'insensitive' as const } },
    { title: { contains: 'travel', mode: 'insensitive' as const } },
    { title: { contains: 'temporary', mode: 'insensitive' as const } },
    { title: { contains: 'assignment', mode: 'insensitive' as const } },
    { title: { contains: 'contract', mode: 'insensitive' as const } },
  ],
};

/**
 * Fetch locum tenens jobs with pagination
 */
async function getLocumJobs(skip: number = 0, take: number = 20) {
  const jobs = await prisma.job.findMany({
    where: LOCUM_FILTER,
    orderBy: [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    skip,
    take,
  });
  return jobs;
}

/**
 * Fetch locum tenens job statistics
 */
async function getLocumStats() {
  const totalJobs = await prisma.job.count({ where: LOCUM_FILTER });

  const salaryData = await prisma.job.aggregate({
    where: {
      ...LOCUM_FILTER,
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

  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: LOCUM_FILTER,
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

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [stats, params] = await Promise.all([getLocumStats(), searchParams]);
  const page = parseInt(params.page || '1');

  return {
    title: `${stats.totalJobs} Locum Tenens PMHNP Jobs — Travel Psych NP ($85-150/hr)`,
    description: `Find ${stats.totalJobs} locum tenens PMHNP jobs paying $85-$150+/hour. Travel psychiatric nurse practitioner assignments with housing, malpractice coverage, and premium pay. Browse locum psych NP positions updated daily.`,
    keywords: ['locum tenens pmhnp', 'travel pmhnp jobs', 'locum psychiatric nurse practitioner', 'psych NP travel assignments', 'temporary pmhnp positions', 'locum tenens psych nurse practitioner'],
    openGraph: {
      title: `${stats.totalJobs} Locum Tenens PMHNP Jobs - Travel Assignments`,
      description: 'Browse locum tenens and travel psychiatric mental health nurse practitioner positions. Premium pay, housing, and malpractice coverage.',
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Locum Tenens PMHNP Jobs`)}&subtitle=${encodeURIComponent('Travel psych NP assignments with premium pay')}`,
        width: 1200,
        height: 630,
        alt: 'Locum Tenens PMHNP Jobs',
      }],
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/jobs/locum-tenens',
    },
    ...(page > 1 && {
      robots: { index: false, follow: true },
    }),
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * Locum tenens jobs page
 */
export default async function LocumTenensJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getLocumJobs(skip, limit),
    getLocumStats(),
  ]);

  const totalPages = Math.ceil(stats.totalJobs / limit);

  // Locum tenens FAQ schema
  const locumFaqs = [
    {
      question: "What is a locum tenens PMHNP?",
      answer: "A locum tenens PMHNP is a psychiatric nurse practitioner who fills temporary staffing needs at healthcare facilities. Assignments typically last 2-13 weeks and include housing stipends, travel reimbursement, malpractice coverage, and premium hourly rates of $85-$150+."
    },
    {
      question: "How much do locum tenens psychiatric nurse practitioners earn?",
      answer: "Locum tenens PMHNPs earn $85-$150+ per hour, translating to $150,000-$250,000+ annually. This is 20-50% higher than permanent positions. Additionally, locum PMHNPs receive tax-free housing stipends ($1,500-$3,500/month), travel reimbursement, and malpractice coverage."
    },
    {
      question: "Do locum tenens PMHNPs get benefits?",
      answer: "Most locum tenens staffing agencies offer benefits including health insurance, 401(k) plans, malpractice coverage, CEU reimbursement, housing stipends, and travel allowances. Benefits vary by agency and assignment length. Some agencies also offer completion bonuses."
    },
    {
      question: "What are the licensing requirements for locum tenens PMHNP work?",
      answer: "Locum tenens PMHNPs need an active APRN license in the state of each assignment. States participating in the Nurse Licensure Compact (NLC) make multi-state practice easier. Most staffing agencies assist with state licensure and credentialing for new assignments."
    },
    {
      question: "Is locum tenens work good for new grad PMHNPs?",
      answer: "Locum tenens can work for new grads who are confident in their clinical skills, but most agencies prefer 1-2 years of experience. New grads may find short-term assignments challenging due to rapid onboarding. Consider starting with permanent positions that offer mentorship before transitioning to locum work."
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Locum Tenens", url: "https://pmhnphiring.com/jobs/locum-tenens" }
      ]} />
      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: locumFaqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />
      {/* ItemList Schema */}
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Locum Tenens PMHNP Jobs',
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
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="Locum Tenens PMHNP Jobs" />
      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Plane className="h-8 w-8" />
              <DollarSign className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Locum Tenens PMHNP Jobs
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | {stats.totalJobs} locum tenens psych NP assignments available
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Discover {stats.totalJobs} travel and temporary psychiatric nurse practitioner assignments
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Locum Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Annual Pay</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">$85-150</div>
                <div className="text-sm text-teal-100">Hourly Rate Range</div>
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
                Why Choose Locum Tenens Psych NP Work?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Premium Pay Rates</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Earn $85-$150+/hour — 20-50% more than permanent positions, plus tax-free housing and travel stipends.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Globe className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Explore New Locations</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Work across multiple states, experience different practice settings, and build a diverse clinical resume.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Clock className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Schedule Flexibility</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Choose 2-13 week assignments, take time off between contracts, and control your work-life balance.
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
                  All Locum Tenens Positions ({stats.totalJobs})
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
                  <Plane className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    No locum tenens jobs available
                  </h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    We don&apos;t have any active locum tenens PMHNP positions right now. Check back soon!
                  </p>
                  <Link
                    href="/jobs/travel"
                    className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    Browse Travel Jobs
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
                          href={`/jobs/locum-tenens?page=${page - 1}`}
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
                          href={`/jobs/locum-tenens?page=${page + 1}`}
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
                  Get Locum Tenens Alerts
                </h3>
                <p className="text-sm text-teal-100 mb-4">
                  Be the first to know about new locum tenens PMHNP assignments.
                </p>
                <Link
                  href="/job-alerts"
                  className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Top Staffing Agencies */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Employers</h3>
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

              {/* Locum Tenens Tips */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Locum Tenens Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Work with multiple staffing agencies to maximize options</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Negotiate your hourly rate based on location and demand</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Maintain licenses in high-demand states</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Confirm housing and travel stipends before accepting</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Keep detailed records for tax deductions</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Locum vs Permanent */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Locum Tenens vs Permanent PMHNP Positions
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
                  ✈️ Locum Tenens (This Page)
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Temporary 2-13 week assignments with premium pay ($85-$150+/hr), housing stipends, malpractice coverage, and schedule flexibility. <strong>Ideal for experienced PMHNPs who want variety, higher income, and the freedom to choose when and where they work.</strong>
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  🏢 <Link href="/jobs" className="hover:underline" style={{ color: 'var(--color-primary)' }}>Permanent PMHNP Jobs →</Link>
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Full-time or part-time positions with stable income, employer-sponsored benefits (health insurance, 401k, PTO), career advancement, and community connection. <strong>Better for PMHNPs who value stability and long-term patient relationships.</strong>
                </p>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              Locum Tenens PMHNP FAQs
            </h2>
            {locumFaqs.map((faq, idx) => (
              <div key={idx} className="mb-6 last:mb-0">
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {faq.question}
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {faq.answer}
                </p>
              </div>
            ))}
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
              <Link href="/jobs/new-grad" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <GraduationCap className="h-5 w-5 text-indigo-500 group-hover:text-white transition-colors" />
                </div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>New Grad Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Entry level</div>
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
          <Link href="/jobs/travel" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>✈️ Travel Jobs</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>More travel and short-term assignment positions.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
