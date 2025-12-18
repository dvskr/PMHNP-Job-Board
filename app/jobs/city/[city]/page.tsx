import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Building2, TrendingUp, Bell, Navigation } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';

// Type definitions for Prisma groupBy results
interface EmployerGroupResult {
  employer: string;
  _count: { employer: number };
}

interface CityGroupResult {
  city: string | null;
  _count: { city: number } | null;
}

// Type definitions for processed/rendered data
interface ProcessedEmployer {
  name: string;
  count: number;
}

interface ProcessedCity {
  name: string;
  count: number;
  slug: string;
}

interface CityPageProps {
  params: Promise<{ city: string }>;
}

/**
 * Parse city from URL parameter
 * Converts "new-york" → "New York"
 */
function parseCityParam(cityParam: string): string {
  return cityParam
    .split('-')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Fetch jobs for a specific city
 */
async function getCityJobs(cityName: string) {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      city: {
        equals: cityName,
        mode: 'insensitive',
      },
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
 * Fetch city statistics
 */
async function getCityStats(cityName: string) {
  // Total jobs in city
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      city: {
        equals: cityName,
        mode: 'insensitive',
      },
    },
  });

  // Get state for this city (from first job)
  const sampleJob = await prisma.job.findFirst({
    where: {
      isPublished: true,
      city: {
        equals: cityName,
        mode: 'insensitive',
      },
      state: { not: null },
    },
    select: {
      state: true,
      stateCode: true,
    },
  });

  const state = sampleJob?.state || null;
  const stateCode = sampleJob?.stateCode || null;

  // Average salary
  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      city: {
        equals: cityName,
        mode: 'insensitive',
      },
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

  // Top employers
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      city: {
        equals: cityName,
        mode: 'insensitive',
      },
    },
    _count: {
      employer: true,
    },
    orderBy: {
      _count: {
        employer: 'desc',
      },
    },
    take: 5,
  });

  // Nearby cities (same state, different city)
  const nearbyCities = state ? await prisma.job.groupBy({
    by: ['city'],
    where: {
      isPublished: true,
      state: state,
      city: {
        not: cityName,
      },
    },
    _count: {
      city: true,
    },
    orderBy: {
      _count: {
        city: 'desc',
      },
    },
    take: 5,
  }) : [];

  // Process top employers with explicit typing
  const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
    name: e.employer,
    count: e._count.employer,
  }));

  // Process nearby cities with explicit typing
  const processedCities = nearbyCities
    .filter((c: CityGroupResult) => c.city !== null)
    .map((c: CityGroupResult) => ({
      name: c.city!,
      count: c._count?.city || 0,
      slug: c.city!.toLowerCase().replace(/\s+/g, '-'),
    }));

  return {
    totalJobs,
    state,
    stateCode,
    avgSalary,
    topEmployers: processedEmployers,
    nearbyCities: processedCities,
  };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { city: cityParam } = await params;
  const cityName = parseCityParam(cityParam);
  const stats = await getCityStats(cityName);

  if (stats.totalJobs === 0) {
    return {
      title: `PMHNP Jobs in ${cityName}`,
      description: `Find psychiatric mental health nurse practitioner jobs in ${cityName}.`,
    };
  }

  const location = stats.state ? `${cityName}, ${stats.stateCode || stats.state}` : cityName;

  return {
    title: `PMHNP Jobs in ${location} - ${stats.totalJobs} Psychiatric NP Positions`,
    description: `Find ${stats.totalJobs} PMHNP jobs in ${location}. Psychiatric mental health nurse practitioner positions${stats.avgSalary > 0 ? ` with average salary $${stats.avgSalary}k` : ''}. Apply today.`,
    openGraph: {
      title: `${stats.totalJobs} PMHNP Jobs in ${location}`,
      description: `Browse psychiatric mental health nurse practitioner jobs in ${cityName}${stats.avgSalary > 0 ? `. Average salary: $${stats.avgSalary}k/year` : ''}.`,
      type: 'website',
    },
    alternates: {
      canonical: `/jobs/city/${cityParam}`,
    },
  };
}

