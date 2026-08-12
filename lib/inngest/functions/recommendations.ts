/**
 * Daily personalized job recommendations — Phase 1 Sprint 1.2.
 *
 * Per-candidate flow:
 *   1. Vector search → top-N jobs from candidate_embeddings.
 *   2. Filter out already-recommended-recently (30-day dedupe window).
 *   3. Hand off to `selectRecommendations()` (lib/ai/recommendation-selector)
 *      which applies:
 *        - Health filter   — drop likely-dead aggregator links.
 *        - License filter  — only jobs in candidate's licensed states OR remote.
 *        - Quota selection — guarantees Easy Apply + Direct Apply slots
 *                            so platform-revenue jobs always have visibility,
 *                            even when external scrapes score higher.
 *        - Diversity cap   — no employer hogs > ⌈totalSlots/3⌉ slots.
 *        - Tier-pinned ordering for display.
 *   4. Persist top-N as a new batch with tier per row.
 *
 * Selection policy is intentionally extracted so this cron and the local CLI
 * runner (scripts/run-recommendations.ts) cannot drift — both call the same
 * pure function.
 *
 * Cost: vector + DB only, no LLM calls. ~free at any scale we'll hit pre-PMF.
 *
 * ── STEP-OUTPUT DISCIPLINE (2026-08-13) ──────────────────────────────────
 * Inngest persists EVERY step.run() return value as durable run state and
 * rejects a step whose serialized output exceeds the per-step size limit,
 * failing the run with "step output size is greater than the limit".
 *
 * This function used to open with a `list-candidate-embeddings` step that
 * returned one row per candidate carrying `embedding::text`. A 1536-dimension
 * pgvector rendered as text measures roughly 19 KB, so that step's output grew
 * linearly with the eligible candidate base: a couple of hundred rows is
 * already several MB. Once the base crossed the cap the step stopped being
 * accepted at all, every attempt failed with "step output size is greater than
 * the limit", and the daily pipeline produced nothing until this fix.
 *
 * Three rules now hold here, and tests/lib/inngest-step-output-size.test.ts
 * locks them against regression:
 *
 *   1. Steps return ids, counts and compact scalars. Never an embedding
 *      vector, never a full row collection.
 *   2. Bulk data is re-fetched INSIDE the step that consumes it. The vector
 *      for candidate X is loaded inside `recommend-X`, used, and dropped —
 *      it never crosses a boundary.
 *   3. Aggregates are folded from the returned step VALUES. Inngest replays
 *      the function body on every request, so a counter mutated inside a
 *      step closure is silently reset; only memoized return values survive.
 *      (Same reason `batchId` is now minted inside a step: as a plain
 *      top-level `crypto.randomUUID()` it was re-rolled on every replay, so a
 *      single run scattered its rows across several batch ids instead of one.)
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { semanticJobSearch, platformRevenueJobsWithSimilarity } from '@/lib/ai/vector-search';
import { selectRecommendations, type JobMeta } from '@/lib/ai/recommendation-selector';
import type { JobTier } from '@/lib/ai/job-classifier';
import { isoDateUtc } from '@/lib/utils/rotation';

const DEDUPE_WINDOW_DAYS = 30;
const VECTOR_OVERFETCH = 80; // headroom so quota + filters have choices
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard ceiling on per-candidate steps in one run. Each candidate costs one
 * step, and Inngest caps the number of steps a single run may take. 750 keeps
 * us clear of that ceiling with room for the two coordinating steps.
 *
 * The candidate list is ordered least-recently-recommended first, so if the
 * cap ever binds it rotates across days rather than permanently starving
 * whoever sorts last. A warning is logged whenever it binds.
 */
const MAX_CANDIDATES_PER_RUN = 750;

const TIER_KEYS = ['easy_apply', 'direct_apply', 'external'] as const;

/** Compact per-candidate step result. ~75 bytes serialized. */
export interface CandidateTally {
    /** Recommendation rows persisted for this candidate. 0 when skipped. */
    written: number;
    /** Per-tier breakdown of those rows. */
    tiers: Record<JobTier, number>;
}

export function emptyTally(): CandidateTally {
    return { written: 0, tiers: { easy_apply: 0, direct_apply: 0, external: 0 } };
}

/**
 * Sum per-candidate tallies into one run total.
 *
 * Pure and total: unknown/missing tier keys are ignored rather than throwing,
 * because these values come back from Inngest's durable store and may have
 * been written by an older deploy of this function mid-run.
 */
export function foldTallies(tallies: ReadonlyArray<CandidateTally>): CandidateTally {
    const total = emptyTally();
    for (const t of tallies) {
        if (!t) continue;
        total.written += Number.isFinite(t.written) ? t.written : 0;
        for (const key of TIER_KEYS) {
            const n = t.tiers?.[key];
            if (Number.isFinite(n)) total.tiers[key] += n as number;
        }
    }
    return total;
}

