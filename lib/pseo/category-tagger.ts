/**
 * Pure category-tag classifier.
 *
 * Why this exists: pre-P9, taxonomy×city and taxonomy×state pages used
 * `OR title.contains 'X' OR description.contains 'X'` matchers at QUERY
 * time. A typical PMHNP description mentions "behavioral health",
 * "outpatient", "community health", and "mental health" all at once, so
 * the same job appeared on 4–5 different taxonomy pages with near-
 * identical chrome. Google's quality model flags this as duplicate.
 *
 * The fix: classify each job ONCE (at ingest, plus a one-shot backfill
 * for existing rows) into a precomputed `Job.categoryTags` array, then
 * query with `categoryTags: { has: 'X' }` — exact match, no false
 * positives, no cross-taxonomy bleed.
 *
 * This function is the single source of truth for tag derivation.
 * Callers:
 *   - lib/job-normalizer.ts (ingest path, every external job)
 *   - app/api/jobs/route.ts via post-job submit (employer-posted jobs)
 *   - scripts/backfill-category-tags.ts (one-shot for existing rows)
 *
 * Pure function. No DB access. Easy to unit-test.
 */

export interface ClassifiableJob {
    title: string;
    description?: string | null;
    descriptionSummary?: string | null;
    jobType?: string | null;
    isRemote?: boolean | null;
    setting?: string | null;        // populated for employer-posted jobs
    population?: string | null;     // populated for employer-posted jobs
}

/** All canonical category slugs the classifier can emit. */
export const CANONICAL_CATEGORY_SLUGS = [
    // Settings
    'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
    // Job types
    'full-time', 'part-time', 'contract', 'per-diem', 'locum-tenens', '1099',
    // Specialties / populations
    'addiction', 'substance-abuse', 'child-adolescent', 'geriatric',
    'behavioral-health', 'community-health', 'correctional', 'crisis',
    'lgbtq', 'veterans',
    // Experience
    'entry-level', 'new-grad', 'mid-career', 'senior',
    // Settings (employer types)
    'hospital', 'private-practice', 'va',
] as const;

export type CategoryTag = typeof CANONICAL_CATEGORY_SLUGS[number];

/**
 * Substring rules per category, applied case-insensitively against title +
 * description. Keep these tightly scoped — broader matchers re-introduce
 * the duplication problem this whole feature fixes.
 *
 * Rule of thumb: title-only patterns are highest quality. Description-only
 * patterns should be obvious enough that no false positives slip in
 * (e.g. "FQHC" is unambiguous; "community" alone would over-tag).
 */
interface CategoryRule {
    /** Case-insensitive substrings — match if ANY appears in title or description. */
    keywords: string[];
    /** If true, also accept matches anywhere in description. Default true. */
    matchDescription?: boolean;
    /** Direct conditions on structured fields (highest priority — bypass keyword scan). */
    structural?: (job: ClassifiableJob) => boolean;
    /**
     * Mutual-exclusion list. If the job already qualified for any of these
     * categories, do NOT also tag this one. Used to break cross-taxonomy
     * duplication (e.g. inpatient excludes outpatient/private-practice).
     */
    excludeIfAlsoTagged?: CategoryTag[];
}

