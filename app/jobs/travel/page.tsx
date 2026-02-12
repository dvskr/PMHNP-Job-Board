import { Metadata } from 'next';
import Link from 'next/link';
import { Plane, Briefcase, DollarSign, Calendar, MapPin, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

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
 * Fetch travel/locum jobs with pagination
 */
async function getTravelJobs(skip: number = 0, take: number = 20) {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
      ],
    },
    orderBy: [
      { isFeatured: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    skip,
    take,
  });

  return jobs;
}

/**
 * Fetch travel job statistics
 */
async function getTravelStats() {
  // Total travel/locum jobs
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
      ],
    },
  });

  // Average salary for travel positions
  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      OR: [
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
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

  // Companies hiring for travel positions
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      OR: [
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
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
  const stats = await getTravelStats();

  return {
    title: 'Travel PMHNP Jobs - Locum Tenens Psychiatric NP Positions',
    description: `Find travel PMHNP jobs and locum tenens psychiatric nurse practitioner positions. Higher pay, flexible assignments, explore new places. ${stats.totalJobs} travel positions available.`,
    openGraph: {
      title: `${stats.totalJobs} Travel PMHNP Jobs - Locum Tenens Positions`,
      description: 'Browse travel and locum tenens psychiatric mental health nurse practitioner positions. Higher pay, flexible assignments, nationwide opportunities.',
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Travel PMHNP Jobs`)}&subtitle=${encodeURIComponent('Locum tenens psychiatric NP positions with premium pay')}`,
        width: 1200,
        height: 630,
        alt: 'Travel PMHNP Jobs',
      }],
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/jobs/travel',
    },
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * Travel jobs page
 */
export default async function TravelJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getTravelJobs(skip, limit),
    getTravelStats(),
  ]);

  const totalPages = Math.ceil(stats.totalJobs / limit);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Travel", url: "https://pmhnphiring.com/jobs/travel" }
      ]} />
      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Plane className="h-8 w-8" />
              <Briefcase className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Travel PMHNP Jobs - Locum Tenens
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: February 2026 | Travel & locum tenens PMHNP positions
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Discover {stats.totalJobs} travel and locum psychiatric nurse practitioner positions
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Travel Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-teal-100">Hiring Agencies</div>
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
                Why Choose Travel PMHNP Work?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Higher Pay</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Travel and locum positions typically offer 20-40% higher compensation than permanent roles, plus housing stipends and travel reimbursement.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Calendar className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Flexible Assignments</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Choose contract lengths that fit your lifestyle—from 4-week assignments to 6-month contracts. Take breaks between assignments as needed.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <MapPin className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Explore New Places</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Work in different cities and states while building your career. Experience diverse healthcare settings and patient populations.
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
                  All Travel Positions ({stats.totalJobs})
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
                    No travel jobs available
                  </h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    We don&apos;t have any active travel PMHNP positions right now. Check back soon!
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
                          href={`/jobs/travel?page=${page - 1}`}
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
                          href={`/jobs/travel?page=${page + 1}`}
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
                  Get Travel Job Alerts
                </h3>
                <p className="text-sm text-teal-100 mb-4">
                  Be the first to know about new travel and locum PMHNP positions.
                </p>
                <Link
                  href="/job-alerts"
                  className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Companies Hiring for Travel */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Agencies</h3>
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
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Salary Insights</h3>
                  </div>
                  <div className="mb-4">
                    <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      ${stats.avgSalary}k
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Average annual salary
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Based on travel PMHNP positions with salary data. Many also include housing and travel stipends.
                  </p>
                </div>
              )}

              {/* Travel Work Tips */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Travel Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Maintain active licenses in multiple states</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Keep credentials updated and easily accessible</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Work with reputable staffing agencies</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Negotiate housing and travel stipends</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Build relationships for repeat assignments</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Additional Resources Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Travel PMHNP Career Resources
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Assignment Types
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Travel assignments range from crisis coverage (2-4 weeks) to long-term contracts (6-12 months).
                  Locum tenens often fill temporary gaps while facilities recruit permanent staff.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Compensation Packages
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Travel PMHNP pay includes base hourly rates, tax-free housing stipends, travel reimbursement,
                  and often completion bonuses. Total compensation can exceed $200k annually.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Licensure Requirements
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Many travel positions require state-specific licensure. Consider joining the Nurse Licensure
                  Compact (NLC) for multi-state privileges, or work with agencies that handle licensing.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Getting Started
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Start by gaining 1-2 years of experience in a permanent role. Then partner with 2-3 staffing
                  agencies to find the best opportunities. Keep your CV and credentials always up to date.
                </p>
              </div>
            </div>
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

          <Link href="/jobs/remote" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏠 Remote Jobs</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Telehealth and work-from-home PMHNP positions.</p>
          </Link>

          <Link href="/jobs/new-grad" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🎓 New Grad Jobs</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Entry-level PMHNP opportunities.</p>
          </Link>

          <Link href="/jobs/telehealth" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💻 Telehealth Jobs</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Virtual psychiatric care positions.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
