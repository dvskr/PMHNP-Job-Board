/**
 * Pure selector — given candidate eligibility + ranked vector hits + per-job
 * metadata, return the final top-N picks with tier classification.
 *
 * Lives separately from both the Inngest cron and the local CLI runner so
 * they can never drift. ANY change to the recommendation policy lives here.
 *
 * Policy (in order):
 *   1. Health filter — drop jobs likely to be dead aggregator links.
 *   2. License-state filter — only jobs in the candidate's licensed states
 *      OR remote roles. Empty license_states = no filter (sparse profile).
 *   3. Freshness — drop jobs older than `maxAgeDays` (default 30).
 *   4. External excluded — recommendations only surface easy_apply +
 *      direct_apply. The browse + search experiences keep externals; this
 *      feed is curated to one-click-to-employer paths only.
 *   5. Employer-posting pinning — at least `EMPLOYER_PIN_POLICY.pinned`
 *      slots reserved for `sourceType='employer'` rows when available.
 *      Rotation seed shuffles which postings are pinned across days/visits.
 *   6. Score-fill — remaining slots filled by boosted-similarity score.
 *   7. Diversity cap — no employer takes more than ⌈totalSlots / 3⌉ slots.
 *   8. Display order — easy_apply pinned first, then direct_apply.
 */

import {
    classifyJob,
    TIER_BOOST,
    type ClassifiableJob,
    type JobTier,
} from './job-classifier';
import {
    EMPLOYER_PIN_POLICY,
    isEmployerPosting,
} from './recommendation-policy';
import { jitterMultiplier } from '@/lib/utils/rotation';

export interface VectorHit { jobId: string; similarity: number }

export interface JobMeta extends ClassifiableJob {
    id: string;
    employer: string;
    stateCode: string | null;
    isRemote: boolean;
    /** Original posting date (preferred) — when the role first went live anywhere. */
    originalPostedAt?: Date | null;
    /** When we ingested it — fallback when originalPostedAt is null. */
    createdAt?: Date | null;
}

export interface SelectorOptions {
    /** 2-letter codes the candidate is licensed in. Empty = no filter. */
    licensedStates?: ReadonlyArray<string>;
    /** Override the default policy (e.g. shrink totalSlots for tests). */
    policy?: typeof EMPLOYER_PIN_POLICY;
    /** Already-recommended job ids to exclude (dedupe across batches). */
    excludeJobIds?: ReadonlySet<string>;
    /**
     * Drop external (aggregator-bounce) jobs entirely. Default true — recs
     * only surface easy_apply + direct_apply because external listings send
     * candidates through aggregator UIs and often have stale links. Browse
     * + search still surface externals; recs are intentionally curated.
     */
    excludeExternal?: boolean;
    /**
     * Max job age in days. Uses originalPostedAt when available, else
     * createdAt. Default 30 — recs should feel current; older roles are
     * more likely filled and have already shown up in earlier feeds.
     */
    maxAgeDays?: number;
    /**
     * Click-feedback signal — employers the candidate has clicked through to
     * from prior recommendation batches. Jobs from these employers get a
     * small ranking boost (1.10×) so the next batch reflects their stated
     * interest. Empty = no boost.
     */
    clickedEmployers?: ReadonlySet<string>;
    /**
     * Stable rotation seed for picking which employer postings get pinned
     * today. Same seed ⇒ same picks; different seed ⇒ different picks.
     * The cron passes `${supabaseId}-${YYYY-MM-DD}` to rotate per-candidate
     * per-day. Empty string = no rotation (top-N employer postings by score).
     */
    rotationSeed?: string;
}

export interface PickedRec {
    jobId: string;
    /** Original cosine similarity (0..1) — what the UI surfaces. */
    similarity: number;
    /** Conversion tier. Persisted for badge rendering. */
    tier: JobTier;
}

interface RankedCandidate extends VectorHit {
    employer: string;
    tier: JobTier;
    isEmployer: boolean;
    boostedScore: number;
}

