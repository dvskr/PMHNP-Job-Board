/**
 * Audit population-focus filters: va, veterans, lgbtq, geriatric, crisis.
 *
 * For each filter:
 *   - Count total matches (same WHERE clause the live page renders)
 *   - Pull a 15-row sample (best-scored first)
 *   - Classify TP / FP using filter-specific heuristics
 *   - Print a summary table line
 *
 * Also computes the va-vs-veterans result-set overlap to verify whether
 * /jobs/va and /jobs/veterans are practically aliased.
 *
 * Read-only, production DB. Run:
 *   npx tsx scripts/audit/audit-population-filters.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

// Use require() to defer module load until AFTER dotenv runs — @/lib/prisma
// throws at import-time if DATABASE_URL is missing, and ESM import hoisting
// would run that check before the dotenv block above.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCategoryWhereClause } = require('@/lib/filters') as typeof import('@/lib/filters');

type JobSlice = {
  id: string;
  title: string;
  employer: string;
  description: string | null;
  city: string | null;
  state: string | null;
  isRemote: boolean;
};

// ── Per-filter FP classifiers ────────────────────────────────────────────────
// Returns null = true positive; string = reason it's a likely false positive.
type Classifier = (j: JobSlice) => string | null;

const classifiers: Record<string, Classifier> = {
  va: (j) => {
    const title = j.title || '';
    const emp = j.employer || '';
    const blob = `${title} ${emp}`;
    // FP signal: "VA" is the state abbreviation Virginia, not Veterans Affairs.
    // The filter has `employer contains "VA "` and `employer startsWith "VA "`.
    // Risk: employer like "VA Health" or "Greater VA Mental Health" (Virginia).
    if (/\bVeterans?\b/i.test(blob)) return null;
    if (/\bVHA\b/i.test(blob)) return null;
    if (/\bVAMC\b/i.test(blob)) return null;
    if (/Department of Veterans/i.test(blob)) return null;
    if (/^VA\s/i.test(emp)) return null; // legitimate "VA Medical Center"
    // employer "VA " token without "Veterans"/"VHA" context → suspicious
    if (/\bVA\b/.test(emp) && !/Veterans/i.test(emp)) {
      // Virginia indicators
      if (/Virginia/i.test(blob)) return 'employer "VA" likely = Virginia';
      // unclear context with no veterans signal
      return 'employer "VA" no veterans context';
    }
    return null;
  },

  veterans: (j) => {
    const title = j.title || '';
    const desc = j.description || '';
    // Filter is title-based: 'veteran', 'VA ', 'military', 'VHA'.
    // FPs: "veteran clinician" (= experienced clinician, NOT a job serving veterans),
    // "veteran nurse practitioner" (synonym for "experienced"),
    // "VA " as Virginia state abbreviation in a title like "Richmond, VA".
    if (/\bveteran\s+(clinician|nurse|provider|practitioner|psychiatric|professional|teacher|leader)/i.test(title)) {
      return 'title uses "veteran" = experienced, not population';
    }
    if (/\b(experienced|seasoned)\s+veteran\b/i.test(title)) {
      return 'title "experienced veteran" = years-of-experience phrase';
    }
    // Title containing only ", VA" or "(VA)" → Virginia location
    if (/,\s*VA\b/.test(title) || /\(VA\)/.test(title)) {
      // unless it also references veterans/VHA/military
      if (!/veteran|military|VHA|combat|PTSD/i.test(`${title} ${desc}`)) {
        return 'title "VA" = Virginia state, not Veterans Affairs';
      }
    }
    return null;
  },

  lgbtq: (j) => {
    const title = j.title || '';
    const emp = j.employer || '';
    const blob = `${title} ${emp}`;
    // Filter matches: LGBTQ, transgender, gender-affirming, gender affirming,
    // gender identity, affirming care.
    // FP risk: "affirming care" is generic positive-care language that some
    // employers use without LGBTQ+ population focus. "Gender identity" can
    // appear in generic non-discrimination boilerplate scraped into titles
    // (rare in title field, but possible).
    if (/affirming\s+care/i.test(title) &&
        !/LGBTQ|trans|queer|gender|pride/i.test(blob)) {
      return '"affirming care" without LGBTQ/trans/gender context';
    }
    return null;
  },

  geriatric: (j) => {
    const title = j.title || '';
    const desc = j.description || '';
    // Filter matches: geriatric, geropsych, elderly, senior living, nursing home.
    // FP risk:
    //  - "geriatric depression" mentioned in a general-population JD
    //    (filter is title-only though, so this is uncommon for true title FPs)
    //  - "senior" not followed by "living" — title filter requires "senior living"
    //    so this is tight
    //  - "nursing home" sometimes appears in titles like "nursing home avoidance
    //    program coordinator" — usually still geriatric, low risk
    // Most likely real FP: titles with "geriatric" used as a competency tag
    // for a general role e.g. "Family NP — geriatric experience preferred"
    if (/\bfamily\s+(nurse\s+practitioner|NP)\b/i.test(title) &&
        !/geriatric\s+(focus|specialty|psych)/i.test(title)) {
      return 'family NP with geriatric tag, not geriatric-focused';
    }
    // Adult-Geriatric Primary Care NP (AGPCNP) = primary care, not psych geriatric
    if (/AGPCNP|adult[-\s]gero(ntology)?\s+primary/i.test(title)) {
      return 'adult-gero primary care, not geri-psych';
    }
    return null;
  },

  crisis: (j) => {
    const title = j.title || '';
    // Filter matches: crisis, emergency psych, acute stabilization, urgent.
    // FP risks:
    //  - "urgent" sweeps in "urgent care" (primary-care urgent care),
    //    "urgent hire", "urgently needed", "urgent opening" — recruiter
    //    copy, not crisis teams
    //  - "crisis intervention" as a *competency* on a general outpatient role
    //    (filter is title-only so this is bounded to titles)
    //  - "crisis communications" / "crisis management" non-clinical
    if (/\burgent\s+(hire|hiring|need|opening|opportunity)\b/i.test(title)) {
      return 'recruiter copy "urgent hire/need", not crisis';
    }
    if (/\burgently\b/i.test(title)) return 'recruiter "urgently"';
    if (/\burgent\s+care\b/i.test(title)) return '"urgent care" = primary-care, not psych ED';
    if (/\bimmediate(ly)?\s+(hire|need|opening)/i.test(title)) {
      return 'recruiter "immediate hire/need"';
    }
    // Outpatient/clinic roles where "crisis" is a competency, not the role
    if (/\boutpatient\b/i.test(title) && !/crisis\s+(team|unit|center|service|response)/i.test(title)) {
      return 'outpatient role with crisis as competency, not crisis team';
    }
    return null;
  },
};

// ── Audit a single filter ────────────────────────────────────────────────────
type FilterResult = {
  slug: string;
  count: number;
  tpSample: string;
  fpSample: string;
  fpRate: string;
  scanned: number;
  fpCount: number;
};

async function auditFilter(slug: string): Promise<FilterResult> {
  const where = buildCategoryWhereClause(slug);
  const count = await prisma.job.count({ where });

  // Pull a larger sample to compute FP rate; show 15-row sample at top
  const SCAN_SIZE = Math.min(count, 200);
  const jobs = await prisma.job.findMany({
    where,
    select: {
      id: true, title: true, employer: true, description: true,
      city: true, state: true, isRemote: true,
    },
    orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
    take: SCAN_SIZE,
  }) as JobSlice[];

  const classify = classifiers[slug] ?? (() => null);
  const tps: JobSlice[] = [];
  const fps: Array<{ job: JobSlice; reason: string }> = [];
  for (const j of jobs) {
    const reason = classify(j);
    if (reason) fps.push({ job: j, reason });
    else tps.push(j);
  }

  console.log('═'.repeat(78));
  console.log(`FILTER: ${slug}    total=${count}    scanned=${jobs.length}`);
  console.log('═'.repeat(78));

  console.log('── 15-row sample (top by qualityScore) ──');
  for (const j of jobs.slice(0, 15)) {
    const loc = [j.city, j.state].filter(Boolean).join(', ') || '—';
    const reason = classify(j);
    const tag = reason ? `  [FP: ${reason}]` : '';
    console.log(`  • ${j.title}`);
    console.log(`      ${j.employer}  ·  ${loc}${tag}`);
  }

  if (fps.length) {
    console.log();
    console.log(`── False-positive examples (${fps.length}/${jobs.length}) ──`);
    for (const { job, reason } of fps.slice(0, 10)) {
      console.log(`  ! ${job.title}`);
      console.log(`      ${job.employer}  ·  ${reason}`);
    }
  }

  const fpRate = jobs.length
    ? `${((fps.length / jobs.length) * 100).toFixed(1)}%`
    : '—';

  return {
    slug,
    count,
    tpSample: tps[0]?.title?.slice(0, 60) ?? '—',
    fpSample: fps[0]?.job.title?.slice(0, 60) ?? '—',
    fpRate,
    scanned: jobs.length,
    fpCount: fps.length,
  };
}

// ── va vs veterans overlap ───────────────────────────────────────────────────
async function compareVaVeterans(): Promise<{
  vaOnly: number;
  vetOnly: number;
  overlap: number;
}> {
  const vaWhere = buildCategoryWhereClause('va');
  const vetWhere = buildCategoryWhereClause('veterans');
  const [va, vet] = await Promise.all([
    prisma.job.findMany({ where: vaWhere, select: { id: true } }),
    prisma.job.findMany({ where: vetWhere, select: { id: true } }),
  ]);
  const vaIds = new Set(va.map(j => j.id));
  const vetIds = new Set(vet.map(j => j.id));
  let overlap = 0;
  for (const id of vaIds) if (vetIds.has(id)) overlap++;
  return {
    vaOnly: vaIds.size - overlap,
    vetOnly: vetIds.size - overlap,
    overlap,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const slugs = ['va', 'veterans', 'lgbtq', 'geriatric', 'crisis'];
  const results: FilterResult[] = [];
  for (const slug of slugs) {
    results.push(await auditFilter(slug));
  }

  console.log();
  console.log('═'.repeat(78));
  console.log('VA vs VETERANS OVERLAP');
  console.log('═'.repeat(78));
  const cmp = await compareVaVeterans();
  console.log(`va-only IDs:        ${cmp.vaOnly}`);
  console.log(`veterans-only IDs:  ${cmp.vetOnly}`);
  console.log(`shared IDs:         ${cmp.overlap}`);
  const aliased =
    cmp.overlap > 0 &&
    cmp.vaOnly + cmp.vetOnly <= cmp.overlap * 0.2;
  console.log(`aliased? ${aliased ? 'YES (>=80% overlap)' : 'NO (sets diverge)'}`);

  console.log();
  console.log('═'.repeat(78));
  console.log('SUMMARY TABLE');
  console.log('═'.repeat(78));
  console.log(
    '| Filter     | Count | Scanned | FPs | FP rate |'
  );
  console.log(
    '|------------|-------|---------|-----|---------|'
  );
  for (const r of results) {
    console.log(
      `| ${r.slug.padEnd(10)} | ${String(r.count).padEnd(5)} | ${String(r.scanned).padEnd(7)} | ${String(r.fpCount).padEnd(3)} | ${r.fpRate.padEnd(7)} |`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
