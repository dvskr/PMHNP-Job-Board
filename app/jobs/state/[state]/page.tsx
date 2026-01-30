import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, TrendingUp, Building2, Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
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
        canonical: `/jobs/state/${stateParam}`,
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
  const [jobs, stats] = await Promise.all([
    getStateJobs(stateName, stateCode),
    getStateStats(stateName, stateCode),
  ]);

  // Build breadcrumb items
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Jobs', href: '/jobs' },
    { label: stateName, href: '' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
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
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No jobs found in {stateName}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    We don&apos;t have any active PMHNP positions in this state right now.
                  </p>
                  <Link
                    href="/jobs"
                    className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

