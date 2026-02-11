import { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Wifi, TrendingUp, Globe, Video, Plane, GraduationCap, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

// Force dynamic rendering - don't try to statically generate during build
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

// Type definitions for Prisma groupBy results
interface StateGroupResult {
  state: string | null;
  stateCode: string | null;
  _count: { state: number };
}

interface CityGroupResult {
  city: string | null;
  state: string | null;
  stateCode: string | null;
  _count: { city: number };
}

// Type definitions for processed/rendered data
interface ProcessedState {
  name: string;
  code: string;
  count: number;
  slug: string;
}

interface ProcessedCity {
  name: string;
  state: string;
  stateCode: string;
  count: number;
  slug: string;
}

/**
 * Fetch job counts by state
 */
async function getLocationStats() {
  // Job counts by state
  const stateData = await prisma.job.groupBy({
    by: ['state', 'stateCode'],
    where: {
      isPublished: true,
      state: { not: null },
    },
    _count: {
      state: true,
    },
    orderBy: {
      _count: {
        state: 'desc',
      },
    },
  });

  // Remote jobs count
  const remoteCount = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: true,
    },
  });

  // Top cities
  const topCities = await prisma.job.groupBy({
    by: ['city', 'state', 'stateCode'],
    where: {
      isPublished: true,
      city: { not: null },
      state: { not: null },
    },
    _count: {
      city: true,
    },
    orderBy: {
      _count: {
        city: 'desc',
      },
    },
    take: 12,
  });

  // Total jobs
  const totalJobs = await prisma.job.count({
    where: { isPublished: true },
  });

  // Process states with explicit typing
  const processedStates = stateData
    .filter((s: StateGroupResult) => s.state !== null)
    .map((s: StateGroupResult) => ({
      name: s.state!,
      code: s.stateCode || '',
      count: s._count.state,
      slug: s.state!.toLowerCase().replace(/\s+/g, '-'),
    }));

  // Process cities with explicit typing
  const processedCities = topCities
    .filter((c: CityGroupResult) => c.city !== null && c.state !== null)
    .map((c: CityGroupResult) => ({
      name: c.city!,
      state: c.state!,
      stateCode: c.stateCode || '',
      count: c._count.city,
      slug: c.city!.toLowerCase().replace(/\s+/g, '-'),
    }));

  return {
    states: processedStates,
    remoteCount,
    topCities: processedCities,
    totalJobs,
  };
}

/**
 * Generate metadata for SEO
 */
export const metadata: Metadata = {
  title: 'PMHNP Jobs by Location - All States',
  description: 'Find psychiatric mental health nurse practitioner jobs in all 50 states. Browse PMHNP positions by location, including remote opportunities.',
  openGraph: {
    title: 'PMHNP Jobs by Location',
    description: 'Browse psychiatric mental health nurse practitioner jobs in all 50 states and remote positions.',
    type: 'website',
  },
  alternates: {
    canonical: 'https://pmhnphiring.com/jobs/locations',
  },
};

/**
 * Locations directory page
 */
