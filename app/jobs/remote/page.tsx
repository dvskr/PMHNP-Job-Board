import { Metadata } from 'next';
import Link from 'next/link';
import { Wifi, Home, Clock, Globe, TrendingUp, Building2, Lightbulb, Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';

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
 * Fetch remote jobs
 */
async function getRemoteJobs() {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      isRemote: true,
    },
    orderBy: [
      { isFeatured: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 50,
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
      canonical: '/jobs/remote',
    },
  };
}

/**
 * Remote jobs page
 */
export default async function RemoteJobsPage() {
  const [jobs, stats] = await Promise.all([
    getRemoteJobs(),
    getRemoteStats(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-600 to-blue-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Wifi className="h-8 w-8" />
              <Home className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Remote PMHNP Jobs - Work From Home
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-6">
              Discover {stats.totalJobs} telehealth and remote psychiatric nurse practitioner positions
            </p>
            
            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-blue-100">Remote Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-blue-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-blue-100">Hiring Companies</div>
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
                Why Choose Remote PMHNP Work?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Flexible Schedule</h3>
                    <p className="text-sm text-gray-600">
                      Set your own hours and create a work-life balance that fits your lifestyle.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <Home className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Work From Anywhere</h3>
                    <p className="text-sm text-gray-600">
                      Eliminate commute time and work from the comfort of your home or anywhere you choose.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Globe className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">National Reach</h3>
                    <p className="text-sm text-gray-600">
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
                <h2 className="text-xl font-semibold text-gray-900">
                  All Remote Positions ({stats.totalJobs})
                </h2>
                <Link 
                  href="/jobs"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  View All Jobs →
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Wifi className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No remote jobs available
                  </h3>
                  <p className="text-gray-600 mb-6">
                    We don't have any active remote PMHNP positions right now. Check back soon!
                  </p>
                  <Link
                    href="/jobs"
                    className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                  >
                    Browse All Jobs
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 md:gap-6">
                  {jobs.map((job: Job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Job Alert CTA */}
              <div className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get Remote Job Alerts
                </h3>
                <p className="text-sm text-blue-100 mb-4">
                  Be the first to know about new remote PMHNP positions.
                </p>
                <Link
                  href="/job-alerts?mode=Remote"
                  className="block w-full text-center px-4 py-2 bg-white text-primary-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Companies Hiring Remotely */}
              {stats.topEmployers.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-primary-600" />
                    <h3 className="font-bold text-gray-900">Hiring Remotely</h3>
                  </div>
                  <ul className="space-y-3">
                    {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                      <li key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 truncate flex-1">
                          {employer.name}
                        </span>
                        <span className="text-sm font-medium text-primary-600 ml-2">
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
                    Based on remote PMHNP positions with salary data.
                  </p>
                </div>
              )}

              {/* Remote Work Tips */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 text-amber-600" />
                  <h3 className="font-bold text-gray-900">Remote Work Tips</h3>
                </div>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Ensure you have reliable high-speed internet</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Create a quiet, professional workspace</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Verify state licensure requirements</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Invest in quality telehealth equipment</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Set clear boundaries for work hours</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Additional Resources Section */}
          <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 md:p-8 border border-blue-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Remote PMHNP Career Resources
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Telehealth Platforms
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Most remote PMHNP positions use HIPAA-compliant platforms like Zoom for Healthcare, 
                  Doxy.me, or proprietary systems. Many employers provide training and technical support.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Licensure Considerations
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Remote work may require multi-state licensure. Check if your employer participates 
                  in the Nurse Licensure Compact (NLC) or if they'll support additional state licenses.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Technology Requirements
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  You'll typically need a reliable computer, webcam, headset, and high-speed internet 
                  (minimum 10 Mbps). Some employers provide equipment or technology stipends.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Work Environment
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Maintain a professional, private space for patient consultations. Consider background 
                  noise, lighting, and HIPAA compliance when setting up your home office.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

