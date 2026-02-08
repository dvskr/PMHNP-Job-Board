import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, TrendingUp, Building2, Bell, Navigation, Shield, MapPinned } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import StateFAQ from '@/components/StateFAQ';
import { Job } from '@/lib/types';
import {
  getStatePracticeAuthority,
  getAuthorityColor,
  PracticeAuthority
} from '@/lib/state-practice-authority';

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

// State name to code mappings
const STATE_CODES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

// Code to state name mappings
const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
  .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

// URL-friendly state name to proper state name
const URL_TO_STATE: Record<string, string> = Object.keys(STATE_CODES)
  .reduce((acc, state) => {
    const urlFriendly = state.toLowerCase().replace(/\s+/g, '-');
    acc[urlFriendly] = state;
    return acc;
  }, {} as Record<string, string>);

// Neighboring states for helpful suggestions when a state has 0 jobs
const NEIGHBORING_STATES: Record<string, string[]> = {
  'Alabama': ['Florida', 'Georgia', 'Tennessee', 'Mississippi'],
  'Alaska': ['Washington', 'California', 'Oregon'],
  'Arizona': ['California', 'Nevada', 'Utah', 'Colorado', 'New Mexico'],
  'Arkansas': ['Texas', 'Oklahoma', 'Missouri', 'Tennessee', 'Mississippi', 'Louisiana'],
  'California': ['Oregon', 'Nevada', 'Arizona', 'Washington'],
  'Colorado': ['Utah', 'Wyoming', 'Nebraska', 'Kansas', 'Oklahoma', 'New Mexico', 'Arizona'],
  'Connecticut': ['New York', 'Massachusetts', 'Rhode Island'],
  'Delaware': ['Pennsylvania', 'New Jersey', 'Maryland'],
  'Florida': ['Georgia', 'Alabama'],
  'Georgia': ['Florida', 'Alabama', 'Tennessee', 'North Carolina', 'South Carolina'],
  'Hawaii': ['California', 'Washington', 'Oregon'],
  'Idaho': ['Washington', 'Oregon', 'Montana', 'Wyoming', 'Utah', 'Nevada'],
  'Illinois': ['Wisconsin', 'Indiana', 'Kentucky', 'Missouri', 'Iowa'],
  'Indiana': ['Michigan', 'Ohio', 'Kentucky', 'Illinois'],
  'Iowa': ['Minnesota', 'Wisconsin', 'Illinois', 'Missouri', 'Nebraska', 'South Dakota'],
  'Kansas': ['Nebraska', 'Missouri', 'Oklahoma', 'Colorado'],
  'Kentucky': ['Indiana', 'Ohio', 'West Virginia', 'Virginia', 'Tennessee', 'Missouri', 'Illinois'],
  'Louisiana': ['Texas', 'Arkansas', 'Mississippi'],
  'Maine': ['New Hampshire', 'Massachusetts'],
  'Maryland': ['Pennsylvania', 'Delaware', 'Virginia', 'West Virginia', 'District of Columbia'],
  'Massachusetts': ['New Hampshire', 'Vermont', 'New York', 'Connecticut', 'Rhode Island'],
  'Michigan': ['Ohio', 'Indiana', 'Wisconsin'],
  'Minnesota': ['Wisconsin', 'Iowa', 'South Dakota', 'North Dakota'],
  'Mississippi': ['Louisiana', 'Arkansas', 'Tennessee', 'Alabama'],
  'Missouri': ['Iowa', 'Illinois', 'Kentucky', 'Tennessee', 'Arkansas', 'Oklahoma', 'Kansas', 'Nebraska'],
  'Montana': ['North Dakota', 'South Dakota', 'Wyoming', 'Idaho'],
  'Nebraska': ['South Dakota', 'Iowa', 'Missouri', 'Kansas', 'Colorado', 'Wyoming'],
  'Nevada': ['California', 'Oregon', 'Idaho', 'Utah', 'Arizona'],
  'New Hampshire': ['Maine', 'Vermont', 'Massachusetts'],
  'New Jersey': ['New York', 'Pennsylvania', 'Delaware'],
  'New Mexico': ['Arizona', 'Utah', 'Colorado', 'Oklahoma', 'Texas'],
  'New York': ['Vermont', 'Massachusetts', 'Connecticut', 'New Jersey', 'Pennsylvania'],
  'North Carolina': ['Virginia', 'Tennessee', 'Georgia', 'South Carolina'],
  'North Dakota': ['Montana', 'South Dakota', 'Minnesota'],
  'Ohio': ['Michigan', 'Indiana', 'Kentucky', 'West Virginia', 'Pennsylvania'],
  'Oklahoma': ['Kansas', 'Missouri', 'Arkansas', 'Texas', 'New Mexico', 'Colorado'],
  'Oregon': ['Washington', 'California', 'Nevada', 'Idaho'],
  'Pennsylvania': ['New York', 'New Jersey', 'Delaware', 'Maryland', 'West Virginia', 'Ohio'],
  'Rhode Island': ['Massachusetts', 'Connecticut'],
  'South Carolina': ['North Carolina', 'Georgia'],
  'South Dakota': ['North Dakota', 'Minnesota', 'Iowa', 'Nebraska', 'Wyoming', 'Montana'],
  'Tennessee': ['Kentucky', 'Virginia', 'North Carolina', 'Georgia', 'Alabama', 'Mississippi', 'Arkansas', 'Missouri'],
  'Texas': ['New Mexico', 'Oklahoma', 'Arkansas', 'Louisiana'],
  'Utah': ['Idaho', 'Wyoming', 'Colorado', 'New Mexico', 'Arizona', 'Nevada'],
  'Vermont': ['New Hampshire', 'Massachusetts', 'New York'],
  'Virginia': ['Maryland', 'West Virginia', 'Kentucky', 'Tennessee', 'North Carolina', 'District of Columbia'],
  'Washington': ['Oregon', 'Idaho'],
  'West Virginia': ['Pennsylvania', 'Maryland', 'Virginia', 'Kentucky', 'Ohio'],
  'Wisconsin': ['Michigan', 'Minnesota', 'Iowa', 'Illinois'],
  'Wyoming': ['Montana', 'South Dakota', 'Nebraska', 'Colorado', 'Utah', 'Idaho'],
  'District of Columbia': ['Maryland', 'Virginia'],
};

