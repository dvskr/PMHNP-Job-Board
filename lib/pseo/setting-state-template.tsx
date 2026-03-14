/**
 * Setting × State pSEO Template Factory
 * 
 * Shared server component used by all /jobs/[setting]/[state] pages.
 * Each setting page just provides the setting key and state slug;
 * this factory handles data fetching, rendering, and SEO metadata.
 */
import Link from 'next/link';
import { Metadata } from 'next';
import { TrendingUp, Building2, Bell, MapPin, Lightbulb } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';
import { Job } from '@/lib/types';
import {
  SettingConfig,
  SETTING_CONFIGS,
  resolveStateSlug,
  stateToSlug,
  NEIGHBORING_STATES,
  getAllStateSlugs,
} from './setting-state-config';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EmployerGroupResult {
  employer: string;
  _count: { employer: number };
}

interface ProcessedEmployer {
  name: string;
  count: number;
}

interface Stats {
  totalJobs: number;
  avgSalary: number;
  topEmployers: ProcessedEmployer[];
}

// ─── Data Fetching ─────────────────────────────────────────────────────────────

async function getJobs(config: SettingConfig, stateName: string, skip = 0, take = 20) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = config.buildWhere(stateName) as any;
  return prisma.job.findMany({
    where,
    orderBy: [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    skip,
    take,
  });
}

async function getStats(config: SettingConfig, stateName: string): Promise<Stats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = config.buildWhere(stateName) as any;

  const totalJobs = await prisma.job.count({ where });

  const salaryData = await prisma.job.aggregate({
    where: {
      ...where,
      normalizedMinSalary: { not: null },
      normalizedMaxSalary: { not: null },
    },
    _avg: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
    },
  });

  const avgSalary = Math.round(
    ((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000
  );

  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where,
    _count: { employer: true },
    orderBy: { _count: { employer: 'desc' } },
    take: 8,
  });

  return {
    totalJobs,
    avgSalary,
    topEmployers: topEmployers.map((e: EmployerGroupResult) => ({
      name: e.employer,
      count: e._count.employer,
    })),
  };
}

// ─── Metadata Generator ────────────────────────────────────────────────────────

export async function buildSettingStateMetadata(
  settingKey: string,
  stateSlug: string,
  page: number,
): Promise<Metadata> {
  const config = SETTING_CONFIGS[settingKey];
  const stateName = resolveStateSlug(stateSlug);
  if (!config || !stateName) return { title: 'Not Found' };

  const stats = await getStats(config, stateName);
  const basePath = `/jobs/${config.slug}/${stateSlug}`;

  return {
    title: `${stats.totalJobs} ${config.label} PMHNP Jobs in ${stateName} (${config.salaryRange})`,
    description: `Find ${stats.totalJobs} ${config.label.toLowerCase()} PMHNP jobs in ${stateName} paying ${config.salaryRange}. ${config.heroSubtitle}. Browse ${config.label.toLowerCase()} psychiatric nurse practitioner positions in ${stateName} updated daily.`,
    keywords: [
      ...config.keywords,
      `${config.label.toLowerCase()} pmhnp jobs ${stateName.toLowerCase()}`,
      `${stateName.toLowerCase()} ${config.label.toLowerCase()} psychiatric nurse practitioner`,
    ],
    openGraph: {
      title: `${stats.totalJobs} ${config.label} PMHNP Jobs in ${stateName}`,
      description: `Browse ${config.label.toLowerCase()} psychiatric nurse practitioner positions in ${stateName}. ${config.heroSubtitle}.`,
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} ${config.label} PMHNP Jobs in ${stateName}`)}&subtitle=${encodeURIComponent(config.heroSubtitle)}`,
        width: 1200,
        height: 630,
        alt: `${config.label} PMHNP Jobs in ${stateName}`,
      }],
    },
    alternates: {
      canonical: `https://pmhnphiring.com${basePath}`,
    },
    ...(page > 1 && {
      robots: { index: false, follow: true },
    }),
    ...(stats.totalJobs === 0 && {
      robots: { index: false, follow: true },
    }),
  };
}

// ─── Static Params Generator ───────────────────────────────────────────────────

export function buildSettingStateStaticParams() {
  return getAllStateSlugs().map((slug) => ({ state: slug }));
}

// ─── Page Component ────────────────────────────────────────────────────────────

interface SettingStatePageProps {
  settingKey: string;
  stateSlug: string;
  page: number;
}

