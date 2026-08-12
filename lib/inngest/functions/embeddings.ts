/**
 * Embedding refresh workers — Sprint 0.3.4 + 0.3.5.
 *
 * Two functions:
 *   1. embedding.refresh.job        — fired on job.created / job.updated
 *   2. embedding.refresh.candidate  — fired on candidate.profile.updated
 *
 * Both are idempotent: the upsert helpers compare a content hash and skip
 * re-embedding when the underlying text is unchanged. That makes it safe to
 * fan out broadly (e.g. backfill script) without burning embedding budget.
 *
 * Concurrency is throttled per-entity so a job that's edited 5 times in 30
 * seconds doesn't trigger 5 parallel embedding calls — the first wins, the
 * rest coalesce.
 *
 * STEP-OUTPUT DISCIPLINE (2026-08-13): the fetch steps used to return the raw
 * row, including `jobs.description` and `user_profiles.bio` — text columns with
 * no ceiling in the schema (scraped descriptions run to tens of KB). Inngest
 * persists every step return value as durable run state under a size cap;
 * returning unbounded columns is the shape that broke recommendations.ts (see
 * that file's docblock).
 *
 * The rows are now built into embedding text INSIDE the fetch step, so what
 * crosses the boundary is bounded by the slices in buildJobEmbeddingText
 * (4000 chars of description) and buildCandidateEmbeddingText (1500 chars of
 * bio). The retry boundary in front of the paid embedding call is preserved.
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
    buildJobEmbeddingText,
    buildCandidateEmbeddingText,
    upsertJobEmbedding,
    upsertCandidateEmbedding,
} from '@/lib/ai/vector-search';

export interface JobEmbeddingRefreshEventData {
    jobId: string;
}

export interface CandidateEmbeddingRefreshEventData {
    /** supabase auth id, NOT user_profiles.id. */
    supabaseId: string;
}

export const refreshJobEmbedding = inngest.createFunction(
    {
        id: 'embedding-refresh-job',
        name: 'Embedding refresh — job',
        triggers: [{ event: 'embedding.refresh.job' }],
        // Coalesce edits per job within a 30-second window.
        throttle: { limit: 1, period: '30s', key: 'event.data.jobId' },
        retries: 2,
    },
    async ({ event, step }) => {
        const { jobId } = event.data as JobEmbeddingRefreshEventData;

        // Gate and build inside the step so the raw `description` column stays
        // local; only the bounded embedding text crosses the boundary.
        // Flat shape (not a discriminated union) because Inngest wraps step
        // returns in Jsonify<>, which defeats discriminant narrowing.
        const prepared = await step.run('prepare-job-text', async (): Promise<{
            status: 'not_found' | 'not_published' | 'ready';
            text: string;
        }> => {
            const job = await prisma.job.findUnique({
                where: { id: jobId },
                select: {
                    title: true,
                    description: true,
                    setting: true,
                    population: true,
                    state: true,
                    benefits: true,
                    isPublished: true,
                    archivedAt: true,
                },
            });
            if (!job) return { status: 'not_found', text: '' };
            // Don't waste embed budget on hidden / archived jobs — they won't surface in search.
            if (!job.isPublished || job.archivedAt) return { status: 'not_published', text: '' };
            return { status: 'ready', text: buildJobEmbeddingText(job) };
        });

        if (prepared.status === 'not_found') {
            logger.warn('refreshJobEmbedding: job not found', { jobId });
            return { skipped: 'not_found' };
        }
        if (prepared.status === 'not_published') {
            return { skipped: 'not_published' };
        }

        const result = await step.run('upsert-embedding', async () =>
            upsertJobEmbedding(jobId, prepared.text),
        );
        return { jobId, ...result };
    },
);

export const refreshCandidateEmbedding = inngest.createFunction(
    {
        id: 'embedding-refresh-candidate',
        name: 'Embedding refresh — candidate',
        triggers: [{ event: 'embedding.refresh.candidate' }],
        throttle: { limit: 1, period: '30s', key: 'event.data.supabaseId' },
        retries: 2,
    },
    async ({ event, step }) => {
        const { supabaseId } = event.data as CandidateEmbeddingRefreshEventData;

        // Gate and build inside the step so the raw `bio` column stays local;
        // only the bounded embedding text crosses the boundary.
        // Flat shape (not a discriminated union) — see prepare-job-text above.
        const prepared = await step.run('prepare-candidate-text', async (): Promise<{
            status: 'not_found' | 'not_visible' | 'ready';
            text: string;
        }> => {
            const profile = await prisma.userProfile.findUnique({
                where: { supabaseId },
                select: {
                    headline: true,
                    yearsExperience: true,
                    certifications: true,
                    licenseStates: true,
                    specialties: true,
                    skills: true,
                    bio: true,
                    profileVisible: true,
                    deletedAt: true,
                },
            });
            if (!profile) return { status: 'not_found', text: '' };
            if (!profile.profileVisible || profile.deletedAt) return { status: 'not_visible', text: '' };
            return {
                status: 'ready',
                text: buildCandidateEmbeddingText({
                    ...profile,
                    yearsExperience: profile.yearsExperience ?? null,
                }),
            };
        });

        if (prepared.status === 'not_found') {
            return { skipped: 'not_found' };
        }
        if (prepared.status === 'not_visible') {
            return { skipped: 'not_visible' };
        }
        if (!prepared.text || prepared.text.trim().length < 20) {
            // Profile is too sparse to embed meaningfully — skip rather than spend
            // budget on noise.
            return { skipped: 'profile_too_sparse' };
        }

        const result = await step.run('upsert-embedding', async () =>
            upsertCandidateEmbedding(supabaseId, prepared.text),
        );
        return { supabaseId, ...result };
    },
);

export const embeddingFunctions = [refreshJobEmbedding, refreshCandidateEmbedding] as const;
