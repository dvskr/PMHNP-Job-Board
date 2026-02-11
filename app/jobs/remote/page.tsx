import { Metadata } from 'next';
import Link from 'next/link';
import { Wifi, Home, Clock, Globe, TrendingUp, Building2, Lightbulb, Bell, Video, Plane, GraduationCap, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

// Force dynamic rendering - don't try to statically generate during build
export const dynamic = 'force-dynamic';
export const revalidate = 0; // Disable cache to show fresh dates

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
 * Fetch remote jobs with pagination
 */
async function getRemoteJobs(skip: number = 0, take: number = 20) {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      isRemote: true,
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
 * Fetch remote job statistics
 */
async function getRemoteStats() {
  // Total remote jobs
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: true,
    },
  });

  // Average salary for remote positions
  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      isRemote: true,
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

  // Companies hiring remotely
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      isRemote: true,
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
  const stats = await getRemoteStats();

  return {
    title: 'Remote PMHNP Jobs - Telehealth Psychiatric NP Positions',
    description: `Find remote PMHNP jobs and telehealth psychiatric nurse practitioner positions. Work from home with flexible schedules. ${stats.totalJobs} remote positions available.`,
    openGraph: {
      title: `${stats.totalJobs} Remote PMHNP Jobs - Work From Home`,
      description: 'Browse telehealth and remote psychiatric mental health nurse practitioner positions. Flexible schedules, competitive pay.',
      type: 'website',
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/jobs/remote',
    },
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * Remote jobs page
 */
export default async function RemoteJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getRemoteJobs(skip, limit),
    getRemoteStats(),
  ]);

  const totalPages = Math.ceil(stats.totalJobs / limit);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Remote", url: "https://pmhnphiring.com/jobs/remote" }
      ]} />
      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Wifi className="h-8 w-8" />
              <Home className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Remote PMHNP Jobs - Work From Home
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: February 2026 | {stats.totalJobs} remote PMHNP jobs available
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Discover {stats.totalJobs} telehealth and remote psychiatric nurse practitioner positions
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Remote Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-teal-100">Hiring Companies</div>
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
                Why Choose Remote PMHNP Work?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Clock className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Flexible Schedule</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Set your own hours and create a work-life balance that fits your lifestyle.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Home className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Work From Anywhere</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Eliminate commute time and work from the comfort of your home or anywhere you choose.
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
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>National Reach</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Serve patients across state lines and expand your impact beyond your local area.
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
                  All Remote Positions ({stats.totalJobs})
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
                  <Wifi className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    No remote jobs available
                  </h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    We don&apos;t have any active remote PMHNP positions right now. Check back soon!
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
                          href={`/jobs/remote?page=${page - 1}`}
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
                          href={`/jobs/remote?page=${page + 1}`}
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
                  Get Remote Job Alerts
                </h3>
                <p className="text-sm text-teal-100 mb-4">
                  Be the first to know about new remote PMHNP positions.
                </p>
                <Link
                  href="/job-alerts?mode=Remote"
                  className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Companies Hiring Remotely */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Hiring Remotely</h3>
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
                    Based on remote PMHNP positions with salary data.
                  </p>
                </div>
              )}

              {/* Remote Work Tips */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Remote Work Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Ensure you have reliable high-speed internet</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Create a quiet, professional workspace</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Verify state licensure requirements</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Invest in quality telehealth equipment</span>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                    <span>Set clear boundaries for work hours</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Additional Resources Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Remote PMHNP Career Resources
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Telehealth Platforms
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Most remote PMHNP positions use HIPAA-compliant platforms like Zoom for Healthcare,
                  Doxy.me, or proprietary systems. Many employers provide training and technical support.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Licensure Considerations
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Remote work may require multi-state licensure. Check if your employer participates
                  in the Nurse Licensure Compact (NLC) or if they&apos;ll support additional state licenses.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Technology Requirements
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  You&apos;ll typically need a reliable computer, webcam, headset, and high-speed internet
                  (minimum 10 Mbps). Some employers provide equipment or technology stipends.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Work Environment
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Maintain a professional, private space for patient consultations. Consider background
                  noise, lighting, and HIPAA compliance when setting up your home office.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-12" style={{ borderTop: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Explore Other Job Types</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Locum tenens positions with premium pay.</p>
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