interface StatePageProps {
  params: Promise<{ state: string }>;
}

/**
 * Parse state from URL parameter
 * Handles: "california", "ca", "new-york", "ny"
 */
function parseStateParam(stateParam: string): { name: string; code: string } | null {
  const normalized = stateParam.toLowerCase().trim();

  // Try as state code (e.g., "ca")
  const upperCode = normalized.toUpperCase();
  if (CODE_TO_STATE[upperCode]) {
    return {
      name: CODE_TO_STATE[upperCode],
      code: upperCode,
    };
  }

  // Try as URL-friendly name (e.g., "california", "new-york")
  if (URL_TO_STATE[normalized]) {
    const stateName = URL_TO_STATE[normalized];
    return {
      name: stateName,
      code: STATE_CODES[stateName],
    };
  }

  // Try direct match with state name
  const directMatch = Object.keys(STATE_CODES).find(
    state => state.toLowerCase() === normalized
  );
  if (directMatch) {
    return {
      name: directMatch,
      code: STATE_CODES[directMatch],
    };
  }

  return null;
}

/**
 * Fetch jobs for a specific state
 */
async function getStateJobs(stateName: string, stateCode: string) {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
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
 * Fetch state statistics
 */
async function getStateStats(stateName: string, stateCode: string) {
  // Total jobs
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
    },
  });

  // Average salary
  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
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
  const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000); // Convert to thousands

  // Top employers
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
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
    take: 5,
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
 * Fetch nearby states with job counts for zero-jobs scenario
 */
