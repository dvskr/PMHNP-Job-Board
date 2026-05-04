#!/usr/bin/env node
// Load env BEFORE any import that touches process.env (e.g. lib/prisma).
// Standalone CLI scripts can't rely on Next.js's automatic .env.local loading.
// eslint-disable-next-line import/order
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig(); // also pick up .env if .env.local didn't define everything

/**
 * Embedding backfill — Sprint 0.3.6.
 *
 * Walks every published job and every visible candidate profile, computes the
 * embedding text, and upserts the embedding via the same helpers the Inngest
 * worker uses. Idempotent — re-running only embeds rows whose content hash
 * changed since last run.
 *
 * Usage:
 *   npm run backfill:embeddings              # both jobs and candidates
 *   npm run backfill:embeddings -- --jobs    # only jobs
 *   npm run backfill:embeddings -- --candidates  # only candidates
 *   npm run backfill:embeddings -- --dry-run     # plan only
 */

import { prisma } from '@/lib/prisma';
import {
    buildJobEmbeddingText,
    buildCandidateEmbeddingText,
    upsertJobEmbedding,
    upsertCandidateEmbedding,
} from '@/lib/ai/vector-search';

interface CliArgs {
    onlyJobs: boolean;
    onlyCandidates: boolean;
    dryRun: boolean;
}

function parseArgs(): CliArgs {
    const args = new Set(process.argv.slice(2));
    return {
        onlyJobs: args.has('--jobs'),
        onlyCandidates: args.has('--candidates'),
        dryRun: args.has('--dry-run'),
    };
}

async function backfillJobs(dryRun: boolean): Promise<{ processed: number; updated: number; skipped: number }> {
    let processed = 0, updated = 0, skipped = 0;
    const PAGE = 100;
    let cursor: string | undefined;

    while (true) {
        const batch = await prisma.job.findMany({
            where: { isPublished: true, archivedAt: null },
            select: { id: true, title: true, description: true, setting: true, population: true, state: true, benefits: true },
            orderBy: { id: 'asc' },
            take: PAGE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;

        for (const job of batch) {
            processed += 1;
            const text = buildJobEmbeddingText(job);
            if (dryRun) {
                console.log(`[dry-run] job ${job.id} — would embed ${text.length} chars`);
                continue;
            }
            try {
                const result = await upsertJobEmbedding(job.id, text);
                if (result.updated) updated += 1; else skipped += 1;
            } catch (err) {
                console.error(`[backfill] job ${job.id} failed:`, err);
            }
        }

        cursor = batch[batch.length - 1].id;
        console.log(`[backfill jobs] processed=${processed} updated=${updated} skipped=${skipped}`);
        if (batch.length < PAGE) break;
    }

    return { processed, updated, skipped };
}

async function backfillCandidates(dryRun: boolean): Promise<{ processed: number; updated: number; skipped: number }> {
    let processed = 0, updated = 0, skipped = 0;
    const PAGE = 100;
    let cursor: string | undefined;

    while (true) {
        const batch = await prisma.userProfile.findMany({
            where: { profileVisible: true, deletedAt: null },
            select: {
                id: true,
                supabaseId: true,
                headline: true,
                yearsExperience: true,
                certifications: true,
                licenseStates: true,
                specialties: true,
                skills: true,
                bio: true,
            },
            orderBy: { id: 'asc' },
            take: PAGE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;

        for (const profile of batch) {
            processed += 1;
            const text = buildCandidateEmbeddingText({
                ...profile,
                yearsExperience: profile.yearsExperience ?? null,
            });
            if (text.trim().length < 20) { skipped += 1; continue; }
            if (dryRun) {
                console.log(`[dry-run] candidate ${profile.supabaseId} — would embed ${text.length} chars`);
                continue;
            }
            try {
                const result = await upsertCandidateEmbedding(profile.supabaseId, text);
                if (result.updated) updated += 1; else skipped += 1;
            } catch (err) {
                console.error(`[backfill] candidate ${profile.supabaseId} failed:`, err);
            }
        }

        cursor = batch[batch.length - 1].id;
        console.log(`[backfill candidates] processed=${processed} updated=${updated} skipped=${skipped}`);
        if (batch.length < PAGE) break;
    }

    return { processed, updated, skipped };
}

async function main(): Promise<void> {
    const args = parseArgs();
    const doJobs = !args.onlyCandidates || args.onlyJobs;
    const doCandidates = !args.onlyJobs || args.onlyCandidates;

    if (doJobs) {
        console.log('[backfill] === JOBS ===');
        const result = await backfillJobs(args.dryRun);
        console.log(`[backfill jobs] DONE — processed=${result.processed} updated=${result.updated} skipped=${result.skipped}`);
    }
    if (doCandidates) {
        console.log('[backfill] === CANDIDATES ===');
        const result = await backfillCandidates(args.dryRun);
        console.log(`[backfill candidates] DONE — processed=${result.processed} updated=${result.updated} skipped=${result.skipped}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('[backfill] fatal', err); process.exit(1); });
