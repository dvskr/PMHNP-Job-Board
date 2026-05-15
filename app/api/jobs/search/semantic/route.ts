/**
 * GET /api/jobs/search/semantic — Phase 1 Sprint 1.1.
 *
 * Hybrid search:
 *   1. Embed the user's free-text query via the gateway.
 *   2. Run vector search over `job_embeddings` (top 50).
 *   3. Run a keyword filter (Postgres full-text style) for the same query.
 *   4. Combine via reciprocal rank fusion (RRF).
 *   5. Return top-K with similarity scores so the UI can render the "% match"
 *      badge and order results.
 *
 * Behind feature flag `ai.search.semantic`. If the flag is off, returns 404
 * so callers fall back to the existing `/api/jobs` keyword search. The flag
 * defaults to `false` per the rollout plan.
 *
 * Chaos: if the gateway throws (provider outage, rate limit), the route
 * returns a `degraded: true` payload with `mode: 'keyword'` so the client
 * can transparently render keyword-only results without a UI error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { embed, AiGatewayError } from '@/lib/ai/gateway';
import { semanticJobSearch, reciprocalRankFusion } from '@/lib/ai/vector-search';
import { parseSemanticQuery } from '@/lib/ai/query-parser';
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags';
import { getExperimentArm, trackExperimentEvent } from '@/lib/ai/experiments';
import { createClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';

// Sticky anonymous-tenant id. Used so the same browser stays in the same
// A/B arm across sessions even before the user signs in. Hashed so the
// raw cookie value never leaves the server.
const ANON_COOKIE = 'pmhnp_exp_anon';
const SEMANTIC_SEARCH_EXPERIMENT = {
    experiment: 'semantic_search.v1',
    arms: ['control', 'treatment'] as const,
    /** 50% rollout — give the experiment enough volume per arm to detect a CTR delta. */
    rolloutPercent: 50,
};

const querySchema = z.object({
    q: z.string().min(2).max(500),
    state: z.string().length(2).optional(),
    remoteOnly: z.coerce.boolean().optional(),
    k: z.coerce.number().min(1).max(50).default(20),
});