/**
 * Generate static params for top cities
 */
export async function generateStaticParams() {
  // Get top 30 cities by job count
  const topCities = await prisma.job.groupBy({
    by: ['city'],
    where: {
      isPublished: true,
      city: { not: null },
    },
    _count: {
      city: true,
    },
    orderBy: {
      _count: {
        city: 'desc',
      },
    },
    take: 30,
  });

  // Process with explicit typing
  const filteredCities = topCities.filter((c: CityGroupResult) => c.city !== null);
  return filteredCities.map((c: CityGroupResult) => ({
    city: c.city!.toLowerCase().replace(/\s+/g, '-'),
  }));
}

/**
 * City-specific job listings page
 */
export default async function CityJobsPage({ params }: CityPageProps) {
  const { city: cityParam } = await params;
  const cityName = parseCityParam(cityParam);
  
  const [jobs, stats] = await Promise.all([
    getCityJobs(cityName),
    getCityStats(cityName),
  ]);

  // If no jobs found, show not found
  if (stats.totalJobs === 0) {
    notFound();
  }

  const location = stats.state ? `${cityName}, ${stats.stateCode || stats.state}` : cityName;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <MapPin className="h-8 w-8" />
              {stats.stateCode && (
                <span className="text-lg font-medium">{stats.stateCode}</span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              PMHNP Jobs in {location}
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-6">
              Discover {stats.totalJobs} psychiatric mental health nurse practitioner {stats.totalJobs === 1 ? 'position' : 'positions'}
            </p>
            
            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-blue-100">Open Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-blue-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-blue-100">Employers</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Local Market Info */}
          <div className="mb-8 md:mb-12">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                PMHNP Job Market in {cityName}
              </h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                {cityName} offers {stats.totalJobs === 1 ? 'a' : stats.totalJobs} active PMHNP {stats.totalJobs === 1 ? 'position' : 'positions'} across 
                various healthcare settings including hospitals, outpatient clinics, telepsychiatry, and 
                private practices. The local mental health care landscape provides diverse opportunities 
                for psychiatric nurse practitioners at all career levels.
              </p>
              {stats.avgSalary > 0 && (
                <p className="text-gray-600 leading-relaxed">
                  The average salary for PMHNP positions in {cityName} is approximately ${stats.avgSalary},000 
                  annually, with opportunities for both full-time and part-time work arrangements.
                </p>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  All Jobs ({stats.totalJobs})
                </h2>
                {stats.state && (
                  <Link 
                    href={`/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View All {stats.stateCode} Jobs →
                  </Link>
                )}
              </div>

              <div className="grid gap-4 md:gap-6">
                {jobs.map((job: Job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Job Alert CTA */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get {cityName} Job Alerts
                </h3>
                <p className="text-sm text-blue-100 mb-4">
                  Be the first to know about new PMHNP positions in {cityName}.
                </p>
                <Link
                  href={`/job-alerts?location=${encodeURIComponent(cityName)}`}
                  className="block w-full text-center px-4 py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Top Employers */}
              {stats.topEmployers.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-gray-900">Top Employers</h3>
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
                    Based on PMHNP positions in {cityName} with salary data.
                  </p>
                </div>
              )}

              {/* Nearby Cities */}
              {stats.nearbyCities.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Navigation className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-gray-900">Nearby Cities</h3>
                  </div>
                  <ul className="space-y-2">
                    {stats.nearbyCities.map((city: ProcessedCity, index: number) => (
                      <li key={index}>
                        <Link
                          href={`/jobs/city/${city.slug}`}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                        >
                          <span className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors">
                            {city.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {city.count} {city.count === 1 ? 'job' : 'jobs'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {stats.state && (
                    <Link
                      href={`/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`}
                      className="block mt-4 text-sm text-center text-blue-600 hover:text-blue-700 font-medium"
                    >
                      View all {stats.stateCode} cities →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

