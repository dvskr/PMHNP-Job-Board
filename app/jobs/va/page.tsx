import { Metadata } from 'next';
import Link from 'next/link';
import { Shield, Award, Clock, Building2, TrendingUp, Lightbulb, Bell, GraduationCap, Calendar, Home, Heart, Briefcase } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';

// ISR: cache for 1 hour
export const revalidate = 3600;

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

// VA-related search terms for filtering
const VA_KEYWORDS = ['Veterans Health Administration', 'Veterans Affairs', 'Department of Veterans', 'VA Medical Center', 'VA Healthcare'];

/**
 * Fetch VA jobs with pagination
 */
async function getVAJobs(skip: number = 0, take: number = 20) {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        { employer: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'VA ', mode: 'insensitive' } },
        { employer: { startsWith: 'VA ', mode: 'insensitive' } },
        { title: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'Department of Veterans', mode: 'insensitive' } },
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

  return jobs;
}

/**
 * Fetch VA job statistics
 */
async function getVAStats() {
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { employer: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'VA ', mode: 'insensitive' } },
        { employer: { startsWith: 'VA ', mode: 'insensitive' } },
        { title: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'Department of Veterans', mode: 'insensitive' } },
      ],
    },
  });

  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      OR: [
        { employer: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'VA ', mode: 'insensitive' } },
        { employer: { startsWith: 'VA ', mode: 'insensitive' } },
        { title: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'Department of Veterans', mode: 'insensitive' } },
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

  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      OR: [
        { employer: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'VA ', mode: 'insensitive' } },
        { employer: { startsWith: 'VA ', mode: 'insensitive' } },
        { title: { contains: 'Veterans', mode: 'insensitive' } },
        { employer: { contains: 'Department of Veterans', mode: 'insensitive' } },
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
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [stats, params] = await Promise.all([getVAStats(), searchParams]);
  const page = parseInt(params.page || '1');

  return {
    title: `${stats.totalJobs} VA PMHNP Jobs — Federal Benefits, EDRP & Pension ($120K-175K)`,
    description: `Find ${stats.totalJobs} VA psychiatric nurse practitioner jobs with federal pension, EDRP student loan repayment up to $200K, FEHB health insurance, 5+ weeks PTO, and full practice authority nationwide. Browse VA PMHNP positions updated daily.`,
    openGraph: {
      title: `${stats.totalJobs} VA PMHNP Jobs - Veterans Affairs`,
      description: 'Browse VA psychiatric mental health nurse practitioner positions. Federal benefits, loan repayment, clinical autonomy.',
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} VA PMHNP Jobs`)}&subtitle=${encodeURIComponent('Federal benefits & EDRP loan repayment')}`,
        width: 1200,
        height: 630,
        alt: 'VA PMHNP Jobs',
      }],
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/jobs/va',
    },
    ...(page > 1 && {
      robots: {
        index: false,
        follow: true,
      },
    }),
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * VA PMHNP Jobs page
 */