interface RankedHit {
    jobId: string;
    similarity: number;       // 0..1 from vector search; 0 if keyword-only
    keywordRank?: number;     // 1-indexed position in keyword results
    rrfScore: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    // Generous rate limit — public endpoint.
    const rl = await rateLimit(request, 'jobs-semantic', { limit: 60, windowSeconds: 60 });
    if (rl) return rl;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Anonymous tenants get a per-browser hashed-cookie id so their A/B arm
    // is sticky across sessions. Set on first hit; reused thereafter.
    let anonId: string | null = null;
    if (!user) {
        const jar = await cookies();
        const existing = jar.get(ANON_COOKIE)?.value;
        if (existing) {
            anonId = existing;
        } else {
            anonId = createHash('sha256').update(`${Date.now()}|${Math.random()}`).digest('hex').slice(0, 24);
            // SEO Fix M6: explicitly set `secure: true` in production. Without
            // it, this cookie relies on framework defaults — the audit flagged
            // that as a security gap. Local dev (no HTTPS) keeps it off so
            // the cookie still gets set during development.
            jar.set(ANON_COOKIE, anonId, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 365,
                secure: process.env.NODE_ENV === 'production',
            });
        }
    }

    const tenant = user
        ? { type: 'candidate' as const, id: user.id }
        : { type: 'system'    as const, id: `anon:${anonId}` };

    // Flag check.
    const enabled = await isAiFeatureEnabled('ai.search.semantic', tenant);
    if (!enabled) {
        return NextResponse.json({ error: 'Not enabled' }, { status: 404 });
    }

    // ── A/B arm assignment (sticky per tenant) ────────────────────────
    // `control` → keyword-only path (skip embed + vector search).
    // `treatment` → full hybrid pipeline (vector + keyword + RRF).
    // The arm sticks for the lifetime of the assignment row, even if the
    // rollout % changes later. CTR + apply-rate are tracked via
    // `trackExperimentEvent` here and on the click endpoint.
    const arm = await getExperimentArm({
        experiment: SEMANTIC_SEARCH_EXPERIMENT.experiment,
        arms: [...SEMANTIC_SEARCH_EXPERIMENT.arms],
        rolloutPercent: SEMANTIC_SEARCH_EXPERIMENT.rolloutPercent,
    }, tenant);
    const useSemantic = arm === 'treatment';

    const url = new URL(request.url);
    // url.searchParams.get() returns null for missing params — Zod's .optional()
    // accepts undefined but NOT null, so the inline browse-page search (which
    // omits state/remoteOnly entirely) would 400. Map null → undefined first.
    const get = (k: string): string | undefined => url.searchParams.get(k) ?? undefined;
    const parsed = querySchema.safeParse({
        q: get('q'),
        state: get('state'),
        remoteOnly: get('remoteOnly'),
        k: get('k'),
    });
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid query', details: parsed.error.issues }, { status: 400 });
    }
    const { q, state: stateOverride, remoteOnly: remoteOverride, k } = parsed.data;

    // ── Parse natural-language query for hard constraints ──────────────
    // The vector embedder treats state names as one feature among many, so
    // "telehealth child psych in CA" still surfaces Oregon + Massachusetts
    // hits. Pulling state + remote intent out as SQL filters first lets the
    // semantic similarity focus on the qualitative part of the query.
    const parsedQuery = parseSemanticQuery(q);
    const state = stateOverride ?? parsedQuery.state;
    const remoteOnly = remoteOverride ?? parsedQuery.remoteOnly ?? false;
    // Embed the cleaned query (with state / "remote" tokens stripped).
    const semanticQuery = parsedQuery.cleaned || q;

    let vectorHits: Array<{ jobId: string; similarity: number }> = [];
    let degraded = false;

    // ── 1. Embed query (skipped for control arm) ────────────────────────
    if (useSemantic) {
        try {
            const embedded = await embed({ input: semanticQuery, tenant });
            vectorHits = await semanticJobSearch(embedded.embedding, {
                k: 50,
                states: state ? [state] : undefined,
                remoteOnly,
            });
        } catch (err) {
            if (err instanceof AiGatewayError) {
                logger.warn('semantic search degraded — gateway error', { code: err.code });
            } else {
                logger.warn('semantic search degraded — unknown error', undefined, err);
            }
            degraded = true;
        }
    }

    // ── 2. Keyword search ────────────────────────────────────────────────
    // Tokenize the cleaned query (drop very short stop-tokens) and require
    // ANY token to ILIKE-match ANY of the searched fields. Substring-matching
    // the whole phrase as one ("telehealth child psych") almost never hits
    // because no job has those exact 3 words consecutively. Tokenized OR
    // gives reasonable recall for RRF to fuse with the vector side.
    const tokens = semanticQuery
        .split(/[\s,.\-/]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3);
    const tokenOr = tokens.length === 0
        ? [{ title: { contains: semanticQuery, mode: 'insensitive' as const } }]
        : tokens.flatMap((tok) => [
            { title:       { contains: tok, mode: 'insensitive' as const } },
            { description: { contains: tok, mode: 'insensitive' as const } },
            { setting:     { contains: tok, mode: 'insensitive' as const } },
            { population:  { contains: tok, mode: 'insensitive' as const } },
        ]);

    // Keyword side also honors the parsed state + remote constraints so the
    // RRF fusion stays consistent — neither side can leak rows that violate
    // the hard filter.
    const keywordHits = await prisma.job.findMany({
        where: {
            isPublished: true,
            archivedAt: null,
            // `state` column stores full names ("California"); the parser
            // returns 2-letter codes — filter against `stateCode` instead.
            ...(state ? { stateCode: state } : {}),
            ...(remoteOnly ? { isRemote: true } : {}),
            OR: tokenOr,
        },
        select: { id: true },
        take: 50,
        orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
    });

    // ── 3. Fuse rankings ─────────────────────────────────────────────────
    const fused: RankedHit[] = (() => {
        // No vector results → return keyword order with similarity=0.
        if (vectorHits.length === 0) {
            return keywordHits.slice(0, k).map((h, i) => ({
                jobId: h.id, similarity: 0, keywordRank: i + 1, rrfScore: 1 / (60 + i + 1),
            }));
        }
        const rrf = reciprocalRankFusion([
            vectorHits.map((h) => ({ id: h.jobId })),
            keywordHits.map((h) => ({ id: h.id })),
        ]);
        const simByJob = new Map(vectorHits.map((h) => [h.jobId, h.similarity]));
        const kwRank = new Map(keywordHits.map((h, i) => [h.id, i + 1]));
        return rrf.slice(0, k).map((entry) => ({
            jobId: entry.id,
            similarity: simByJob.get(entry.id) ?? 0,
            keywordRank: kwRank.get(entry.id),
            rrfScore: entry.rrfScore,
        }));
    })();

    const mode: 'keyword' | 'hybrid' = useSemantic && !degraded ? 'hybrid' : 'keyword';

    // Fire-and-forget impression event so we can compute arm-level CTR
    // / apply-rate offline. Skipped on empty result sets — an impression
    // requires something for the user to actually impress on.
    if (fused.length > 0) {
        void trackExperimentEvent({
            experiment: SEMANTIC_SEARCH_EXPERIMENT.experiment,
            arm,
            tenant,
            eventType: 'impression',
            metadata: { mode, query_length: q.length, k, results: fused.length, degraded },
        });
    }

    if (fused.length === 0) {
        return NextResponse.json({ jobs: [], degraded, mode, arm });
    }

    // ── 4. Hydrate full job rows for the UI ─────────────────────────────
    // Select every column JobCard reads from `Job` so we can hand the rows
    // straight to the existing component without prop-by-prop spreading.
    const jobs = await prisma.job.findMany({
        where: { id: { in: fused.map((h) => h.jobId) } },
        select: {
            id: true, title: true, slug: true, employer: true, location: true,
            jobType: true, mode: true, experienceLevel: true,
            // Phase 1 experience chip
            experienceLabel: true, newGradFriendly: true,
            description: true, descriptionSummary: true,
            salaryRange: true, minSalary: true, maxSalary: true, salaryPeriod: true,
            normalizedMinSalary: true, normalizedMaxSalary: true,
            salaryIsEstimated: true, salaryConfidence: true, displaySalary: true,
            city: true, state: true, stateCode: true, country: true,
            isRemote: true, isHybrid: true,
            applyLink: true, applyOnPlatform: true,
            isFeatured: true, isPublished: true, isVerifiedEmployer: true,
            sourceType: true, sourceProvider: true, sourceSite: true, externalId: true,
            originalPostedAt: true, viewCount: true, applyClickCount: true,
            createdAt: true, updatedAt: true, expiresAt: true, companyId: true,
            employerJobs: { select: { companyLogoUrl: true } },
        },
    });

    // Preserve fusion order + attach similarity score.
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const ordered = fused
        .map((h) => {
            const job = byId.get(h.jobId);
            if (!job) return null;
            return {
                ...job,
                companyLogoUrl: job.employerJobs?.companyLogoUrl ?? null,
                employerJobs: undefined,
                aiMatchPercent: Math.round(h.similarity * 100),
            };
        })
        .filter((j): j is NonNullable<typeof j> => j !== null);

    return NextResponse.json({
        jobs: ordered,
        degraded,
        mode,
        arm,
        query: q,
    });
}