export default async function SettingStatePage({ settingKey, stateSlug, page }: SettingStatePageProps) {
  const config = SETTING_CONFIGS[settingKey];
  const stateName = resolveStateSlug(stateSlug);

  if (!config || !stateName) {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getJobs(config, stateName!, skip, limit),
    getStats(config, stateName!),
  ]);

  const totalPages = Math.ceil(stats.totalJobs / limit);
  const neighbors = NEIGHBORING_STATES[stateName!] || [];
  const basePath = `/jobs/${config.slug}/${stateSlug}`;

  // Other settings for cross-linking
  const otherSettings = Object.values(SETTING_CONFIGS).filter((s) => s.slug !== config.slug);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Jobs', url: 'https://pmhnphiring.com/jobs' },
        { name: config.label, url: `https://pmhnphiring.com/jobs/${config.slug}` },
        { name: stateName!, url: `https://pmhnphiring.com${basePath}` },
      ]} />

      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              {config.label} PMHNP Jobs in {stateName}
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | {config.heroSubtitle} in {stateName}
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              {stats.totalJobs > 0
                ? `Discover ${stats.totalJobs} ${config.label.toLowerCase()} psychiatric nurse practitioner positions in ${stateName}`
                : `${config.label} PMHNP positions in ${stateName} — check back soon for new openings`}
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">{config.label} Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.topEmployers.length}</div>
                <div className="text-sm text-teal-100">Hiring Organizations</div>
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
                Why Choose {config.label} PMHNP Work in {stateName}?
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {config.benefits.map((benefit, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <MapPin className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{benefit.title}</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  All {config.label} Positions in {stateName} ({stats.totalJobs})
                </h2>
                <Link href={`/jobs/state/${stateSlug}`} className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>
                  All {stateName} Jobs →
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    No {config.label.toLowerCase()} PMHNP jobs in {stateName} right now
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Check back soon or browse {config.label.toLowerCase()} jobs in nearby states:
                  </p>
                  {neighbors.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                      {neighbors.slice(0, 4).map((neighbor) => (
                        <Link
                          key={neighbor}
                          href={`/jobs/${config.slug}/${stateToSlug(neighbor)}`}
                          className="px-3 py-1.5 text-sm rounded-lg transition-colors hover:opacity-90"
                          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-primary)' }}
                        >
                          {neighbor}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href={`/jobs/${config.slug}`} className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--color-primary)' }}>
                      All {config.label} Jobs
                    </Link>
                    <Link href={`/jobs/state/${stateSlug}`} className="inline-block px-6 py-3 rounded-lg font-medium transition-colors" style={{ color: 'var(--color-primary)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                      All {stateName} Jobs
                    </Link>
                  </div>
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
                        <Link href={`${basePath}?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
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
                        <Link href={`${basePath}?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
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
                  Get {config.label} Job Alerts
                </h3>
                <p className="text-sm text-teal-100 mb-4">
                  Be the first to know about new {config.label.toLowerCase()} PMHNP positions in {stateName}.
                </p>
                <Link href="/job-alerts" className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors">
                  Create Alert
                </Link>
              </div>

              {/* Top Employers */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Employers in {stateName}</h3>
                  </div>
                  <ul className="space-y-3">
                    {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                      <li key={index} className="flex items-center justify-between">
                        <span className="text-sm truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{employer.name}</span>
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
                    <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>${stats.avgSalary}k</div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg. {config.label.toLowerCase()} salary in {stateName}</div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Based on {config.label.toLowerCase()} PMHNP positions with salary data in {stateName}.
                  </p>
                  <Link href={`/salary-guide/${stateSlug}`} className="block mt-3 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                    View {stateName} Salary Guide →
                  </Link>
                </div>
              )}

              {/* Tips */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{config.label} Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {config.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2">
                      <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Cross-Links: This setting in neighboring states */}
          {neighbors.length > 0 && (
            <div className="mt-12 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                {config.label} PMHNP Jobs in Nearby States
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {neighbors.map((neighbor) => (
                  <Link
                    key={neighbor}
                    href={`/jobs/${config.slug}/${stateToSlug(neighbor)}`}
                    className="block p-3 rounded-lg text-center hover:shadow-md transition-all"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    <div className="font-semibold text-sm">{neighbor}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {config.label} Jobs
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Cross-Links: Other settings in this state */}
          <div className="mt-8 rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Other PMHNP Job Types in {stateName}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {otherSettings.map((setting) => (
                <Link
                  key={setting.slug}
                  href={`/jobs/${setting.slug}/${stateSlug}`}
                  className="block p-3 rounded-lg text-center hover:shadow-md transition-all"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  <div className="font-semibold text-sm">{setting.label}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Jobs in {stateName}
                  </div>
                </Link>
              ))}
              <Link
                href={`/jobs/state/${stateSlug}`}
                className="block p-3 rounded-lg text-center hover:shadow-md transition-all"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                <div className="font-semibold text-sm">All Jobs</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  in {stateName}
                </div>
              </Link>
            </div>
          </div>

          {/* Resource Links */}
          <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--border-color)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Explore More PMHNP Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href={`/salary-guide/${stateSlug}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💰 {stateName} Salary Guide</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>PMHNP salary data for {stateName} by setting and experience.</p>
              </Link>
              <Link href={`/jobs/state/${stateSlug}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📍 All {stateName} Jobs</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse all PMHNP positions in {stateName}.</p>
              </Link>
              <Link href={`/jobs/${config.slug}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏥 All {config.label} Jobs</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse all {config.label.toLowerCase()} PMHNP positions nationwide.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <CategoryFAQ category={config.faqCategory as 'remote' | 'telehealth' | 'travel' | 'new-grad' | 'per-diem' | 'inpatient' | 'outpatient' | 'substance-abuse' | 'child-adolescent' | 'addiction'} totalJobs={stats.totalJobs} />
    </div>
  );
}