export default async function VAJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getVAJobs(skip, limit),
    getVAStats(),
  ]);

  const totalPages = Math.ceil(stats.totalJobs / limit);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "VA Jobs", url: "https://pmhnphiring.com/jobs/va" }
      ]} />
      {/* ItemList Schema */}
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'VA PMHNP Jobs',
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
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="VA PMHNP Jobs" />

      {/* Hero Section */}
      <section className="bg-blue-800 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="h-8 w-8" />
              <Award className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              VA PMHNP Jobs — Veterans Affairs
            </h1>
            <p className="text-sm text-blue-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | {stats.totalJobs} VA PMHNP jobs available
            </p>
            <p className="text-lg md:text-xl text-blue-100 mb-6">
              Federal benefits, EDRP loan repayment up to $200K, and full practice authority nationwide
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-blue-100">VA Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-blue-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">$200K</div>
                <div className="text-sm text-blue-100">Max EDRP</div>
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
                Why Choose VA PMHNP Careers?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Award className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Federal Benefits</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      FERS pension, TSP with 5% match, FEHB insurance, 5+ weeks PTO, 13 sick days, and 11 federal holidays.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <GraduationCap className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>EDRP Loan Repayment</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Up to $200,000 in student loan repayment over 5 years through the Education Debt Reduction Program.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Shield className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Full Practice Authority</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      VA grants PMHNPs full practice authority nationwide — independent prescribing regardless of state laws.
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
                  All VA Positions ({stats.totalJobs})
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
                  <Shield className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    No VA jobs available right now
                  </h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    VA positions are posted periodically. Check back soon or set up an alert!
                  </p>
                  <Link
                    href="/jobs"
                    className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: 'var(--color-primary)' }}
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
                          href={`/jobs/va?page=${page - 1}`}
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
                          href={`/jobs/va?page=${page + 1}`}
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
              <div className="bg-blue-800 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get VA Job Alerts
                </h3>
                <p className="text-sm text-blue-100 mb-4">
                  Be the first to know about new VA PMHNP positions.
                </p>
                <Link
                  href="/job-alerts"
                  className="block w-full text-center px-4 py-2 bg-white text-blue-800 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* VA Employers */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>VA Employers</h3>
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

              {/* Salary Insights */}
              {stats.avgSalary > 0 && (
                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>VA Salary Range</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>NP Level I (New Grad)</div>
                      <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>$108K-$135K</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>NP Level II (3-7 yrs)</div>
                      <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>$130K-$155K</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>NP Level III (8+ yrs)</div>
                      <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>$145K-$175K</div>
                    </div>
                  </div>
                  <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
                    + locality pay adjustments of 15-40% in high-cost areas.
                  </p>
                </div>
              )}

              {/* VA Tips */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>VA Application Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Federal resumes must be 5-7 pages (not 1-2)</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Include hours/week and supervisor info for each position</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Apply through USAJobs.gov for federal positions</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Confirm EDRP eligibility during your interview</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Federal hiring typically takes 30-90+ days</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Federal Benefits Breakdown */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              VA Benefits Package: Total Compensation Value
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  🏦 FERS Pension
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Lifetime annuity: 1% × years of service × high-3 salary average. 20 years = 20% of salary for life.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  📈 TSP (Thrift Savings Plan)
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Federal 401(k) equivalent with 5% employer match. Low-fee index funds including the G Fund (government bonds).
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  🏥 FEHB Health Insurance
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Government pays 72-75% of premiums. Value: $8,000-$15,000/year. Continues into retirement.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  🎓 EDRP Loan Repayment
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Up to $200,000 over 5 years ($40K/year max). Most PMHNP positions are EDRP-eligible.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  🏖️ Leave & Holidays
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  13-26 days annual leave (increases with tenure), 13 sick days (unlimited accumulation), 11 federal holidays.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  🛡️ Malpractice Coverage
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Free coverage under the Federal Tort Claims Act. No personal malpractice insurance needed.
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
                  <Home className="h-5 w-5 group-hover:text-white transition-colors" style={{ color: 'var(--color-primary)' }} />
                </div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Remote Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Work from home</div>
              </Link>
              <Link href="/jobs/new-grad" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <GraduationCap className="h-5 w-5 text-indigo-500 group-hover:text-white transition-colors" />
                </div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>New Grad Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Entry level</div>
              </Link>
              <Link href="/jobs/inpatient" className="block p-4 rounded-xl hover:shadow-md transition-all group" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-red-600 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <Heart className="h-5 w-5 text-red-500 group-hover:text-white transition-colors" />
                </div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Inpatient Jobs</div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Hospital-based</div>
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

      {/* Related Resources */}
      <section className="mt-12 mb-8 container mx-auto px-4">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>VA PMHNP Resources</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/blog/va-pmhnp-jobs-guide-2026" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏥 VA PMHNP Jobs Guide</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Complete guide: federal benefits, EDRP, how to apply through USAJobs.</p>
          </Link>

          <Link href="/resources/fpa-guide" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>⚖️ Full Practice Authority Guide</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>VA grants FPA nationwide — understand what this means for your practice.</p>
          </Link>

          <Link href="/blog/pmhnp-resume-ats-guide-2026" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📝 Federal Resume Guide</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Federal resumes are 5-7 pages. Learn the format that gets you hired.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
