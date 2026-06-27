import { Prisma } from '@prisma/client';
import { FilterState } from '@/types/filters';
import { OFF_SPECIALTY_TITLE_MARKERS, NON_PROVIDER_TITLE_MARKERS, PSYCH_EMPLOYER_ALLOWLIST, DUAL_ROLE_PATTERNS } from '@/lib/utils/job-filter';

/**
 * "Posted Within" semantics (revised 2026-05-06).
 *
 *   24h  → ingested in last 24h AND original post ≤ 3 days old
 *           ("what's new on the board, capped so 30-day-old originals
 *            don't surface as fresh")
 *   3d / 7d / 30d → originalPostedAt ≥ now − window  (strict)
 *
 * NULL originalPostedAt is excluded from every window. The normalizer
 * defaults missing dates to `new Date()` at ingest, so this affects
 * only legacy rows (~0% of current inventory).
 */
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type PostedWithinWindow = '24h' | '3d' | '7d' | '30d';

export function freshnessClause(
  now: Date,
  window: PostedWithinWindow,
): Prisma.JobWhereInput {
  if (window === '24h') {
    return {
      AND: [
        { createdAt: { gte: new Date(now.getTime() - ONE_DAY_MS) } },
        { originalPostedAt: { gte: new Date(now.getTime() - THREE_DAYS_MS) } },
      ],
    };
  }

  const ms = postedWithinToMs(window);
  if (ms === null) return {};
  return { originalPostedAt: { gte: new Date(now.getTime() - ms) } };
}

export function postedWithinToMs(window: string): number | null {
  switch (window) {
    case '24h': return 24 * 60 * 60 * 1000;
    case '3d':  return 3 * 24 * 60 * 60 * 1000;
    case '7d':  return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default:    return null;
  }
}

/**
 * Candidate-side experience buckets exposed by the "Your experience" filter.
 * Collapsed from the old {1,2,5,7,10} set: no job on the board states a minimum
 * above 5 years, so the 7+/10+ buckets were provably identical to 5+ (dead
 * options). The employer-facing post-job picker keeps its finer
 * EXPERIENCE_BUCKETS granularity (lib/experience-label.ts) — only the candidate
 * FILTER is coarsened so every option stays populated.
 */
export const EXPERIENCE_FILTER_BUCKETS = [1, 2, 5] as const;
export type ExperienceFilterBucket = (typeof EXPERIENCE_FILTER_BUCKETS)[number];

/**
 * When true, a job with no stated minimum (null minYearsExperience) qualifies
 * for every "I have N+ years" bucket. Correct while the column is largely
 * unpopulated (scripts/backfill-experience.ts hasn't run): excluding nulls
 * would empty the candidate bands. Flip to false — ONE line — once the column
 * is backfilled so the bands match only explicit requirements and counts
 * decrease with N. Read by BOTH buildWhereClause and the filter-counts route,
 * so the predicate and the badge counts can never diverge.
 */
export const EXPERIENCE_NULL_QUALIFIES = true;

/**
 * "I have N+ years" candidate-qualifies clause. A candidate with N years
 * qualifies for any job whose stated minimum is ≤ N, plus — while
 * EXPERIENCE_NULL_QUALIFIES — jobs that state no minimum at all.
 */
export function minYearsQualifyClause(n: number): Prisma.JobWhereInput {
  if (EXPERIENCE_NULL_QUALIFIES) {
    return {
      OR: [
        { minYearsExperience: { lte: n } },
        { minYearsExperience: null },
      ],
    };
  }
  return { minYearsExperience: { lte: n } };
}

/**
 * Centralized Category Filter Registry
 * Single source of truth for all category page filters.
 * Used by both /jobs/[category]/page.tsx AND /jobs?category=[slug]
 */
// Per-slug structured-flag OR clauses that augment the keyword regex. Shared by
// BOTH the category-page builder and the ?category= querystring builder so
// /jobs/new-grad and /jobs?category=new-grad return the same set (they used to
// disagree — the querystring path omitted the newGradFriendly flag branch).
export const CATEGORY_EXTRA_OR: Record<string, Prisma.JobWhereInput[]> = {
  // newGradFriendly flag OR the 0-yr "New grad accepted" bucket (min=0). The
  // latter is the same signal the JobCard chip shows for min=0, so the filter,
  // the ?category=new-grad path, and the /jobs/new-grad pSEO page all agree.
  'new-grad': [{ newGradFriendly: true }, { minYearsExperience: 0 }],
};