/** Parse the comma-separated `license_states` column into 2-letter codes. */
export function parseLicenseStates(raw: string | null): string[] {
    if (!raw) return [];
    return raw.split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{2}$/.test(s));
}

/**
 * Parse a pgvector `embedding::text` literal (`[0.01,-0.02,...]`) into floats.
 *
 * Kept as a pure function so the parse is unit-testable without a DB, and so
 * the ~19 KB string it consumes stays local to whichever step called it.
 */
export function parseVectorLiteral(text: string | null | undefined): number[] {
    if (!text) return [];
    return text
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n));
}

interface CandidateVectorRow {
    embedding_text: string;
    license_states: string | null;
}

export const recommendationsDaily = inngest.createFunction(
    {
        id: 'recommendations-daily',
        name: 'Daily personalized job recommendations',
        triggers: [{ cron: 'TZ=UTC 0 9 * * *' }], // 09:00 UTC = ~1am Pacific.
        retries: 2,
        concurrency: 1,
    },
    async ({ step }) => {
        // Batch identity is non-deterministic (random uuid + wall clock), so it
        // must be minted inside a step. Outside one it is re-rolled on every
        // replay and a single run scatters its rows across several batch ids,
        // which the dashboard reads as separate batches.
        const batch = await step.run('open-batch', async () => ({
            batchId: `rec-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`,
            startedAtMs: Date.now(),
        }));

        // IDS ONLY. The embedding vector deliberately does not appear in this
        // projection — see the step-output discipline note in the docblock.
        const roster = await step.run('list-candidate-ids', async () => {
            // role='job_seeker' (NOT 'candidate' — that's the architecture-doc
            // term, not the actual DB enum).
            //
            // Ordered least-recently-recommended first so MAX_CANDIDATES_PER_RUN
            // rotates fairly if it ever binds. supabase_id breaks ties so the
            // ordering is deterministic across replays.
            const rows = await prisma.$queryRawUnsafe<Array<{ supabase_id: string }>>(`
                SELECT ce.supabase_id
                FROM candidate_embeddings ce
                JOIN user_profiles up ON up.supabase_id = ce.supabase_id
                LEFT JOIN (
                    SELECT supabase_id, MAX(created_at) AS last_rec_at
                    FROM candidate_recommendations
                    GROUP BY supabase_id
                ) lr ON lr.supabase_id = ce.supabase_id
                WHERE up.profile_visible = true
                  AND up.deleted_at IS NULL
                  AND up.role = 'job_seeker'
                ORDER BY lr.last_rec_at ASC NULLS FIRST, ce.supabase_id ASC
                LIMIT ${MAX_CANDIDATES_PER_RUN};
            `);
            const eligible = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`
                SELECT COUNT(*)::bigint AS n
                FROM candidate_embeddings ce
                JOIN user_profiles up ON up.supabase_id = ce.supabase_id
                WHERE up.profile_visible = true
                  AND up.deleted_at IS NULL
                  AND up.role = 'job_seeker';
            `);
            return {
                ids: rows.map((r) => r.supabase_id),
                eligibleTotal: Number(eligible[0]?.n ?? 0),
            };
        });

        if (roster.ids.length === 0) {
            logger.info('recommendations.daily: no eligible candidates');
            return { batchId: batch.batchId, candidates: 0, written: 0, tierTally: emptyTally().tiers };
        }
        if (roster.eligibleTotal > roster.ids.length) {
            logger.warn('recommendations.daily: candidate roster truncated by per-run cap', {
                eligibleTotal: roster.eligibleTotal,
                processing: roster.ids.length,
                cap: MAX_CANDIDATES_PER_RUN,
            });
        }

        // Derived from the memoized batch timestamp, not from a fresh
        // Date.now(): replays must see the same dedupe window and the same
        // rotation day even if the run straddles UTC midnight.
        const sinceDedupe = new Date(batch.startedAtMs - DEDUPE_WINDOW_DAYS * DAY_MS);
        const rotationDay = isoDateUtc(new Date(batch.startedAtMs));

        const tallies: CandidateTally[] = [];

        for (const supabaseId of roster.ids) {
            // One step per candidate keeps the retry boundary meaningful: a
            // candidate whose vector search times out is retried alone.
            // Returns a 4-number tally, never the rows it wrote.
            const tally = await step.run(`recommend-${supabaseId}`, async (): Promise<CandidateTally> => {
                // IDEMPOTENCY. Inngest retries a step whose result never made
                // it back (network blip, cold start) even though its body ran
                // to completion. Without this clear, the retry would find its
                // own rows inside the 30-day dedupe window, exclude those jobs,
                // select a DIFFERENT set, and append it to the same batch: 2N
                // rows for one candidate and two rank-1 entries in one batch.
                // Clearing this candidate's rows for this batch first makes a
                // retry produce exactly what the first attempt would have.
                //
                // The key is sound only because batchId is memoized now: it is
                // stable across replays and unique to this run, so this can
                // never touch a previous day's recommendations. Covered by the
                // [supabaseId, batchId, rank] index; a no-op on a first attempt.
                await prisma.candidateRecommendation.deleteMany({
                    where: { supabaseId, batchId: batch.batchId },
                });

                // Re-fetch the vector HERE, inside the consumer. It is used to
                // build the query and then dropped; it never crosses a step
                // boundary. Parameterized — supabaseId is bound, not spliced.
                const rows = await prisma.$queryRawUnsafe<CandidateVectorRow[]>(
                    `
                    SELECT ce.embedding::text AS embedding_text, up.license_states
                    FROM candidate_embeddings ce
                    JOIN user_profiles up ON up.supabase_id = ce.supabase_id
                    WHERE ce.supabase_id = $1
                      AND up.profile_visible = true
                      AND up.deleted_at IS NULL
                      AND up.role = 'job_seeker'
                    LIMIT 1;
                    `,
                    supabaseId,
                );
                // Profile may have been hidden or deleted between the roster
                // step and this one — treat as a clean skip.
                if (rows.length === 0) return emptyTally();

                const vec = parseVectorLiteral(rows[0].embedding_text);
                if (vec.length === 0) return emptyTally();

                // Vector top-K UNION the full platform-revenue pool. The
                // pool guarantees the small set of employer + Easy Apply
                // jobs always reach the selector, even when vector rank
                // would otherwise bury them under aggregator scrapes.
                const [topK, platformPool] = await Promise.all([
                    semanticJobSearch(vec, { k: VECTOR_OVERFETCH }),
                    platformRevenueJobsWithSimilarity(vec),
                ]);
                const hitsByJobId = new Map<string, { jobId: string; similarity: number }>();
                for (const h of topK) hitsByJobId.set(h.jobId, h);
                for (const h of platformPool) hitsByJobId.set(h.jobId, h);
                const hits = [...hitsByJobId.values()];
                if (hits.length === 0) return emptyTally();

                const recentlyRecommended = await prisma.candidateRecommendation.findMany({
                    where: { supabaseId, createdAt: { gte: sinceDedupe } },
                    select: { jobId: true },
                });
                const exclude = new Set(recentlyRecommended.map((r) => r.jobId));

                // Click-feedback signal — employers the candidate clicked
                // through to in prior batches get a ranking boost so
                // demonstrated interest compounds.
                const clicked = await prisma.candidateRecommendation.findMany({
                    where: { supabaseId, clickedAt: { not: null } },
                    select: { job: { select: { employer: true } } },
                });
                const clickedEmployers = new Set<string>(
                    clicked.map((c) => c.job.employer).filter((e): e is string => !!e),
                );

                const jobRows = await prisma.job.findMany({
                    where: { id: { in: hits.map((h) => h.jobId) } },
                    select: {
                        id: true, employer: true, sourceType: true, applyOnPlatform: true,
                        applyLink: true, stateCode: true, isRemote: true,
                        healthConsecutiveMissing: true,
                        originalPostedAt: true, createdAt: true,
                    },
                });
                const metaByJob = new Map<string, JobMeta>(jobRows.map((j) => [j.id, j]));

                // Per-candidate-per-day rotation seed — different seed each
                // day means a different subset of the live employer pool gets
                // pinned. Stable within the same run so a partial retry of
                // the cron lands on the same picks.
                const rotationSeed = `${supabaseId}-${rotationDay}`;

                const picked = selectRecommendations(hits, metaByJob, {
                    licensedStates: parseLicenseStates(rows[0].license_states),
                    excludeJobIds: exclude,
                    clickedEmployers,
                    rotationSeed,
                });
                if (picked.length === 0) return emptyTally();

                await prisma.$transaction(
                    picked.map((rec, i) =>
                        prisma.candidateRecommendation.create({
                            data: {
                                supabaseId,
                                jobId: rec.jobId,
                                batchId: batch.batchId,
                                rank: i + 1,
                                similarity: rec.similarity,
                                tier: rec.tier,
                            },
                        }),
                    ),
                );

                const tiers = emptyTally().tiers;
                for (const p of picked) tiers[p.tier] += 1;
                return { written: picked.length, tiers };
            });

            tallies.push(tally);
        }

        // Fold from the returned step values. Mutating a counter inside the
        // step closures above would silently lose every increment that
        // happened in an earlier replay.
        const totals = foldTallies(tallies);

        logger.info('recommendations.daily complete', {
            batchId: batch.batchId,
            candidates: roster.ids.length,
            eligibleTotal: roster.eligibleTotal,
            written: totals.written,
            tierTally: totals.tiers,
        });
        return {
            batchId: batch.batchId,
            candidates: roster.ids.length,
            written: totals.written,
            tierTally: totals.tiers,
        };
    },
);

export const recommendationFunctions = [recommendationsDaily] as const;
