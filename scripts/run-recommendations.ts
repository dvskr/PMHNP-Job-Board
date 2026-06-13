#!/usr/bin/env node
// Load env BEFORE any import that touches process.env.
// eslint-disable-next-line import/order
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig();

/**
 * One-off recommendations runner — duplicates the per-candidate loop of
 * `recommendationsDaily` (lib/inngest/functions/recommendations.ts) but
 * without the Inngest step wrapper, so it can be triggered from the CLI for
 * local-dev seeding without needing an Inngest local server.
 *
 * Selection policy lives in lib/ai/recommendation-selector.ts and is shared
 * with the cron — they cannot drift.
 *
 * Usage:
 *   npm run recs:run            # generate batches for every eligible candidate
 *   npm run recs:run -- --dry   # plan without writing
 */

import { prisma } from '@/lib/prisma';
import { semanticJobSearch, platformRevenueJobsWithSimilarity } from '@/lib/ai/vector-search';
import { selectRecommendations, type JobMeta } from '@/lib/ai/recommendation-selector';

const DEDUPE_WINDOW_DAYS = 30;
const VECTOR_OVERFETCH = 80; // headroom for quota + filters to choose from

function parseLicenseStates(raw: string | null): string[] {
    if (!raw) return [];
    return raw.split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{2}$/.test(s));
}

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry');

    const embeddings = await prisma.$queryRawUnsafe<Array<{ supabase_id: string; embedding_text: string; license_states: string | null }>>(`
        SELECT ce.supabase_id, ce.embedding::text AS embedding_text, up.license_states
        FROM candidate_embeddings ce
        JOIN user_profiles up ON up.supabase_id = ce.supabase_id
        WHERE up.profile_visible = true
          AND up.deleted_at IS NULL
          AND up.role = 'job_seeker'
        LIMIT 5000;
    `);

    if (embeddings.length === 0) {
        console.log('[recs] no eligible candidates with embeddings');
        return;
    }

    const batchId = `rec-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
    const sinceDedupe = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    console.log(`[recs] batchId=${batchId} candidates=${embeddings.length} ${dryRun ? '(DRY RUN)' : ''}`);
    let totalWritten = 0;
    let candidatesWithRecs = 0;
    const tierTally: Record<string, number> = { easy_apply: 0, direct_apply: 0, external: 0 };

    for (const row of embeddings) {
        const vec = row.embedding_text
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map((n) => Number(n.trim()))
            .filter((n) => Number.isFinite(n));
        if (vec.length === 0) continue;

        // Vector top-K plus the FULL platform-revenue pool. The pool
        // guarantees employer + Easy Apply jobs always reach the selector
        // even when vector rank would otherwise bury them under aggregator
        // scrapes. Dedupe by jobId — pool entries override top-K entries
        // (but they have the same similarity score so it doesn't matter).
        const [topK, platformPool] = await Promise.all([
            semanticJobSearch(vec, { k: VECTOR_OVERFETCH }),
            platformRevenueJobsWithSimilarity(vec),
        ]);
        const hitsByJobId = new Map<string, { jobId: string; similarity: number }>();
        for (const h of topK) hitsByJobId.set(h.jobId, h);
        for (const h of platformPool) hitsByJobId.set(h.jobId, h);
        const hits = [...hitsByJobId.values()];
        if (hits.length === 0) continue;

        const recentlyRecommended = await prisma.candidateRecommendation.findMany({
            where: { supabaseId: row.supabase_id, createdAt: { gte: sinceDedupe } },
            select: { jobId: true },
        });
        const exclude = new Set(recentlyRecommended.map((r) => r.jobId));

        // Click-feedback signal — gather employers the candidate already
        // clicked through to. The selector boosts matching jobs on next run
        // so engagement compounds.
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
        });
        if (picked.length === 0) {
            console.log(`  ${row.supabase_id} — no eligible jobs (license=${row.license_states ?? 'none'}), skip`);
            continue;
        }

        if (!dryRun) {
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
        }
        for (const p of picked) tierTally[p.tier] += 1;
        candidatesWithRecs += 1;
        totalWritten += picked.length;
        if (candidatesWithRecs % 10 === 0) {
            console.log(`  …${candidatesWithRecs} candidates done, ${totalWritten} recs ${dryRun ? 'planned' : 'written'}`);
        }
    }

    console.log(`[recs] DONE — batchId=${batchId} candidatesWithRecs=${candidatesWithRecs} totalRecs=${totalWritten}`);
    console.log(`[recs] tier mix: easy_apply=${tierTally.easy_apply} direct_apply=${tierTally.direct_apply} external=${tierTally.external}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('[recs] fatal', err); process.exit(1); });