const RULES: Partial<Record<CategoryTag, CategoryRule>> = {
    // ── Settings (mutually exclusive: a job is one of these, not many) ──
    inpatient: {
        keywords: ['inpatient', 'in-patient', 'acute care', 'acute psych', 'crisis stabilization', 'inpatient unit'],
        matchDescription: false, // title-only — description noise is rampant
    },
    outpatient: {
        keywords: ['outpatient', 'out-patient', 'community mental health'],
        matchDescription: false,
        excludeIfAlsoTagged: ['inpatient'],
    },
    'private-practice': {
        keywords: ['private practice', 'group practice', 'solo practice', 'independent practice'],
        matchDescription: false,
        excludeIfAlsoTagged: ['inpatient', 'hospital'],
    },
    hospital: {
        keywords: ['hospital', 'medical center', 'health system'],
        matchDescription: false,
        excludeIfAlsoTagged: ['outpatient', 'private-practice'],
    },
    'community-health': {
        keywords: ['FQHC', 'federally qualified health center', 'community health center'],
        matchDescription: true, // FQHC etc. are unambiguous in description
    },
    va: {
        keywords: ['VA medical center', 'veterans affairs', 'department of veterans', 'VHA'],
        matchDescription: true,
    },
    correctional: {
        keywords: ['correctional', 'corrections', 'prison', 'forensic', 'jail', 'detention', 'incarcerat'],
        matchDescription: false,
    },

    // ── Modality (job can simultaneously be remote AND telehealth) ──
    remote: {
        keywords: ['remote', 'work from home', 'WFH'],
        structural: (j) => j.isRemote === true,
    },
    telehealth: {
        keywords: ['telehealth', 'telemedicine', 'telepsychiatry', 'telepsych', 'virtual care'],
        matchDescription: false,
    },
    travel: {
        keywords: ['travel position', 'travel assignment'],
        matchDescription: false,
    },

    // ── Job type (mutually exclusive in spirit) ──
    'full-time': {
        keywords: ['full-time', 'full time'],
        structural: (j) =>
            (j.jobType || '').toLowerCase().includes('full'),
    },
    'part-time': {
        keywords: ['part-time', 'part time'],
        structural: (j) =>
            (j.jobType || '').toLowerCase().includes('part'),
        excludeIfAlsoTagged: ['full-time'],
    },
    contract: {
        keywords: ['contract position', 'temp-to-perm', 'temporary assignment'],
        structural: (j) =>
            (j.jobType || '').toLowerCase().includes('contract'),
    },
    'per-diem': {
        keywords: ['per diem', 'per-diem', 'PRN'],
        structural: (j) =>
            (j.jobType || '').toLowerCase().includes('per diem'),
    },
    'locum-tenens': {
        keywords: ['locum tenens', 'locums'],
    },
    '1099': {
        keywords: ['1099', 'independent contractor', 'IC position'],
        matchDescription: true,
    },

    // ── Specialty / population ──
    addiction: {
        keywords: ['addiction medicine', 'addiction psychiatr', 'MAT provider', 'suboxone prescriber', 'buprenorphine'],
        matchDescription: false,
    },
    'substance-abuse': {
        keywords: ['substance abuse', 'substance use', 'SUD', 'dual diagnosis', 'detox'],
        matchDescription: false,
        excludeIfAlsoTagged: ['addiction'],
    },
    'child-adolescent': {
        keywords: ['child and adolescent', 'child/adolescent', 'child & adolescent', 'pediatric psych', 'pediatric mental', 'CAPMHNP', 'adolescent psychiatr'],
        matchDescription: false,
    },
    geriatric: {
        keywords: ['geriatric', 'geropsych', 'elderly', 'senior living', 'nursing home'],
        matchDescription: false,
    },
    'behavioral-health': {
        keywords: ['integrated behavioral health'],
        matchDescription: false,
        // Exclude "behavioral-health" from generic mental-health roles —
        // only tag when explicitly integrated. Otherwise this category
        // catches every PMHNP job and reintroduces the duplication.
    },
    crisis: {
        keywords: ['crisis stabilization', 'emergency psych', 'urgent psych'],
        matchDescription: false,
    },
    lgbtq: {
        keywords: ['LGBTQ', 'transgender', 'gender-affirming', 'gender affirming', 'gender identity', 'affirming care'],
        matchDescription: true,
    },
    veterans: {
        keywords: ['veterans', 'PTSD', 'military mental health'],
        matchDescription: true,
        excludeIfAlsoTagged: ['va'], // VA is more specific than generic "veterans"
    },

    // ── Experience tier (mutually exclusive) ──
    'new-grad': {
        keywords: ['new grad', 'new graduate', 'recent graduate', 'fellowship', 'residency'],
        matchDescription: false,
    },
    'entry-level': {
        keywords: ['entry level', 'entry-level'],
        matchDescription: false,
        excludeIfAlsoTagged: ['new-grad'], // new-grad is the canonical tag; entry-level is its alias
    },
    senior: {
        keywords: ['senior PMHNP', 'senior NP', 'senior nurse practitioner', 'lead PMHNP', 'clinical lead', 'clinical leader', 'PMHNP supervisor', 'NP supervisor', 'nurse practitioner supervisor', 'medical director', 'clinical director', 'program director', 'chief of mental health', 'clinic director', 'director of psych'],
        matchDescription: false,
    },
    'mid-career': {
        keywords: ['experienced', 'lead clinician'],
        matchDescription: false,
        excludeIfAlsoTagged: ['senior', 'new-grad'], // mid-career is the leftover after senior + new-grad
    },
};