async function getNearbyStatesWithJobs(stateName: string): Promise<{ name: string; code: string; count: number; slug: string }[]> {
  const neighbors = NEIGHBORING_STATES[stateName] || [];

  if (neighbors.length === 0) return [];

  const results = await Promise.all(
    neighbors.slice(0, 6).map(async (neighborState) => {
      const code = STATE_CODES[neighborState];
      const count = await prisma.job.count({
        where: {
          isPublished: true,
          OR: [
            { state: neighborState },
            { stateCode: code },
          ],
        },
      });
      return {
        name: neighborState,
        code,
        count,
        slug: neighborState.toLowerCase().replace(/\s+/g, '-'),
      };
    })
  );

  // Return only states with jobs, sorted by count
  return results
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Fetch cities with job counts within a state
 */
async function getCitiesWithJobs(stateName: string, stateCode: string): Promise<{ name: string; count: number; slug: string }[]> {
  const cityData = await prisma.job.groupBy({
    by: ['city'],
    where: {
      isPublished: true,
      city: { not: null },
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
    },
    _count: {
      city: true,
    },
    orderBy: {
      _count: {
        city: 'desc',
      },
    },
    take: 8,
  });

  return cityData
    .filter(c => c.city && c.city.trim().length > 0)
    .map(c => ({
      name: c.city as string,
      count: c._count.city,
      slug: (c.city as string).toLowerCase().replace(/\s+/g, '-'),
    }));
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  try {
    const { state: stateParam } = await params;
    const stateInfo = parseStateParam(stateParam);

    if (!stateInfo) {
      return {
        title: 'State Not Found',
      };
    }

    const { name: stateName, code: stateCode } = stateInfo;
    const stats = await getStateStats(stateName, stateCode);

    const title = `${stats.totalJobs} PMHNP Jobs in ${stateName} (${stateCode}) - Apply Now | $${stats.avgSalary}k Avg`;

    const description = `Browse ${stats.totalJobs} PMHNP jobs in ${stateName}. Psychiatric NP positions: telehealth, inpatient, outpatient. Average salary $${stats.avgSalary}k. New jobs added daily - apply today!`;

    return {
      title,
      description,
      openGraph: {
        title: stats.avgSalary > 0
          ? `${stats.totalJobs} PMHNP Jobs in ${stateName} | $${stats.avgSalary}k Average`
          : `${stats.totalJobs} PMHNP Jobs in ${stateName}`,
        description,
        type: 'website',
      },
      alternates: {
        canonical: `https://pmhnphiring.com/jobs/state/${stateParam}`,
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'PMHNP Jobs by State',
      description: 'Find psychiatric mental health nurse practitioner jobs by state.',
    };
  }
}

/**
 * State-specific job listings page
 */
export default async function StateJobsPage({ params }: StatePageProps) {
  const { state: stateParam } = await params;
  const stateInfo = parseStateParam(stateParam);

  if (!stateInfo) {
    notFound();
  }

  const { name: stateName, code: stateCode } = stateInfo;

  // Fetch all data in parallel for content enrichment
  const [jobs, stats, citiesWithJobs, nearbyStates] = await Promise.all([
    getStateJobs(stateName, stateCode),
    getStateStats(stateName, stateCode),
    getCitiesWithJobs(stateName, stateCode),
    getNearbyStatesWithJobs(stateName), // Always fetch for "Explore nearby states" section
  ]);

  // Get practice authority information for this state
  const practiceAuthority = getStatePracticeAuthority(stateName);
  const authorityColors = practiceAuthority ? getAuthorityColor(practiceAuthority.authority) : null;

  // Build breadcrumb items
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Jobs', href: '/jobs' },
    { label: stateName, href: '' },
  ];

  const stateSlug = stateName.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: stateName, url: `https://pmhnphiring.com/jobs/state/${stateSlug}` }
      ]} />
      {/* Breadcrumbs */}
      <div className="container mx-auto px-4 pt-4">
        <Breadcrumbs items={breadcrumbItems} />
      </div>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <MapPin className="h-8 w-8" />
              <span className="text-lg font-medium">{stateCode}</span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              PMHNP Jobs in {stateName}
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-6">
              Discover {stats.totalJobs} psychiatric mental health nurse practitioner positions
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
                <div className="text-sm text-blue-100">Top Employers</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Intro */}
          <div className="mb-8 md:mb-12">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                About PMHNP Jobs in {stateName}
              </h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                {stateName} offers diverse opportunities for psychiatric mental health nurse practitioners
                across various healthcare settings. Whether you&apos;re interested in telepsychiatry, outpatient
                clinics, hospitals, or private practice, you&apos;ll find positions that match your career goals.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Browse {stats.totalJobs} current PMHNP openings in {stateName} below, featuring both
                remote and in-person positions with competitive compensation packages.
              </p>
            </div>
          </div>

          {/* Practice Authority Section */}
          {practiceAuthority && (
            <div className="mb-8 md:mb-12">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="h-6 w-6 text-blue-600" />
                  <h2 className="text-2xl font-bold text-gray-900">
                    PMHNP Practice Authority in {stateName}
                  </h2>
                </div>

                {authorityColors && (
                  <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium mb-4 ${authorityColors.bg} ${authorityColors.text} ${authorityColors.border} border`}>
                    {practiceAuthority.description}
                  </div>
                )}

                <p className="text-gray-700 leading-relaxed mb-4">
                  {practiceAuthority.details}
                </p>

                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What This Means for Your Practice:</h4>
                  {practiceAuthority.authority === 'full' && (
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Practice independently without physician oversight</li>
                      <li>• Prescribe medications including controlled substances</li>
                      <li>• Greater autonomy in patient care decisions</li>
                      <li>• Often higher earning potential and flexibility</li>
                    </ul>
                  )}
                  {practiceAuthority.authority === 'reduced' && (
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Requires a collaborative agreement with a physician</li>
                      <li>• Physician does not need to be on-site</li>
                      <li>• Can still practice with significant autonomy</li>
                      <li>• Agreement may be required for prescriptive authority</li>
                    </ul>
                  )}
                  {practiceAuthority.authority === 'restricted' && (
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Requires physician supervision for practice</li>
                      <li>• May need protocol or supervisory agreement</li>
                      <li>• Supervision requirements vary by employer</li>
                      <li>• Consider telehealth companies for more flexibility</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cities in State */}
          {citiesWithJobs.length > 0 && (
            <div className="mb-8 md:mb-12">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <MapPinned className="h-6 w-6 text-blue-600" />
                  <h2 className="text-2xl font-bold text-gray-900">
                    PMHNP Jobs by City in {stateName}
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {citiesWithJobs.map((city) => (
                    <Link
                      key={city.slug}
                      href={`/jobs/city/${city.slug}`}
                      className="flex items-center justify-between p-3 bg-gray-50 hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900 truncate">{city.name}</span>
                      <span className="text-xs text-blue-600 font-semibold ml-2">
                        {city.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  All Jobs ({stats.totalJobs})
                </h2>
                <Link
                  href="/jobs"
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View All States →
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8">
                  <div className="text-center mb-8">
                    <MapPin className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      No PMHNP Jobs in {stateName} Right Now
                    </h3>
                    <p className="text-gray-600 max-w-md mx-auto">
                      We don&apos;t have any active positions in {stateName} at the moment,
                      but new jobs are added daily. Here are some alternatives:
                    </p>
                  </div>

                  {/* Nearby States with Jobs */}
                  {nearbyStates.length > 0 && (
                    <div className="mb-8">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Navigation className="h-5 w-5 text-blue-600" />
                        Nearby States with Openings
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {nearbyStates.map((state) => (
                          <Link
                            key={state.code}
                            href={`/jobs/state/${state.slug}`}
                            className="flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                          >
                            <span className="font-medium text-gray-900">{state.name}</span>
                            <span className="text-sm text-blue-600 font-semibold">
                              {state.count} {state.count === 1 ? 'job' : 'jobs'}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternative Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                      href="/jobs/remote"
                      className="flex flex-col p-4 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
                    >
                      <span className="font-semibold text-purple-900">🏠 Remote PMHNP Jobs</span>
                      <span className="text-sm text-purple-700 mt-1">Work from anywhere with telehealth positions</span>
                    </Link>
                    <Link
                      href={`/job-alerts?location=${encodeURIComponent(stateName)}`}
                      className="flex flex-col p-4 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors"
                    >
                      <span className="font-semibold text-green-900">🔔 Set Up Job Alerts</span>
                      <span className="text-sm text-green-700 mt-1">Get notified when {stateName} jobs are posted</span>
                    </Link>
                  </div>

                  <div className="mt-8 text-center">
                    <Link
                      href="/jobs"
                      className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get {stateName} Job Alerts
                </h3>
                <p className="text-sm text-blue-100 mb-4">
                  Be the first to know about new PMHNP positions in {stateName}.
                </p>
                <Link
                  href={`/job-alerts?location=${encodeURIComponent(stateName)}`}
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

              {/* Salary Guide */}
              {stats.avgSalary > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                    Based on {stats.totalJobs} PMHNP positions in {stateName} with salary data.
                  </p>
                  <Link href="/salary-guide" className="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block">
                    View full 2026 Salary Guide →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Related Resources */}
          <section className="mt-12 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Explore More PMHNP Opportunities</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/salary-guide" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-blue-600">💰 2026 PMHNP Salary Guide</h3>
                <p className="text-sm text-gray-600 mt-1">See how {stateName} compares to other states. Includes cost-of-living adjustments and negotiation tips.</p>
              </Link>

              <Link href="/jobs/remote" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-blue-600">🏠 Remote PMHNP Jobs</h3>
                <p className="text-sm text-gray-600 mt-1">Work from anywhere with telehealth and remote psychiatric NP positions.</p>
              </Link>

              <Link href="/jobs/travel" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-blue-600">✈️ Travel PMHNP Jobs</h3>
                <p className="text-sm text-gray-600 mt-1">Locum tenens and travel positions with premium pay and housing stipends.</p>
              </Link>

              <Link href="/jobs/new-grad" className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-blue-600">🎓 New Grad PMHNP Jobs</h3>
                <p className="text-sm text-gray-600 mt-1">Entry-level positions for newly certified psychiatric nurse practitioners.</p>
              </Link>
            </div>
          </section>

          {/* Nearby States - Also show for states WITH jobs */}
          {nearbyStates.length > 0 && stats.totalJobs > 0 && (
            <section className="mt-8 mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <Navigation className="h-6 w-6 text-blue-600" />
                  <h2 className="text-xl font-bold text-gray-900">
                    Explore Nearby States
                  </h2>
                </div>
                <p className="text-gray-600 mb-4">
                  Looking for more options? Check out PMHNP opportunities in states near {stateName}.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {nearbyStates.slice(0, 6).map((state) => (
                    <Link
                      key={state.code}
                      href={`/jobs/state/${state.slug}`}
                      className="flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900">{state.name}</span>
                      <span className="text-xs text-blue-600 font-semibold">
                        {state.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* FAQ Section */}
          <StateFAQ
            stateName={stateName}
            stateCode={stateCode}
            totalJobs={stats.totalJobs}
            avgSalary={stats.avgSalary}
            practiceAuthority={practiceAuthority?.authority}
          />
        </div>
      </div>
    </div>
  );
}