export default async function LocationsPage() {
  const stats = await getLocationStats();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Locations", url: "https://pmhnphiring.com/jobs/locations" }
      ]} />
      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Globe className="h-10 w-10" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              PMHNP Jobs by Location
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: February 2026 | PMHNP jobs by location
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              Explore {stats.totalJobs.toLocaleString()} psychiatric nurse practitioner positions across the United States
            </p>

            {/* Quick Stats */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.states.length}</div>
                <div className="text-sm text-teal-100">States</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topCities.length}+</div>
                <div className="text-sm text-teal-100">Cities</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.remoteCount}</div>
                <div className="text-sm text-teal-100">Remote Jobs</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Remote Jobs Card - Prominent */}
          {stats.remoteCount > 0 && (
            <div className="mb-12">
              <Link
                href="/jobs/remote"
                className="block group"
              >
                <div className="bg-teal-600 rounded-2xl p-8 md:p-10 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Wifi className="h-8 w-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold mb-2">
                          Remote PMHNP Jobs
                        </h2>
                        <p className="text-teal-100">
                          Work from anywhere with telehealth opportunities
                        </p>
                      </div>
                    </div>
                    <div className="text-center md:text-right">
                      <div className="text-4xl font-bold mb-1">{stats.remoteCount}</div>
                      <div className="text-sm text-teal-100">Positions Available</div>
                      <div className="mt-4 px-6 py-2 bg-white text-teal-600 rounded-lg font-semibold group-hover:bg-teal-50 transition-colors inline-block">
                        View Remote Jobs →
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Browse by Job Type Section */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
              <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Browse by Job Type
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Remote Card */}
              <Link href="/jobs/remote" className="group">
                <div className="rounded-xl p-5 hover:shadow-md transition-all h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-teal-200 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <Wifi className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Remote Jobs</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Work from anywhere</p>
                  <div className="text-sm font-medium flex items-center gap-1 mt-auto" style={{ color: 'var(--color-primary)' }}>
                    View Jobs →
                  </div>
                </div>
              </Link>

              {/* Telehealth Card */}
              <Link href="/jobs/telehealth" className="group">
                <div className="rounded-xl p-5 hover:shadow-md transition-all h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <Video className="h-6 w-6 text-purple-500" />
                  </div>
                  <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Telehealth Jobs</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Virtual patient care</p>
                  <div className="text-sm text-purple-500 font-medium flex items-center gap-1 mt-auto">
                    View Jobs →
                  </div>
                </div>
              </Link>

              {/* Travel Card */}
              <Link href="/jobs/travel" className="group">
                <div className="rounded-xl p-5 hover:shadow-md transition-all h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-teal-200 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <Plane className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Travel Jobs</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Locum tenens positions</p>
                  <div className="text-sm font-medium flex items-center gap-1 mt-auto" style={{ color: 'var(--color-primary)' }}>
                    View Jobs →
                  </div>
                </div>
              </Link>

              {/* New Grad Card */}
              <Link href="/jobs/new-grad" className="group">
                <div className="rounded-xl p-5 hover:shadow-md transition-all h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-200 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <GraduationCap className="h-6 w-6 text-amber-500" />
                  </div>
                  <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>New Grad Jobs</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Entry-level friendly</p>
                  <div className="text-sm text-amber-500 font-medium flex items-center gap-1 mt-auto">
                    View Jobs →
                  </div>
                </div>
              </Link>

              {/* Per Diem Card */}
              <Link href="/jobs/per-diem" className="group">
                <div className="rounded-xl p-5 hover:shadow-md transition-all h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <Calendar className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Per Diem Jobs</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Flexible scheduling</p>
                  <div className="text-sm text-green-500 font-medium flex items-center gap-1 mt-auto">
                    View Jobs →
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* States Section */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <MapPin className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
              <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Browse by State
              </h2>
            </div>

            {stats.states.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <p style={{ color: 'var(--text-secondary)' }}>No state data available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {stats.states.map((state: ProcessedState) => (
                  <Link
                    key={state.code}
                    href={`/jobs/state/${state.slug}`}
                    className="group"
                  >
                    <div className="rounded-xl p-5 hover:shadow-md transition-all duration-200 h-full" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold group-hover:text-teal-500 transition-colors mb-1" style={{ color: 'var(--text-primary)' }}>
                            {state.name}
                          </h3>
                          <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            {state.code}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                            {state.count}
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {state.count === 1 ? 'job' : 'jobs'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
                        View Jobs
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top Cities Section */}
          {stats.topCities.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="h-6 w-6 text-green-500" />
                <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Top Cities with PMHNP Jobs
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {stats.topCities.map((city: ProcessedCity) => (
                  <Link
                    key={`${city.slug}-${city.state}`}
                    href={`/jobs/city/${city.slug}`}
                    className="group"
                  >
                    <div className="rounded-xl p-5 hover:shadow-md transition-all duration-200 h-full" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)' }}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold group-hover:text-green-500 transition-colors mb-1" style={{ color: 'var(--text-primary)' }}>
                            {city.name}
                          </h3>
                          <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            {city.state} {city.stateCode && `(${city.stateCode})`}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-500">
                            {city.count}
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {city.count === 1 ? 'job' : 'jobs'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-green-500 font-medium flex items-center gap-1">
                        View Jobs
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Looking for jobs in a specific city?
                </p>
                <Link
                  href="/jobs"
                  className="inline-block px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors shadow-sm hover:shadow-md"
                >
                  Search All Jobs
                </Link>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              About PMHNP Job Locations
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>State-by-State Opportunities</h3>
                <p className="leading-relaxed">
                  Each state offers unique opportunities for psychiatric mental health nurse practitioners.
                  Browse by state to find positions that match your location preferences, licensing, and
                  career goals. States vary in demand, salary ranges, and practice requirements.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Metropolitan Markets</h3>
                <p className="leading-relaxed">
                  Major cities typically offer higher concentrations of PMHNP positions across diverse
                  settings including hospitals, clinics, private practices, and telehealth companies.
                  Urban areas often provide competitive salaries and career advancement opportunities.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Remote Work Options</h3>
                <p className="leading-relaxed">
                  Telehealth has expanded opportunities for PMHNPs to work from anywhere. Remote positions
                  offer flexibility, work-life balance, and the ability to serve patients across state lines
                  with appropriate licensure.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Location Considerations</h3>
                <p className="leading-relaxed">
                  When choosing a location, consider factors like cost of living, state licensing requirements,
                  scope of practice regulations, professional development opportunities, and quality of life.
                  Research each state&apos;s specific PMHNP practice environment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