function matchesKeyword(haystack: string, keyword: string): boolean {
    return haystack.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * Classify a job into the set of category tags it qualifies for.
 *
 * Determinism: same input → same output. Order of returned tags follows
 * CANONICAL_CATEGORY_SLUGS for stability across runs (the array is
 * stored in Postgres `text[]` and we don't want spurious diffs).
 *
 * Mutual exclusion is applied in slug order — if a category lists
 * `excludeIfAlsoTagged: ['inpatient']`, the rule fires only after the
 * `inpatient` rule has already been evaluated.
 */
export function classifyJobTags(job: ClassifiableJob): CategoryTag[] {
    const title = job.title || '';
    const description = job.description || job.descriptionSummary || '';
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();

    const tagged = new Set<CategoryTag>();

    // First pass: structural + keyword rules, no exclusion logic yet.
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
        const rule = RULES[slug];
        if (!rule) continue;

        // Structural fast path — overrides keyword scan when truthy.
        if (rule.structural?.(job)) {
            tagged.add(slug);
            continue;
        }

        const matchDesc = rule.matchDescription !== false;
        const haystack = matchDesc ? `${titleLower} ${descLower}` : titleLower;
        for (const kw of rule.keywords) {
            if (matchesKeyword(haystack, kw)) {
                tagged.add(slug);
                break;
            }
        }
    }

    // Second pass: apply mutual-exclusion rules. Iterate in slug order so
    // earlier-priority categories win.
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
        if (!tagged.has(slug)) continue;
        const rule = RULES[slug];
        if (!rule?.excludeIfAlsoTagged) continue;
        if (rule.excludeIfAlsoTagged.some((other) => tagged.has(other))) {
            tagged.delete(slug);
        }
    }

    // Return tags in canonical order for stable storage.
    return CANONICAL_CATEGORY_SLUGS.filter((s) => tagged.has(s));
}

/**
 * Build a Prisma WHERE fragment that matches via the legacy keyword OR
 * matchers. Used as the backward-compat fallback for buildWhere callers
 * during the deploy → backfill window: rows with empty `categoryTags`
 * (i.e. not yet backfilled) still render correctly.
 *
 * Once `scripts/backfill-category-tags.ts --apply` has populated every
 * row, this fallback is dead code and can be removed in a follow-up PR.
 *
 * Note: the classifier's `excludeIfAlsoTagged` mutual-exclusion isn't
 * replicable at query time — pre-backfill pages may slightly over-match
 * across taxonomies, but that's strictly better than rendering empty
 * during the gap. Post-backfill, the precomputed tags enforce exclusion.
 */
function legacyKeywordOr(tag: CategoryTag): Record<string, unknown>[] {
    const rule = RULES[tag];
    if (!rule) return [];
    const matchDesc = rule.matchDescription !== false;
    return rule.keywords.flatMap((kw) =>
        matchDesc
            ? [
                { title: { contains: kw, mode: 'insensitive' } },
                { description: { contains: kw, mode: 'insensitive' } },
            ]
            : [{ title: { contains: kw, mode: 'insensitive' } }],
    );
}

/**
 * Returns a Prisma WHERE fragment to spread into a buildWhere result.
 * The fragment matches:
 *   • rows with `categoryTags has '<tag>'` (post-backfill, primary path), OR
 *   • rows with empty `categoryTags` AND any legacy keyword/structural match
 *     (pre-backfill fallback so pages don't render empty during the deploy
 *      window).
 *
 * Usage:
 *   buildWhere: (stateName) => ({
 *     isPublished: true,
 *     state: { equals: stateName, mode: 'insensitive' },
 *     ...withTagFallback('remote'),
 *   })
 */
export function withTagFallback(tag: CategoryTag): Record<string, unknown> {
    const rule = RULES[tag];
    const legacyConditions: Record<string, unknown>[] = [];
    // Legacy keyword matchers (title + optionally description).
    const kw = legacyKeywordOr(tag);
    if (kw.length > 0) legacyConditions.push({ OR: kw });
    // Structural fallbacks for tags whose primary classifier signal is a
    // structured field (e.g. remote → isRemote=true; full-time → jobType
    // contains 'Full'). These are the only legacy conditions we can express
    // in a Prisma where without re-running the classifier per row.
    if (tag === 'remote') legacyConditions.push({ isRemote: true });
    if (tag === 'full-time') legacyConditions.push({ jobType: { contains: 'Full', mode: 'insensitive' } });
    if (tag === 'part-time') legacyConditions.push({ jobType: { contains: 'Part', mode: 'insensitive' } });
    if (tag === 'contract') legacyConditions.push({ jobType: { contains: 'Contract', mode: 'insensitive' } });
    if (tag === 'per-diem') legacyConditions.push({ jobType: { contains: 'Per Diem', mode: 'insensitive' } });

    // Suppress unused warning for `rule` if classifier rule is missing for
    // an exotic tag — we still emit a tag-only path so post-backfill works.
    void rule;

    return {
        OR: [
            { categoryTags: { has: tag } },
            ...(legacyConditions.length > 0
                ? [{
                    AND: [
                        { categoryTags: { isEmpty: true } },
                        ...(legacyConditions.length === 1
                            ? legacyConditions
                            : [{ OR: legacyConditions }]),
                    ],
                }]
                : []),
        ],
    };
}
