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
 *   3. Quota-based selection — guarantee Easy Apply + Direct Apply slots
 *      first (when available), then fill the rest from boosted-similarity
 *      order. This is the platform's revenue moat: employer + direct-apply
 *      jobs always get above-the-fold real estate even when pure vector
 *      would push them below external scrapes.
 *   4. Diversity cap — no employer takes more than ⌈totalSlots / 3⌉ slots.
 *   5. Boost the SCORE used for tie-break by tier (so within a tier, the
 *      vector-best wins; across tiers, easy_apply > direct_apply > external).
 */

import {
    classifyJob,
    TIER_BOOST,
    RECOMMENDATION_QUOTA,
    type ClassifiableJob,
    type JobTier,
} from './job-classifier';

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
    /** Override the default quota. */
    quota?: typeof RECOMMENDATION_QUOTA;
    /** Already-recommended job ids to exclude (dedupe across batches). */
    excludeJobIds?: ReadonlySet<string>;
    /**
     * Drop external (aggregator-bounce) jobs entirely. Default true — recs
     * only surface Easy Apply + Direct Apply because external listings send
     * candidates through multiple aggregator pages and often have stale links.
     * Browse + search still surface external listings; the RECOMMENDATION
     * feed is intentionally curated to high-conversion paths only.
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
    boostedScore: number;
}

/** Apply the recommendation policy and return the final picks in display order. */
export function selectRecommendations(
    hits: ReadonlyArray<VectorHit>,
    metaByJob: ReadonlyMap<string, JobMeta>,
    options: SelectorOptions = {},
): PickedRec[] {
    const quota = options.quota ?? RECOMMENDATION_QUOTA;
    const licensedStates = new Set(
        (options.licensedStates ?? []).map((s) => s.toUpperCase()),
    );
    const exclude = options.excludeJobIds ?? new Set<string>();
    // Default to TRUE: recommendations are intentionally curated to
    // platform-revenue paths. The browse + search experiences keep showing
    // external listings; recs do not.
    const excludeExternal = options.excludeExternal !== false;
    const maxAgeDays = options.maxAgeDays ?? 30;
    const freshSinceMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const clickedEmployers = options.clickedEmployers ?? new Set<string>();
    /**
     * Per-employer click-feedback multiplier. Modest by design — clicks are
     * a noisy signal at the start (a candidate might click a wrong-state
     * job out of curiosity) so we lean toward gently amplifying preference,
     * not letting one click dominate the slate.
     */
    const CLICK_BOOST = 1.10;

    // ── 1+2. Filter (health + license + freshness + tier + dedupe) and classify ──
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
            boostedScore: hit.similarity * tierMult * clickMult,
        });
    }

    if (candidates.length === 0) return [];

    // Sort once by boosted score so every downstream loop walks best-first.
    candidates.sort((a, b) => b.boostedScore - a.boostedScore);

    // ── 3. Quota fill ───────────────────────────────────────────────────
    const employerCount = new Map<string, number>();
    const maxPerEmployer = Math.max(1, Math.ceil(quota.totalSlots / 3));
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

    // 3a. Reserved Easy Apply slots — fill first.
    let easyTaken = 0;
    for (const c of candidates) {
        if (easyTaken >= quota.easyApplyReserved) break;
        if (c.tier !== 'easy_apply') continue;
        if (tryTake(c)) easyTaken += 1;
    }

    // 3b. Reserved Direct Apply slots.
    let directTaken = 0;
    for (const c of candidates) {
        if (directTaken >= quota.directApplyReserved) break;
        if (c.tier !== 'direct_apply') continue;
        if (tryTake(c)) directTaken += 1;
    }

    // 3c. Fill remaining slots from any tier in boosted-score order.
    for (const c of candidates) {
        if (picked.length >= quota.totalSlots) break;
        tryTake(c);
    }

    // ── 4. Final display order: Easy Apply pinned first, then Direct, then External ──
    // Within a tier, preserve the boosted-score order from above.
    const tierRank: Record<JobTier, number> = { easy_apply: 0, direct_apply: 1, external: 2 };
    picked.sort((a, b) => tierRank[a.tier] - tierRank[b.tier]);

    return picked;
}
