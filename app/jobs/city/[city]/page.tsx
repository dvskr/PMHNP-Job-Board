import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Building2, TrendingUp, Bell, Navigation } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Job } from '@/lib/types';

// Force dynamic rendering - don't try to statically generate during build
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

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
  try {
    const { city: cityParam } = await params;
    const cityName = parseCityParam(cityParam);
    const stats = await getCityStats(cityName);

    if (stats.totalJobs === 0) {
      return {
        title: `PMHNP Jobs in ${cityName}`,
        description: `Find psychiatric mental health nurse practitioner jobs in ${cityName}. Browse PMHNP positions including telehealth, inpatient, and outpatient roles updated daily.`,
      };
    }

    const location = stats.state ? `${cityName}, ${stats.stateCode || stats.state}` : cityName;

    const title = `${stats.totalJobs} PMHNP Jobs in ${location} - Apply Now${stats.avgSalary > 0 ? ` | $${stats.avgSalary}k Avg` : ''}`;

    const description = `Browse ${stats.totalJobs} PMHNP jobs in ${location}. Psychiatric NP positions: telehealth, inpatient, outpatient.${stats.avgSalary > 0 ? ` Average salary $${stats.avgSalary}k.` : ''} New jobs added daily - apply today!`;

    return {
      title,
      description,
      openGraph: {
        title: stats.avgSalary > 0
          ? `${stats.totalJobs} PMHNP Jobs in ${location} | $${stats.avgSalary}k Average`
          : `${stats.totalJobs} PMHNP Jobs in ${location}`,
        description,
        type: 'website',
        images: [{
          url: `/api/og?type=page&title=${encodeURIComponent(`PMHNP Jobs in ${location}`)}&subtitle=${encodeURIComponent(`${stats.totalJobs} psychiatric NP positions`)}`,
          width: 1200,
          height: 630,
          alt: `PMHNP Jobs in ${location}`,
        }],
      },
      alternates: {
        canonical: `https://pmhnphiring.com/jobs/city/${cityParam}`,
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'PMHNP Jobs by City',
      description: 'Find psychiatric mental health nurse practitioner jobs by city. Browse PMHNP positions including telehealth, inpatient, and outpatient roles across the US.',
    };
  }
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

  // Note: We no longer 404 on zero jobs - we show helpful content instead
  const location = stats.state ? `${cityName}, ${stats.stateCode || stats.state}` : cityName;

  // Build breadcrumb items
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Jobs', href: '/jobs' },
  ];

  // Add state if available
  if (stats.state) {
    breadcrumbItems.push({
      label: stats.state,
      href: `/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`,
    });
  }

  // Current city (no link)
  breadcrumbItems.push({ label: cityName, href: '' });

  const citySlug = cityParam.toLowerCase();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: cityName, url: `https://pmhnphiring.com/jobs/city/${citySlug}` }
      ]} />
      {/* Breadcrumbs */}
      <div className="container mx-auto px-4 pt-4">
        <Breadcrumbs items={breadcrumbItems} />
      </div>

      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
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
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Discover {stats.totalJobs} psychiatric mental health nurse practitioner {stats.totalJobs === 1 ? 'position' : 'positions'}
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Open Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-teal-100">Employers</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Local Market Info */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl shadow-sm p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                PMHNP Job Market in {cityName}
              </h2>
              <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                {cityName} offers {stats.totalJobs === 1 ? 'a' : stats.totalJobs} active PMHNP {stats.totalJobs === 1 ? 'position' : 'positions'} across
                various healthcare settings including hospitals, outpatient clinics, telepsychiatry, and
                private practices. The local mental health care landscape provides diverse opportunities
                for psychiatric nurse practitioners at all career levels.
              </p>
              {stats.avgSalary > 0 && (
                <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
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
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  All Jobs ({stats.totalJobs})
                </h2>
                {stats.state && (
                  <Link
                    href={`/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`}
                    className="text-sm font-medium hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    View All {stats.stateCode} Jobs →
                  </Link>
                )}
              </div>

              {jobs.length === 0 ? (
                <div className="rounded-xl p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                  <div className="text-center mb-8">
                    <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                      No PMHNP Jobs in {cityName} Right Now
                    </h3>
                    <p className="max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
                      We don&apos;t have any active positions in {cityName} at the moment,
                      but new jobs are added daily. Here are some alternatives:
                    </p>
                  </div>

                  {/* Alternative Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {stats.state && (
                      <Link
                        href={`/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`}
                        className="flex flex-col p-4 rounded-lg transition-colors hover:opacity-90"
                        style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color-dark)' }}
                      >
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>📍 Jobs in {stats.state}</span>
                        <span className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse all positions statewide</span>
                      </Link>
                    )}
                    <Link
                      href="/jobs/remote"
                      className="flex flex-col p-4 rounded-lg transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color-dark)' }}
                    >
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>🏠 Remote PMHNP Jobs</span>
                      <span className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Work from anywhere with telehealth</span>
                    </Link>
                    <Link
                      href={`/job-alerts?location=${encodeURIComponent(cityName)}`}
                      className="flex flex-col p-4 rounded-lg transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color-dark)' }}
                    >
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>🔔 Set Up Job Alerts</span>
                      <span className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Get notified when {cityName} jobs are posted</span>
                    </Link>
                  </div>

                  <div className="text-center">
                    <Link
                      href="/jobs"
                      className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-colors"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      Browse All Jobs Nationwide
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {jobs.map((job: Job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Job Alert CTA */}
              <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get {cityName} Job Alerts
                </h3>
                <p className="text-sm text-teal-100 mb-4">
                  Be the first to know about new PMHNP positions in {cityName}.
                </p>
                <Link
                  href={`/job-alerts?location=${encodeURIComponent(cityName)}`}
                  className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Top Employers */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl shadow-sm p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
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

              {/* Salary Insights */}
              {stats.avgSalary > 0 && (
                <div className="rounded-xl shadow-sm p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
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
                    Based on PMHNP positions in {cityName} with salary data.
                  </p>
                  <Link href="/salary-guide" className="text-sm hover:opacity-80 mt-2 inline-block" style={{ color: 'var(--color-primary)' }}>
                    View full 2026 Salary Guide →
                  </Link>
                </div>
              )}

              {/* Nearby Cities */}
              {stats.nearbyCities.length > 0 && (
                <div className="rounded-xl shadow-sm p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Navigation className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Nearby Cities</h3>
                  </div>
                  <ul className="space-y-2">
                    {stats.nearbyCities.map((city: ProcessedCity, index: number) => (
                      <li key={index}>
                        <Link
                          href={`/jobs/city/${city.slug}`}
                          className="flex items-center justify-between p-2 rounded-lg transition-colors group"
                          style={{}}
                        >
                          <span className="text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
                            {city.name}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {city.count} {city.count === 1 ? 'job' : 'jobs'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {stats.state && (
                    <Link
                      href={`/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`}
                      className="block mt-4 text-sm text-center font-medium hover:opacity-80"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      View all {stats.stateCode} cities →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Related Resources */}
          <section className="mt-12 mb-8">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Explore More PMHNP Opportunities</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/salary-guide" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💰 2026 PMHNP Salary Guide</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>National average is $155,000+. See how your area compares.</p>
              </Link>

              <Link href="/jobs/remote" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏠 Remote PMHNP Jobs</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Work from anywhere with telehealth positions.</p>
              </Link>

              <Link href="/jobs/locations" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📍 All Locations</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse PMHNP jobs by state and city.</p>
              </Link>

              <Link href="/jobs/travel" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>✈️ Travel PMHNP Jobs</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Locum tenens positions with premium pay and housing.</p>
              </Link>

              {stats.state && (
                <Link href={`/jobs/state/${stats.state.toLowerCase().replace(/\s+/g, '-')}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color-dark)' }}>
                  <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🗺️ All {stats.state} Jobs</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>See all PMHNP positions across {stats.state}.</p>
                </Link>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
