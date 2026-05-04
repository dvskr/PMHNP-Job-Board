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

        const job = await step.run('fetch-job', async () =>
            prisma.job.findUnique({
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
            }),
        );
        if (!job) {
            logger.warn('refreshJobEmbedding: job not found', { jobId });
            return { skipped: 'not_found' };
        }
        // Don't waste embed budget on hidden / archived jobs — they won't surface in search.
        if (!job.isPublished || job.archivedAt) {
            return { skipped: 'not_published' };
        }

        const text = buildJobEmbeddingText(job);
        const result = await step.run('upsert-embedding', async () =>
            upsertJobEmbedding(jobId, text),
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

        const profile = await step.run('fetch-profile', async () =>
            prisma.userProfile.findUnique({
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
            }),
        );
        if (!profile) {
            return { skipped: 'not_found' };
        }
        if (!profile.profileVisible || profile.deletedAt) {
            return { skipped: 'not_visible' };
        }

        const text = buildCandidateEmbeddingText({
            ...profile,
            yearsExperience: profile.yearsExperience ?? null,
        });
        if (!text || text.trim().length < 20) {
            // Profile is too sparse to embed meaningfully — skip rather than spend
            // budget on noise.
            return { skipped: 'profile_too_sparse' };
        }

        const result = await step.run('upsert-embedding', async () =>
            upsertCandidateEmbedding(supabaseId, text),
        );
        return { supabaseId, ...result };
    },
);

export const embeddingFunctions = [refreshJobEmbedding, refreshCandidateEmbedding] as const;
