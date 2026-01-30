import { Metadata } from 'next';
import Link from 'next/link';
import { Plane, Briefcase, DollarSign, Calendar, MapPin, TrendingUp, Building2, Lightbulb, Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';

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
    },
    alternates: {
      canonical: '/jobs/travel',
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Plane className="h-8 w-8" />
              <Briefcase className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Travel PMHNP Jobs - Locum Tenens
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-6">
              Discover {stats.totalJobs} travel and locum psychiatric nurse practitioner positions
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-blue-100">Travel Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-blue-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-blue-100">Hiring Agencies</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Benefits Section */}
          <div className="mb-8 md:mb-12">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Why Choose Travel PMHNP Work?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Higher Pay</h3>
                    <p className="text-sm text-gray-600">
                      Travel and locum positions typically offer 20-40% higher compensation than permanent roles, plus housing stipends and travel reimbursement.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Flexible Assignments</h3>
                    <p className="text-sm text-gray-600">
                      Choose contract lengths that fit your lifestyle—from 4-week assignments to 6-month contracts. Take breaks between assignments as needed.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Explore New Places</h3>
                    <p className="text-sm text-gray-600">
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
                <h2 className="text-xl font-semibold text-gray-900">
                  All Travel Positions ({stats.totalJobs})
                </h2>
                <Link
                  href="/jobs"
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View All Jobs →
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Plane className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No travel jobs available
                  </h3>
                  <p className="text-gray-600 mb-6">
                    We don&apos;t have any active travel PMHNP positions right now. Check back soon!
                  </p>
                  <Link
                    href="/jobs"
                    className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
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
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          ← Previous
                        </Link>
                      ) : (
                        <span className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed">
                          ← Previous
                        </span>
                      )}

                      <span className="text-sm text-gray-600">
                        Page {page} of {totalPages}
                      </span>

                      {page < totalPages ? (
                        <Link
                          href={`/jobs/travel?page=${page + 1}`}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Next →
                        </Link>
                      ) : (
                        <span className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed">
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
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get Travel Job Alerts
                </h3>
                <p className="text-sm text-blue-100 mb-4">
                  Be the first to know about new travel and locum PMHNP positions.
                </p>
                <Link
                  href="/job-alerts"
                  className="block w-full text-center px-4 py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Companies Hiring for Travel */}
              {stats.topEmployers.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-gray-900">Top Agencies</h3>
                  </div>
                  <ul className="space-y-3">
                    {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                      <li key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 truncate flex-1">
                          {employer.name}
                        </span>
                        <span className="text-sm font-medium text-blue-600 ml-2">
                          {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Salary Insights */}
              {stats.avgSalary > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <h3 className="font-bold text-gray-900">Salary Insights</h3>
                  </div>
                  <div className="mb-4">
                    <div className="text-3xl font-bold text-gray-900">
                      ${stats.avgSalary}k
                    </div>
                    <div className="text-sm text-gray-600">
                      Average annual salary
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Based on travel PMHNP positions with salary data. Many also include housing and travel stipends.
                  </p>
                </div>
              )}

              {/* Travel Work Tips */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 text-amber-600" />
                  <h3 className="font-bold text-gray-900">Travel Tips</h3>
                </div>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Maintain active licenses in multiple states</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Keep credentials updated and easily accessible</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Work with reputable staffing agencies</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Negotiate housing and travel stipends</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Build relationships for repeat assignments</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Additional Resources Section */}
          <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 md:p-8 border border-blue-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Travel PMHNP Career Resources
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Assignment Types
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Travel assignments range from crisis coverage (2-4 weeks) to long-term contracts (6-12 months).
                  Locum tenens often fill temporary gaps while facilities recruit permanent staff.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Compensation Packages
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Travel PMHNP pay includes base hourly rates, tax-free housing stipends, travel reimbursement,
                  and often completion bonuses. Total compensation can exceed $200k annually.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Licensure Requirements
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Many travel positions require state-specific licensure. Consider joining the Nurse Licensure
                  Compact (NLC) for multi-state privileges, or work with agencies that handle licensing.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Getting Started
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Start by gaining 1-2 years of experience in a permanent role. Then partner with 2-3 staffing
                  agencies to find the best opportunities. Keep your CV and credentials always up to date.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