export const CATEGORY_FILTERS: Record<string, Prisma.JobWhereInput[]> = {
  'child-adolescent': [
    { title: { contains: 'child and adolescent', mode: 'insensitive' } },
    { title: { contains: 'child/adolescent', mode: 'insensitive' } },
    { title: { contains: 'child psychiatr', mode: 'insensitive' } },
    { title: { contains: 'child & adolescent', mode: 'insensitive' } },
    { title: { contains: 'pediatric psych', mode: 'insensitive' } },
    { title: { contains: 'pediatric mental', mode: 'insensitive' } },
    { title: { contains: 'CAPMHNP', mode: 'insensitive' } },
    { title: { contains: 'adolescent psychiatr', mode: 'insensitive' } },
  ],
  'community-health': [
    { title: { contains: 'community health', mode: 'insensitive' } },
    { title: { contains: 'community mental health', mode: 'insensitive' } },
    { title: { contains: 'community clinic', mode: 'insensitive' } },
    { title: { contains: 'community psychiatry', mode: 'insensitive' } },
    { title: { contains: 'community based', mode: 'insensitive' } },
    { title: { contains: 'FQHC', mode: 'insensitive' } },
    { title: { contains: 'public health', mode: 'insensitive' } },
  ],
  'correctional': [
    { title: { contains: 'correctional', mode: 'insensitive' } },
    { title: { contains: 'corrections', mode: 'insensitive' } },
    { title: { contains: 'prison', mode: 'insensitive' } },
    { title: { contains: 'forensic', mode: 'insensitive' } },
    { title: { contains: 'jail', mode: 'insensitive' } },
    { title: { contains: 'detention', mode: 'insensitive' } },
    { title: { contains: 'incarcerat', mode: 'insensitive' } },
  ],
  // Bare `fellowship` / `residency` removed 2026-05-15 — they matched
  // post-grad APP fellowships requiring 3-5 yrs prior NP experience.
  // The `program` suffix is required so PMHNP residency / fellowship
  // training programs are caught while post-grad fellowships aren't.
  'new-grad': [
    { title: { contains: 'new grad', mode: 'insensitive' } },
    { title: { contains: 'new graduate', mode: 'insensitive' } },
    { title: { contains: 'entry level', mode: 'insensitive' } },
    { title: { contains: 'fellowship program', mode: 'insensitive' } },
    { title: { contains: 'residency program', mode: 'insensitive' } },
    { title: { contains: 'recent graduate', mode: 'insensitive' } },
    { title: { contains: 'training program', mode: 'insensitive' } },
  ],
  'outpatient': [
    { title: { contains: 'outpatient', mode: 'insensitive' } },
    { title: { contains: 'out-patient', mode: 'insensitive' } },
    { title: { contains: 'private practice', mode: 'insensitive' } },
    { title: { contains: 'community mental health', mode: 'insensitive' } },
  ],
  'substance-abuse': [
    { title: { contains: 'substance', mode: 'insensitive' } },
    { title: { contains: 'addiction', mode: 'insensitive' } },
    { title: { contains: 'suboxone', mode: 'insensitive' } },
    { title: { contains: 'dual diagnosis', mode: 'insensitive' } },
    { title: { contains: 'SUD ', mode: 'insensitive' } },
    { title: { contains: 'medication-assisted', mode: 'insensitive' } },
    { title: { contains: 'medication assisted treatment', mode: 'insensitive' } },
    { title: { contains: 'buprenorphine', mode: 'insensitive' } },
  ],
  'telehealth': [
    { title: { contains: 'telehealth', mode: 'insensitive' } },
    { title: { contains: 'telemedicine', mode: 'insensitive' } },
    { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
    { title: { contains: 'virtual', mode: 'insensitive' } },
  ],
  'contract': [
    { title: { contains: 'contract', mode: 'insensitive' } },
    { title: { contains: 'temp-to-perm', mode: 'insensitive' } },
    { title: { contains: 'temporary', mode: 'insensitive' } },
  ],
  'crisis': [
    { title: { contains: 'crisis', mode: 'insensitive' } },
    { title: { contains: 'emergency psych', mode: 'insensitive' } },
    { title: { contains: 'acute stabilization', mode: 'insensitive' } },
    { title: { contains: 'psychiatric urgent', mode: 'insensitive' } },
    { title: { contains: 'urgent psychiatric', mode: 'insensitive' } },
  ],
  'entry-level': [
    { title: { contains: 'entry level', mode: 'insensitive' } },
    { title: { contains: 'entry-level', mode: 'insensitive' } },
    { title: { contains: 'new grad', mode: 'insensitive' } },
    { title: { contains: 'new graduate', mode: 'insensitive' } },
  ],
  'full-time': [
    { title: { contains: 'full-time', mode: 'insensitive' } },
    { title: { contains: 'full time', mode: 'insensitive' } },
    { title: { contains: 'FT ', mode: 'insensitive' } },
    { title: { contains: 'permanent', mode: 'insensitive' } },
  ],
  'geriatric': [
    { title: { contains: 'geriatric', mode: 'insensitive' } },
    { title: { contains: 'geropsych', mode: 'insensitive' } },
    { title: { contains: 'elderly', mode: 'insensitive' } },
    { title: { contains: 'senior living', mode: 'insensitive' } },
    { title: { contains: 'nursing home', mode: 'insensitive' } },
  ],
  'hospital': [
    { title: { contains: 'hospital', mode: 'insensitive' } },
    { title: { contains: 'acute care', mode: 'insensitive' } },
    { title: { contains: 'acute psych', mode: 'insensitive' } },
  ],
  'lgbtq': [
    { title: { contains: 'LGBTQ', mode: 'insensitive' } },
    { title: { contains: 'transgender', mode: 'insensitive' } },
    { title: { contains: 'gender-affirming', mode: 'insensitive' } },
    { title: { contains: 'gender affirming', mode: 'insensitive' } },
    { title: { contains: 'gender identity', mode: 'insensitive' } },
    { title: { contains: 'affirming care', mode: 'insensitive' } },
  ],
  'locum-tenens': [
    { title: { contains: 'locum', mode: 'insensitive' } },
    { title: { contains: 'locums', mode: 'insensitive' } },
    { title: { contains: 'temporary assignment', mode: 'insensitive' } },
  ],
  'mid-career': [
    { title: { contains: 'experienced', mode: 'insensitive' } },
    { title: { contains: 'supervisor', mode: 'insensitive' } },
    { title: { contains: 'program director', mode: 'insensitive' } },
    { title: { contains: 'clinical director', mode: 'insensitive' } },
    { title: { contains: 'lead clinician', mode: 'insensitive' } },
    { title: { contains: 'lead PMHNP', mode: 'insensitive' } },
    { title: { contains: 'senior PMHNP', mode: 'insensitive' } },
    { title: { contains: 'senior NP', mode: 'insensitive' } },
    { title: { contains: 'senior nurse practitioner', mode: 'insensitive' } },
  ],
  'part-time': [
    { title: { contains: 'part-time', mode: 'insensitive' } },
    { title: { contains: 'part time', mode: 'insensitive' } },
    { title: { contains: 'PRN', mode: 'insensitive' } },
  ],
  'per-diem': [
    { title: { contains: 'per diem', mode: 'insensitive' } },
    { title: { contains: 'per-diem', mode: 'insensitive' } },
  ],
  'private-practice': [
    { title: { contains: 'private practice', mode: 'insensitive' } },
    { title: { contains: 'group practice', mode: 'insensitive' } },
    { title: { contains: 'solo practice', mode: 'insensitive' } },
    { title: { contains: 'independent practice', mode: 'insensitive' } },
  ],
  'senior': [
    // Title-based leadership / senior-IC keywords only. Salary-OR and the
    // bare "years of experience" description match were removed 2026-05-14
    // because they swept in ~45% of the board. The structured
    // `minYearsExperience >= 5` clause below replaces those signals.
    { title: { contains: 'senior PMHNP', mode: 'insensitive' } },
    { title: { contains: 'senior NP', mode: 'insensitive' } },
    { title: { contains: 'senior nurse practitioner', mode: 'insensitive' } },
    { title: { contains: 'lead PMHNP', mode: 'insensitive' } },
    { title: { contains: 'clinical lead', mode: 'insensitive' } },
    { title: { contains: 'clinical leader', mode: 'insensitive' } },
    { title: { contains: 'PMHNP supervisor', mode: 'insensitive' } },
    { title: { contains: 'NP supervisor', mode: 'insensitive' } },
    { title: { contains: 'nurse practitioner supervisor', mode: 'insensitive' } },
    { title: { contains: 'medical director', mode: 'insensitive' } },
    { title: { contains: 'clinical director', mode: 'insensitive' } },
    { title: { contains: 'program director', mode: 'insensitive' } },
    { title: { contains: 'chief of mental health', mode: 'insensitive' } },
    { title: { contains: 'clinic director', mode: 'insensitive' } },
    { title: { contains: 'director of psych', mode: 'insensitive' } },
    { title: { contains: 'PMHNP director', mode: 'insensitive' } },
    { title: { contains: 'vice president', mode: 'insensitive' } },
    // Structured experience: 5+ years required
    { minYearsExperience: { gte: 5 } },
  ],
  'travel': [
    // Scoped to explicit travel terms only. The previous regex matched
    // `locum` and bare `assignment`, which made /jobs/travel a strict
    // superset of /jobs/locum-tenens (100% overlap). Travel-nursing
    // postings reliably include the word "travel".
    { title: { contains: 'travel', mode: 'insensitive' } },
    { title: { contains: 'traveling', mode: 'insensitive' } },
    { title: { contains: 'travel assignment', mode: 'insensitive' } },
  ],
  '1099': [
    { title: { contains: '1099', mode: 'insensitive' } },
    { title: { contains: 'independent contractor', mode: 'insensitive' } },
    { title: { contains: 'independent practice', mode: 'insensitive' } },
    { description: { contains: '1099', mode: 'insensitive' } },
  ],
  // Addiction / SUD focus. Tightened 2026-05-14:
  //   - Dropped bare `description: 'addiction'` — matched generic
  //     boilerplate ("we treat anxiety, depression, addiction…"), driving
  //     ~95% ambiguous results.
  //   - Replaced bare title `recovery` with "addiction recovery" /
  //     "recovery center" / "in recovery" to avoid post-op recovery FPs.
  'addiction': [
    { title: { contains: 'addiction', mode: 'insensitive' } },
    { title: { contains: 'substance', mode: 'insensitive' } },
    { title: { contains: 'substance use', mode: 'insensitive' } },
    { title: { contains: ' SUD', mode: 'insensitive' } },
    { title: { contains: ' MAT ', mode: 'insensitive' } },
    { title: { contains: 'MAT program', mode: 'insensitive' } },
    { title: { contains: 'MAT &', mode: 'insensitive' } },
    { title: { contains: 'opioid', mode: 'insensitive' } },
    { title: { contains: 'detox', mode: 'insensitive' } },
    { title: { contains: 'addiction recovery', mode: 'insensitive' } },
    { title: { contains: 'recovery center', mode: 'insensitive' } },
    { title: { contains: 'suboxone', mode: 'insensitive' } },
    { title: { contains: 'buprenorphine', mode: 'insensitive' } },
    { description: { contains: 'substance use disorder', mode: 'insensitive' } },
    { description: { contains: 'MAT program', mode: 'insensitive' } },
    { description: { contains: 'buprenorphine', mode: 'insensitive' } },
  ],
  'behavioral-health': [
    { title: { contains: 'behavioral health', mode: 'insensitive' } },
    { title: { contains: 'behavioral', mode: 'insensitive' } },
    { title: { contains: 'mental health', mode: 'insensitive' } },
    { title: { contains: 'psychiatric', mode: 'insensitive' } },
    { title: { contains: 'psych NP', mode: 'insensitive' } },
    { title: { contains: 'PMHNP', mode: 'insensitive' } },
    { description: { contains: 'behavioral health', mode: 'insensitive' } },
    { description: { contains: 'behavioral health facility', mode: 'insensitive' } },
  ],
  'inpatient': [
    { title: { contains: 'inpatient', mode: 'insensitive' } },
    { title: { contains: 'in-patient', mode: 'insensitive' } },
    { title: { contains: 'acute care', mode: 'insensitive' } },
    { title: { contains: 'hospital', mode: 'insensitive' } },
  ],
  // Veterans Affairs employment. The previous `contains: 'VA '` matched
  // employer names like "Nova Medical" (substring "va "). Removed; we
  // require explicit "Veterans" / "VHA" / "Department of Veterans"
  // tokens that don't collide with state abbreviations or generic names.
  'va': [
    { employer: { contains: 'Veterans Affairs', mode: 'insensitive' } },
    { employer: { contains: 'Department of Veterans', mode: 'insensitive' } },
    { employer: { contains: 'VHA', mode: 'insensitive' } },
    { employer: { startsWith: 'VA ', mode: 'insensitive' } },
    { title: { contains: 'Veterans Affairs', mode: 'insensitive' } },
    { title: { contains: 'VA Medical Center', mode: 'insensitive' } },
  ],
  // Veterans-population focus. Dropped `contains: 'VA '` — it matched
  // "VA License" (Virginia state-license requirement, not veterans).
  'veterans': [
    { title: { contains: 'veteran', mode: 'insensitive' } },
    { title: { contains: 'military', mode: 'insensitive' } },
    { title: { contains: 'VHA', mode: 'insensitive' } },
    { title: { contains: 'combat', mode: 'insensitive' } },
    { title: { contains: 'PTSD', mode: 'insensitive' } },
  ],
  'remote': [
    // Remote uses isRemote boolean, not title-based — see CATEGORY_SPECIAL_FILTERS
  ],
};

/**
 * Category Exclusion Registry
 * Negative filters to remove false positives from category results.
 * Each entry is a list of conditions — any matching job is EXCLUDED.
 */
export const CATEGORY_EXCLUSIONS: Record<string, Prisma.JobWhereInput[]> = {
  'new-grad': [
    { title: { contains: 'director', mode: 'insensitive' } },
    { title: { contains: 'instructor', mode: 'insensitive' } },
    { title: { contains: 'no new grad', mode: 'insensitive' } },
    { title: { contains: 'clinical psychology', mode: 'insensitive' } },
    { title: { contains: 'fellowship trained', mode: 'insensitive' } },
    { title: { contains: 'APC Fellowship', mode: 'insensitive' } },
    { title: { contains: 'Advanced Practice Provider', mode: 'insensitive' } },
  ],
  'part-time': [
    // PRN sometimes appears alongside Full-Time in dual-listing titles
    // like "Part or Full Time" / "FT/PRN". Use the structured jobType
    // column as a tie-breaker: if the employer normalized the row to
    // Full-Time, it doesn't belong on /jobs/part-time.
    { jobType: { equals: 'Full-Time', mode: 'insensitive' } },
  ],
  'senior': [
    // Exclude non-PMHNP leadership roles
    { title: { contains: 'Nursing Director', mode: 'insensitive' } },
    { title: { contains: 'HR Director', mode: 'insensitive' } },
    { title: { contains: 'IT Director', mode: 'insensitive' } },
    { title: { contains: 'Finance Director', mode: 'insensitive' } },
    { title: { contains: 'Rise Director', mode: 'insensitive' } },
    { title: { contains: 'Non-Supervisory', mode: 'insensitive' } },
    // Exclude pure psychiatrist roles (no NP/Nurse mention)
    {
      AND: [
        { title: { contains: 'Psychiatrist', mode: 'insensitive' } },
        { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
        { NOT: { title: { contains: ' NP', mode: 'insensitive' } } },
      ],
    },
  ],
  'outpatient': [
    // Exclude MD Psychiatrist roles that don't mention NP/Nurse/PMHNP/APRN
    {
      AND: [
        { title: { contains: 'Psychiatrist', mode: 'insensitive' } },
        { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'Practitioner', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
        { NOT: { title: { contains: ' NP', mode: 'insensitive' } } },
      ],
    },
  ],
};

/**
 * Global Exclusions — applied to EVERY query site-wide.
 * Removes jobs that should never appear on a PMHNP job board.
 */
// Psychiatric signal in the TITLE that rescues an off-specialty title from the
// off-specialty exclusion below (e.g. "Psychiatric Family NP", "Family NP -
// PMHNP", "Family NP - Substance Use Disorder"). Addiction/SUD is in-scope for
// this board, mirroring the ingest gate's addiction rescue.
const PSYCH_TITLE_SIGNALS = [
  'psych', 'mental health', 'behavioral health', 'pmhnp', 'telepsych',
  'substance use', 'addiction', 'suboxone', 'opioid treatment', 'otp',
];
// Psychiatric signal in the EMPLOYER name (psych orgs + the known-psych
// allowlist that carries no psych keyword, e.g. Lyra Health, Talkiatry).
const PSYCH_EMPLOYER_SIGNALS = [
  'psych', 'mental health', 'behavioral', 'recovery', 'addiction', 'substance', 'counseling',
  ...PSYCH_EMPLOYER_ALLOWLIST,
];
// NP/PA credential signals that protect a real provider from the non-provider
// exclusion below (a recruiter/psychometrist title carries none of these).
const NP_CREDENTIAL_SIGNALS = ['nurse practitioner', 'pmhnp', 'aprn', 'arnp', ' np', 'physician assistant', 'pa-c'];
// Confirmed non-psychiatric aggregator employers (senior / primary care, SNF,
// general federal staffing) that emit generic "Nurse Practitioner" titles with
// no psych signal. Hidden UNLESS the posting itself carries a psych title, so a
// rare genuine psych role from them still shows. Stopgap for the currently
// confirmed offenders — the durable controls are the ingest gate + the periodic
// audit (scripts/audit/audit-non-pmhnp.ts).
const NON_PSYCH_EMPLOYER_BLOCKLIST = ['chenmed', 'akido labs', 'truhealth', 'akicita'];

export const GLOBAL_EXCLUSIONS: Prisma.JobWhereInput[] = [
  // Exclude pure MD Psychiatrist roles (no NP/Nurse/PMHNP/APRN mention)
  {
    AND: [
      { title: { contains: 'Psychiatrist', mode: 'insensitive' } },
      { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'Practitioner', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
      { NOT: { title: { contains: ' NP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'ARNP', mode: 'insensitive' } } },
    ],
  },
  // Exclude pure Physician roles
  {
    AND: [
      { title: { contains: 'Physician', mode: 'insensitive' } },
      { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'Practitioner', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
      { NOT: { title: { contains: ' NP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'APP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'Collaborat', mode: 'insensitive' } } },
    ],
  },
  // Exclude pure MD/DO roles
  {
    AND: [
      { title: { contains: 'MD/DO', mode: 'insensitive' } },
      { NOT: { title: { contains: ' NP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
    ],
  },
  // Exclude OFF-SPECIALTY NP/PA roles that leak from aggregators — Family NP,
  // primary care, hospice, women's health, oncology, etc. A job is excluded
  // when its TITLE names another specialty AND there is no psychiatric signal
  // in the title or employer name. Description is deliberately NOT consulted:
  // a primary-care JD (e.g. One Medical) that lists "behavioral health" once
  // among its services must still be excluded. This mirrors the off-specialty
  // veto in lib/utils/job-filter.ts (the ingest gate) at query time, so
  // already-ingested rows are hidden site-wide without a data mutation.
  {
    AND: [
      { OR: OFF_SPECIALTY_TITLE_MARKERS.map((m): Prisma.JobWhereInput => ({ title: { contains: m, mode: 'insensitive' } })) },
      {
        NOT: {
          OR: [
            ...PSYCH_TITLE_SIGNALS.map((w): Prisma.JobWhereInput => ({ title: { contains: w, mode: 'insensitive' } })),
            ...PSYCH_EMPLOYER_SIGNALS.map((w): Prisma.JobWhereInput => ({ employer: { contains: w, mode: 'insensitive' } })),
          ],
        },
      },
    ],
  },
  // Exclude BARE dual-role "Nurse Practitioner or Physician Assistant" titles
  // (no specialty, no psych word) with no psychiatric signal in the title or
  // employer. These are primary-care / hospice staffing posts (One Medical,
  // Ennoble Care). Psych NP-or-PA roles ARE wanted, but they carry a psych word
  // in the title or a psych employer and so are rescued by the NOT clause.
  {
    AND: [
      { OR: DUAL_ROLE_PATTERNS.map((m): Prisma.JobWhereInput => ({ title: { contains: m, mode: 'insensitive' } })) },
      {
        NOT: {
          OR: [
            ...PSYCH_TITLE_SIGNALS.map((w): Prisma.JobWhereInput => ({ title: { contains: w, mode: 'insensitive' } })),
            ...PSYCH_EMPLOYER_SIGNALS.map((w): Prisma.JobWhereInput => ({ employer: { contains: w, mode: 'insensitive' } })),
          ],
        },
      },
    ],
  },
  // Exclude non-provider / non-NP roles (recruiter, psychometrist, growth/
  // patient-access, epileptologist) — not PMHNP postings even when the JD
  // mentions psychiatry. Guarded so a title carrying a real NP/PA credential
  // is never excluded.
  {
    AND: [
      { OR: NON_PROVIDER_TITLE_MARKERS.map((m): Prisma.JobWhereInput => ({ title: { contains: m, mode: 'insensitive' } })) },
      {
        NOT: {
          OR: NP_CREDENTIAL_SIGNALS.map((w): Prisma.JobWhereInput => ({ title: { contains: w, mode: 'insensitive' } })),
        },
      },
    ],
  },
  // Exclude generic NP titles from confirmed non-psych employers, unless the
  // specific posting's title carries a psych signal.
  {
    AND: [
      { OR: NON_PSYCH_EMPLOYER_BLOCKLIST.map((e): Prisma.JobWhereInput => ({ employer: { contains: e, mode: 'insensitive' } })) },
      {
        NOT: {
          OR: PSYCH_TITLE_SIGNALS.map((w): Prisma.JobWhereInput => ({ title: { contains: w, mode: 'insensitive' } })),
        },
      },
    ],
  },
];

/**
 * Build a Prisma WHERE clause for a category page.
 * Applies: CATEGORY_FILTERS + CATEGORY_EXCLUSIONS + GLOBAL_EXCLUSIONS
 * This guarantees the same count the main /jobs?category=slug page shows.
 *
 * @param slug  Category slug (e.g. '1099', 'addiction')
 * @param extra Additional Prisma conditions merged at the top level
 *              (e.g. { isRemote: { not: true } } for inpatient)
 */
export function buildCategoryWhereClause(
  slug: string,
  extra: Prisma.JobWhereInput = {},
): Prisma.JobWhereInput {
  const andConditions: Prisma.JobWhereInput[] = [];

  // Category filter (OR conditions from registry, plus any structured
  // extras for this slug — CATEGORY_EXTRA_OR is module-scoped and shared
  // with buildWhereClause's ?category= branch).
  const baseOr = CATEGORY_FILTERS[slug] ?? [];
  const extraOr = CATEGORY_EXTRA_OR[slug] ?? [];
  if (baseOr.length || extraOr.length) {
    andConditions.push({ OR: [...baseOr, ...extraOr] });
  }

  // Category-specific exclusions
  if (CATEGORY_EXCLUSIONS[slug]) {
    CATEGORY_EXCLUSIONS[slug].forEach(exclusion => {
      andConditions.push({ NOT: exclusion });
    });
  }

  // Global exclusions (removes non-PMHNP jobs)
  GLOBAL_EXCLUSIONS.forEach(exclusion => {
    andConditions.push({ NOT: exclusion });
  });

  return {
    isPublished: true,
    ...extra,
    AND: andConditions,
  };
}

/**
 * "Open to new grads" match — the single source of truth shared by
 * buildWhereClause AND the filter-counts route, so the filter predicate and the
 * badge count can never diverge. A job qualifies when ANY of:
 *   (a) employer flagged newGradFriendly: true
 *   (b) it declares a 0-year minimum — the "New grad accepted" bucket, the SAME
 *       signal the JobCard chip shows for min=0 (deriveExperienceLabel). Without
 *       this, a min=0 post read "New grad welcome" on the card but was invisible
 *       to this filter.
 *   (c) title matches CATEGORY_FILTERS['new-grad'] keywords
 * ...minus CATEGORY_EXCLUSIONS['new-grad'] (director, instructor, "no new grad").
 */
export function newGradWhereClause(): Prisma.JobWhereInput {
  return {
    AND: [
      {
        OR: [
          // structured flags (newGradFriendly OR min=0) + title keywords —
          // identical OR to buildCategoryWhereClause('new-grad').
          ...(CATEGORY_EXTRA_OR['new-grad'] ?? []),
          ...(CATEGORY_FILTERS['new-grad'] ?? []),
        ],
      },
      ...(CATEGORY_EXCLUSIONS['new-grad'] ?? []).map((ex): Prisma.JobWhereInput => ({ NOT: ex })),
    ],
  };
}

export function buildWhereClause(filters: FilterState): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {
    isPublished: true,
  };

  const andConditions: Prisma.JobWhereInput[] = [];

  // Apply global exclusions (removes non-PMHNP jobs from all queries)
  GLOBAL_EXCLUSIONS.forEach(exclusion => {
    andConditions.push({ NOT: exclusion });
  });

  // Search — split into terms and require ALL terms to match (AND)
  if (filters.search && filters.search.trim()) {
    const terms = filters.search.trim().split(/\s+/).filter(Boolean);
    for (const term of terms) {
      andConditions.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { employer: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { state: { contains: term, mode: 'insensitive' } },
        ],
      });
    }
  }

  // Category filter (enterprise pattern: reuses same filter as category pages).
  // Include CATEGORY_EXTRA_OR so ?category=new-grad matches the same jobs as the
  // /jobs/new-grad page (both reach newGradFriendly-flagged jobs).
  if (filters.category && (CATEGORY_FILTERS[filters.category] || CATEGORY_EXTRA_OR[filters.category])) {
    andConditions.push({
      OR: [...(CATEGORY_FILTERS[filters.category] ?? []), ...(CATEGORY_EXTRA_OR[filters.category] ?? [])],
    });
    // Apply exclusions to remove false positives
    if (CATEGORY_EXCLUSIONS[filters.category]) {
      CATEGORY_EXCLUSIONS[filters.category].forEach(exclusion => {
        andConditions.push({ NOT: exclusion });
      });
    }
  }

  // Work Mode (OR within category)
  if (filters.workMode.length > 0) {
    const workModeConditions: Prisma.JobWhereInput[] = [];

    if (filters.workMode.includes('remote')) {
      workModeConditions.push({ isRemote: true });
    }
    if (filters.workMode.includes('hybrid')) {
      workModeConditions.push({ isHybrid: true });
    }
    if (filters.workMode.includes('onsite')) {
      workModeConditions.push({ isRemote: false, isHybrid: false });
    }

    if (workModeConditions.length > 0) {
      andConditions.push({ OR: workModeConditions });
    }
  }

  // Job Type (OR within category)
  if (filters.jobType.length > 0) {
    const hasOther = filters.jobType.includes('Other');
    const namedTypes = filters.jobType.filter(t => t !== 'Other');

    if (hasOther && namedTypes.length > 0) {
      // Match named types OR NULL
      andConditions.push({
        OR: [
          { jobType: { in: namedTypes } },
          { jobType: null },
        ],
      });
    } else if (hasOther) {
      // Only "Other" selected — match NULL
      andConditions.push({ jobType: null });
    } else {
      // Only named types
      andConditions.push({ jobType: { in: namedTypes } });
    }
  }

  // Salary
  if (filters.salaryMin) {
    andConditions.push({
      OR: [
        { normalizedMinSalary: { gte: filters.salaryMin } },
        { normalizedMaxSalary: { gte: filters.salaryMin } },
      ],
    });
  }

  // Posted Within — see `freshnessClause` for the windowed semantics.
  if (filters.postedWithin && filters.postedWithin !== 'all') {
    if (postedWithinToMs(filters.postedWithin) !== null) {
      andConditions.push(
        freshnessClause(new Date(), filters.postedWithin as PostedWithinWindow),
      );
    }
  }

  // Location. Mirrors /jobs/state/[s] composition: state name OR
  // state code. Previously this also did `city contains <location>`,
  // which inflated Kansas counts via "Kansas City, MO" and similar
  // cross-state name collisions.
  if (filters.location) {
    andConditions.push({
      OR: [
        { state: { equals: filters.location, mode: 'insensitive' } },
        { stateCode: { equals: filters.location, mode: 'insensitive' } },
      ],
    });
  }

  // Precise city + state match (from metro/city page CTAs)
  if (filters.cityExact) {
    andConditions.push({
      city: { equals: filters.cityExact, mode: 'insensitive' },
    });
  }
  if (filters.stateCode) {
    andConditions.push({
      OR: [
        { stateCode: { equals: filters.stateCode, mode: 'insensitive' } },
        { state: { equals: filters.stateCode, mode: 'insensitive' } },
      ],
    });
  }

  // Specialty (keyword-based, OR within category)
  if (filters.specialty && filters.specialty.length > 0) {
    const specialtyConditions: Prisma.JobWhereInput[] = [];

    if (filters.specialty.includes('Telehealth')) {
      specialtyConditions.push({
        OR: [
          { title: { contains: 'telehealth', mode: 'insensitive' } },
          { title: { contains: 'telemedicine', mode: 'insensitive' } },
          { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
          { description: { contains: 'telehealth', mode: 'insensitive' } },
          { description: { contains: 'telemedicine', mode: 'insensitive' } },
        ],
      });
    }
    if (filters.specialty.includes('Travel')) {
      specialtyConditions.push({
        OR: [
          { title: { contains: 'travel', mode: 'insensitive' } },
          { title: { contains: 'locum', mode: 'insensitive' } },
        ],
      });
    }

    if (specialtyConditions.length > 0) {
      andConditions.push({ OR: specialtyConditions });
    }
  }

  // Experience Level (from DB column — LEGACY, frozen 2026-05-13)
  if (filters.experienceLevel && filters.experienceLevel.length > 0) {
    andConditions.push({
      experienceLevel: { in: filters.experienceLevel },
    });
  }

  // "Open to new grads" — unified with the /jobs/new-grad category
  // page so the checkbox and the pSEO page never disagree on what
  // counts as new-grad. A job matches if ANY of:
  //   (a) employer explicitly flagged newGradFriendly: true
  //   (b) title matches CATEGORY_FILTERS['new-grad'] keywords
  //       (new grad / entry level / fellowship / residency / training
  //        program / recent graduate)
  // ...AND none of CATEGORY_EXCLUSIONS['new-grad'] apply (director,
  // instructor, "no new grad", etc.).
  if (filters.newGradFriendly === true) {
    andConditions.push(newGradWhereClause());
  }

  // "Your experience" (candidate-qualifies). Clause shape + null handling live
  // in minYearsQualifyClause / EXPERIENCE_NULL_QUALIFIES so this predicate and
  // the filter-counts badges can never diverge.
  if (typeof filters.minYearsExperience === 'number' && filters.minYearsExperience >= 0) {
    andConditions.push(minYearsQualifyClause(filters.minYearsExperience));
  }

  // Employer
  if (filters.employer) {
    andConditions.push({
      employer: { equals: filters.employer, mode: 'insensitive' },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

// Parse URL search params to FilterState
export function parseFiltersFromParams(searchParams: URLSearchParams): FilterState {
  const minYearsRaw = searchParams.get('minYears');
  const minYears = minYearsRaw !== null && /^\d+$/.test(minYearsRaw) ? Number(minYearsRaw) : null;
  return {
    search: searchParams.get('q') || '',
    workMode: searchParams.getAll('workMode'),
    jobType: searchParams.getAll('jobType'),
    specialty: searchParams.getAll('specialty'),
    experienceLevel: searchParams.getAll('experienceLevel'),
    newGradFriendly: searchParams.get('newGrad') === '1' ? true : null,
    minYearsExperience: minYears,
    salaryMin: searchParams.get('salaryMin') ? Number(searchParams.get('salaryMin')) : null,
    postedWithin: searchParams.get('postedWithin') || null,
    location: searchParams.get('location') || null,
    cityExact: searchParams.get('cityExact') || null,
    stateCode: searchParams.get('stateCode') || null,
    employer: searchParams.get('employer') || null,
    category: searchParams.get('category') || null,
  };
}

// Convert FilterState to URL search params
export function filtersToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set('q', filters.search);
  filters.workMode.forEach((wm: string) => params.append('workMode', wm));
  filters.jobType.forEach((jt: string) => params.append('jobType', jt));
  if (filters.specialty) filters.specialty.forEach((s: string) => params.append('specialty', s));
  if (filters.experienceLevel) filters.experienceLevel.forEach((el: string) => params.append('experienceLevel', el));
  if (filters.newGradFriendly === true) params.set('newGrad', '1');
  if (typeof filters.minYearsExperience === 'number' && filters.minYearsExperience >= 0) {
    params.set('minYears', String(filters.minYearsExperience));
  }
  if (filters.salaryMin) params.set('salaryMin', String(filters.salaryMin));
  if (filters.postedWithin) params.set('postedWithin', filters.postedWithin);
  if (filters.location) params.set('location', filters.location);
  if (filters.cityExact) params.set('cityExact', filters.cityExact);
  if (filters.stateCode) params.set('stateCode', filters.stateCode);
  if (filters.employer) params.set('employer', filters.employer);
  if (filters.category) params.set('category', filters.category);

  return params;
}

