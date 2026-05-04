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
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { semanticJobSearch, platformRevenueJobsWithSimilarity } from '@/lib/ai/vector-search';
import { selectRecommendations, type JobMeta } from '@/lib/ai/recommendation-selector';
import { RECOMMENDATION_QUOTA } from '@/lib/ai/job-classifier';

const DEDUPE_WINDOW_DAYS = 30;
const VECTOR_OVERFETCH = 80; // headroom so quota + filters have choices

function parseLicenseStates(raw: string | null): string[] {
    if (!raw) return [];
    return raw.split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{2}$/.test(s));
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
        const embeddings = await step.run('list-candidate-embeddings', async () => {
            // role='job_seeker' (NOT 'candidate' — that's the architecture-doc
            // term, not the actual DB enum). license_states comes alongside
            // for the eligibility filter.
            return prisma.$queryRawUnsafe<Array<{ supabase_id: string; embedding_text: string; license_states: string | null }>>(`
                SELECT ce.supabase_id, ce.embedding::text AS embedding_text, up.license_states
                FROM candidate_embeddings ce
                JOIN user_profiles up ON up.supabase_id = ce.supabase_id
                WHERE up.profile_visible = true
                  AND up.deleted_at IS NULL
                  AND up.role = 'job_seeker'
                LIMIT 5000;
            `);
        });

        if (embeddings.length === 0) {
            logger.info('recommendations.daily: no eligible candidates');
            return { batches: 0 };
        }

        const batchId = `rec-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
        const sinceDedupe = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        let written = 0;
        const tierTally: Record<string, number> = { easy_apply: 0, direct_apply: 0, external: 0 };

        for (const row of embeddings) {
            await step.run(`recommend-${row.supabase_id}`, async () => {
                const vec = row.embedding_text
                    .replace(/^\[|\]$/g, '')
                    .split(',')
                    .map((n) => Number(n.trim()))
                    .filter((n) => Number.isFinite(n));
                if (vec.length === 0) return;

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
                if (hits.length === 0) return;

                const recentlyRecommended = await prisma.candidateRecommendation.findMany({
                    where: { supabaseId: row.supabase_id, createdAt: { gte: sinceDedupe } },
                    select: { jobId: true },
                });
                const exclude = new Set(recentlyRecommended.map((r) => r.jobId));

                // Click-feedback signal — employers the candidate clicked
                // through to in prior batches get a ranking boost so
                // demonstrated interest compounds.
                const clicked = await prisma.candidateRecommendation.findMany({
                    where: { supabaseId: row.supabase_id, clickedAt: { not: null } },
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

                const picked = selectRecommendations(hits, metaByJob, {
                    licensedStates: parseLicenseStates(row.license_states),
                    excludeJobIds: exclude,
                    clickedEmployers,
                    quota: RECOMMENDATION_QUOTA,
                });
                if (picked.length === 0) return;

                await prisma.$transaction(
                    picked.map((rec, i) =>
                        prisma.candidateRecommendation.create({
                            data: {
                                supabaseId: row.supabase_id,
                                jobId: rec.jobId,
                                batchId,
                                rank: i + 1,
                                similarity: rec.similarity,
                                tier: rec.tier,
                            },
                        }),
                    ),
                );
                for (const p of picked) tierTally[p.tier] += 1;
                written += picked.length;
            });
        }

        logger.info('recommendations.daily complete', { batchId, candidates: embeddings.length, written, tierTally });
        return { batchId, candidates: embeddings.length, written, tierTally };
    },
);

export const recommendationFunctions = [recommendationsDaily] as const;
