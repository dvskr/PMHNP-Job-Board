/**
 * READ-ONLY audit: JobPosting schema field coverage + salary-report viability
 * over the LIVE job set.
 *
 * Universe = isPublished: true — this matches app/jobs/[slug]/page.tsx getJob(),
 * which is the ONLY gate on whether a JD page (and its JSON-LD via
 * components/JobStructuredData.tsx) renders. archivedAt and GLOBAL_EXCLUSIONS
 * do NOT gate the detail page; we report the buildWhereClause(DEFAULT_FILTERS)
 * "list-visible" count separately for context.
 *
 * Mirrors JobStructuredData.tsx exactly:
 *   - hasPhysicalLocation = city || state || stateCode
 *   - jobLocation omitted when isRemote && !isHybrid (valid) OR when
 *     !hasPhysicalLocation (INVALID unless remote)
 *   - datePosted = originalPostedAt || createdAt
 *   - validThrough = expiresAt || datePosted + 60d
 *   - logo/sameAs come from the EmployerJob relation (companyLogoUrl /
 *     companyWebsite), null for aggregated jobs with no EmployerJob row.
 *
 * Read-only: no writes. Run: npx tsx scripts/audit/audit-jobposting-coverage.ts
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
  const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (flag === 'dev' || flag === 'prod') return flag;
  if (process.argv.includes('--dev')) return 'dev';
  return 'prod';
}
const ENV: EnvKind = parseEnvFlag();
if (ENV === 'prod') {
  dotenvConfig({ path: '.env.prod' });
  if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
  }
  if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
  }
} else {
  dotenvConfig({ path: '.env' });
}
// prisma/filters are imported dynamically inside main() AFTER dotenv has run —
// a static import is hoisted above the dotenv call and trips
// lib/prisma's "DATABASE_URL must be set" guard at load time.

const THIN_DESCRIPTION_CHARS = 200;
const VALID_THROUGH_FALLBACK_DAYS = 60;
const TOP_STATES = 15;
const MIN_SALARY_JOBS_PER_STATE = 5;

const pct = (n: number, total: number): number =>
  total === 0 ? 0 : Math.round((n / total) * 10000) / 100;

/** Linear-interpolation percentile over a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

interface StateSalaryRow {
  state: string;
  count: number;
  estimatedCount: number;
  medianMin: number | null;
  medianMax: number | null;
  p25Min: number | null;
  p75Max: number | null;
}

async function main() {
  const { prisma } = await import('@/lib/prisma');
  const { buildWhereClause } = await import('@/lib/filters');
  const { DEFAULT_FILTERS } = await import('@/types/filters');
  console.log(
    `[audit-jobposting-coverage] env=${ENV} DB=${(process.env.DATABASE_URL || '')
      .replace(/:[^:@/]+@/, ':***@')
      .slice(0, 60)}...`,
  );

  const [totalPublished, listVisible] = await Promise.all([
    prisma.job.count({ where: { isPublished: true } }),
    prisma.job.count({ where: buildWhereClause(DEFAULT_FILTERS) }),
  ]);

  const jobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      minSalary: true,
      maxSalary: true,
      salaryPeriod: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryIsEstimated: true,
      city: true,
      state: true,
      stateCode: true,
      isRemote: true,
      isHybrid: true,
      originalPostedAt: true,
      createdAt: true,
      expiresAt: true,
      applyOnPlatform: true,
      minYearsExperience: true,
      newGradFriendly: true,
      archivedAt: true,
      description: true,
      employerJobs: { select: { companyLogoUrl: true, companyWebsite: true } },
    },
  });

  const total = jobs.length;
  const now = Date.now();

  let anySalary = 0;
  let estimated = 0;
  let normalizedBoth = 0;
  let cityAndStateCode = 0;
  let remote = 0;
  let hybrid = 0;
  let noLocationNotRemote = 0;
  let noPhysicalLocation = 0;
  let originalPostedAtNull = 0;
  let expiresAtNull = 0;
  let validThroughInPast = 0;
  let logoPresent = 0;
  let websitePresent = 0;
  let directApply = 0;
  let experienceSignal = 0;
  let thinDescription = 0;
  let archivedButPublished = 0;
  const periodCounts: Record<string, number> = {};

  // Salary-report accumulators: per-stateCode arrays of non-estimated
  // normalized salaries; estimated rows counted separately.
  const stateMins: Record<string, number[]> = {};
  const stateMaxs: Record<string, number[]> = {};
  const stateEstimated: Record<string, number> = {};
  const nationalMins: number[] = [];
  const nationalMaxs: number[] = [];

  for (const j of jobs) {
    const hasAnySalary =
      j.minSalary != null ||
      j.maxSalary != null ||
      j.normalizedMinSalary != null ||
      j.normalizedMaxSalary != null;
    if (hasAnySalary) anySalary += 1;
    if (j.salaryIsEstimated) estimated += 1;
    const periodKey = hasAnySalary ? (j.salaryPeriod ?? '(null)') : '(no salary)';
    periodCounts[periodKey] = (periodCounts[periodKey] ?? 0) + 1;

    const usableNormalized = j.normalizedMinSalary != null && j.normalizedMaxSalary != null;
    if (usableNormalized) normalizedBoth += 1;

    if (j.city && j.stateCode) cityAndStateCode += 1;
    if (j.isRemote) remote += 1;
    if (j.isHybrid) hybrid += 1;
    // Mirror of JobStructuredData.tsx:95 — schema emits NO jobLocation when
    // all three are null; without isRemote there is no TELECOMMUTE fallback
    // either, which is invalid per Google Jobs requirements.
    const hasPhysicalLocation = !!(j.city || j.state || j.stateCode);
    if (!hasPhysicalLocation) noPhysicalLocation += 1;
    if (!hasPhysicalLocation && !j.isRemote) noLocationNotRemote += 1;

    if (j.originalPostedAt == null) originalPostedAtNull += 1;
    if (j.expiresAt == null) expiresAtNull += 1;
    // Mirror of JobStructuredData.tsx:57-71.
    const datePosted = (j.originalPostedAt ?? j.createdAt).getTime();
    const validThrough =
      j.expiresAt != null
        ? j.expiresAt.getTime()
        : datePosted + VALID_THROUGH_FALLBACK_DAYS * 24 * 60 * 60 * 1000;
    if (validThrough < now) validThroughInPast += 1;

    if (j.employerJobs?.companyLogoUrl) logoPresent += 1;
    if (j.employerJobs?.companyWebsite) websitePresent += 1;
    if (j.applyOnPlatform) directApply += 1;
    if (j.minYearsExperience != null || j.newGradFriendly) experienceSignal += 1;
    if ((j.description ?? '').trim().length < THIN_DESCRIPTION_CHARS) thinDescription += 1;
    if (j.archivedAt != null) archivedButPublished += 1;

    if (usableNormalized) {
      const state = j.stateCode ?? (j.isRemote ? 'REMOTE' : '(none)');
      if (j.salaryIsEstimated) {
        stateEstimated[state] = (stateEstimated[state] ?? 0) + 1;
      } else {
        (stateMins[state] ??= []).push(j.normalizedMinSalary as number);
        (stateMaxs[state] ??= []).push(j.normalizedMaxSalary as number);
        nationalMins.push(j.normalizedMinSalary as number);
        nationalMaxs.push(j.normalizedMaxSalary as number);
      }
    }
  }

  nationalMins.sort((a, b) => a - b);
  nationalMaxs.sort((a, b) => a - b);

  const allStates = new Set([...Object.keys(stateMins), ...Object.keys(stateEstimated)]);
  const stateRows: StateSalaryRow[] = [...allStates].map((state) => {
    const mins = [...(stateMins[state] ?? [])].sort((a, b) => a - b);
    const maxs = [...(stateMaxs[state] ?? [])].sort((a, b) => a - b);
    return {
      state,
      count: mins.length,
      estimatedCount: stateEstimated[state] ?? 0,
      medianMin: percentile(mins, 0.5),
      medianMax: percentile(maxs, 0.5),
      p25Min: percentile(mins, 0.25),
      p75Max: percentile(maxs, 0.75),
    };
  });
  stateRows.sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
  const topStateRows = stateRows.slice(0, TOP_STATES);
  const statesWithFivePlus = stateRows.filter(
    (r) => r.state.length === 2 && r.state !== '(none)' && r.count >= MIN_SALARY_JOBS_PER_STATE,
  ).length;

  const stats = {
    totalLiveJobs: total,
    totalPublishedCount: totalPublished,
    listVisibleAfterExclusions: listVisible,
    archivedButStillPublished: archivedButPublished,
    anySalaryCount: anySalary,
    anySalaryPct: pct(anySalary, total),
    salaryEstimatedCount: estimated,
    salaryEstimatedPct: pct(estimated, total),
    normalizedBothCount: normalizedBoth,
    normalizedBothPct: pct(normalizedBoth, total),
    cityAndStateCodeCount: cityAndStateCode,
    cityAndStateCodePct: pct(cityAndStateCode, total),
    remoteCount: remote,
    remotePct: pct(remote, total),
    hybridCount: hybrid,
    hybridPct: pct(hybrid, total),
    noPhysicalLocationCount: noPhysicalLocation,
    noLocationAndNotRemoteCount: noLocationNotRemote,
    noLocationAndNotRemotePct: pct(noLocationNotRemote, total),
    originalPostedAtNullCount: originalPostedAtNull,
    originalPostedAtNullPct: pct(originalPostedAtNull, total),
    expiresAtNullCount: expiresAtNull,
    expiresAtNullPct: pct(expiresAtNull, total),
    validThroughInPastCount: validThroughInPast,
    validThroughInPastPct: pct(validThroughInPast, total),
    companyLogoPresentCount: logoPresent,
    companyLogoPresentPct: pct(logoPresent, total),
    companyWebsitePresentCount: websitePresent,
    companyWebsitePresentPct: pct(websitePresent, total),
    directApplyCount: directApply,
    directApplyPct: pct(directApply, total),
    experienceSignalCount: experienceSignal,
    experienceSignalPct: pct(experienceSignal, total),
    thinDescriptionUnder200Count: thinDescription,
    thinDescriptionUnder200Pct: pct(thinDescription, total),
    salaryPeriodBreakdown: periodCounts,
    nationalMedianNormalizedMin: percentile(nationalMins, 0.5),
    nationalMedianNormalizedMax: percentile(nationalMaxs, 0.5),
    nationalSalarySampleSize: nationalMins.length,
    statesWithAtLeast5SalaryJobs: statesWithFivePlus,
  };

  console.log('\n══════════ JOBPOSTING COVERAGE (isPublished=true) ══════════');
  console.log(JSON.stringify(stats, null, 2));
  console.log('\n══════════ TOP STATES BY USABLE (non-estimated) SALARY ══════════');
  console.log(JSON.stringify(topStateRows, null, 2));
  console.log('\n══════════ MACHINE-READABLE ══════════');
  console.log(`RESULT_JSON:${JSON.stringify({ stats, stateSalaryCounts: topStateRows })}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[audit-jobposting-coverage] fatal', e);
  process.exit(1);
});