/** Apply the recommendation policy and return the final picks in display order. */
export function selectRecommendations(
    hits: ReadonlyArray<VectorHit>,
    metaByJob: ReadonlyMap<string, JobMeta>,
    options: SelectorOptions = {},
): PickedRec[] {
    const policy = options.policy ?? EMPLOYER_PIN_POLICY;
    const licensedStates = new Set(
        (options.licensedStates ?? []).map((s) => s.toUpperCase()),
    );
    const exclude = options.excludeJobIds ?? new Set<string>();
    // Default to TRUE: recommendations are intentionally curated to one-click
    // paths only. Browse + search still show externals; recs do not.
    const excludeExternal = options.excludeExternal !== false;
    const maxAgeDays = options.maxAgeDays ?? 30;
    const freshSinceMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const clickedEmployers = options.clickedEmployers ?? new Set<string>();
    const rotationSeed = options.rotationSeed ?? '';
    /**
     * Per-employer click-feedback multiplier. Modest by design — clicks are
     * a noisy signal at the start (a candidate might click a wrong-state
     * job out of curiosity) so we lean toward gently amplifying preference,
     * not letting one click dominate the slate.
     */
    const CLICK_BOOST = 1.10;

    // ── 1+2+3+4. Filter (health + license + freshness + tier + dedupe) and classify ──
    const candidates: RankedCandidate[] = [];
    for (const hit of hits) {
        if (exclude.has(hit.jobId)) continue;
        const meta = metaByJob.get(hit.jobId);
        if (!meta) continue;

        const { tier, isHealthy } = classifyJob(meta);
        if (!isHealthy) continue;
        if (excludeExternal && tier === 'external') continue;

        // Freshness — prefer originalPostedAt (true posting age) over
        // createdAt (when WE ingested it). When both are missing, allow
        // through rather than silently drop the row.
        const postedAt = meta.originalPostedAt ?? meta.createdAt ?? null;
        if (postedAt && postedAt.getTime() < freshSinceMs) continue;

        if (licensedStates.size > 0) {
            const inLicensedState = !!meta.stateCode && licensedStates.has(meta.stateCode.toUpperCase());
            if (!meta.isRemote && !inLicensedState) continue;
        }

        // Composite score: similarity × tier multiplier × click-history boost
        // (when the employer matches one the candidate already clicked from).
        const tierMult = TIER_BOOST[tier];
        const clickMult = clickedEmployers.has(meta.employer) ? CLICK_BOOST : 1;
        candidates.push({
            ...hit,
            employer: meta.employer,
            tier,
            isEmployer: isEmployerPosting(meta),
            boostedScore: hit.similarity * tierMult * clickMult,
        });
    }

    if (candidates.length === 0) return [];

    // Sort once by boosted score so every downstream loop walks best-first.
    candidates.sort((a, b) => b.boostedScore - a.boostedScore);

    // ── 5. Employer-posting pinning ──────────────────────────────────────
    // Pin up to `policy.pinned` employer postings before the score-fill so
    // employer rows always have visibility — even when the candidate's vector
    // match would otherwise bury them. Rotation seed reorders near-ties so
    // different employer postings surface across days.
    const employerCount = new Map<string, number>();
    const maxPerEmployer = Math.max(1, Math.ceil(policy.totalSlots / 3));
    const taken = new Set<string>();
    const picked: PickedRec[] = [];

    function tryTake(c: RankedCandidate): boolean {
        if (taken.has(c.jobId)) return false;
        if ((employerCount.get(c.employer) ?? 0) >= maxPerEmployer) return false;
        picked.push({ jobId: c.jobId, similarity: c.similarity, tier: c.tier });
        employerCount.set(c.employer, (employerCount.get(c.employer) ?? 0) + 1);
        taken.add(c.jobId);
        return true;
    }

    if (policy.pinned > 0) {
        const employerPool = candidates.filter((c) => c.isEmployer);
        // Apply rotation jitter only when a seed is provided — preserves
        // deterministic test fixtures that don't pass a seed.
        const employerSorted = rotationSeed
            ? [...employerPool].sort((a, b) => {
                  const aJ = jitterMultiplier(rotationSeed + a.jobId);
                  const bJ = jitterMultiplier(rotationSeed + b.jobId);
                  return b.boostedScore * bJ - a.boostedScore * aJ;
              })
            : employerPool;

        let pinnedTaken = 0;
        for (const c of employerSorted) {
            if (pinnedTaken >= policy.pinned) break;
            if (tryTake(c)) pinnedTaken += 1;
        }
    }

    // ── 6. Fill remaining slots from any non-external candidate by score ──
    for (const c of candidates) {
        if (picked.length >= policy.totalSlots) break;
        tryTake(c);
    }

    // ── 8. Final display order: easy_apply pinned first, then direct, then external ──
    // Within a tier, preserve the boosted-score order from above.
    const tierRank: Record<JobTier, number> = { easy_apply: 0, direct_apply: 1, external: 2 };
    picked.sort((a, b) => tierRank[a.tier] - tierRank[b.tier]);

    return picked;
}
