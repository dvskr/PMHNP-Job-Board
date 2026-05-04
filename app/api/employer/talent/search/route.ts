/**
 * POST /api/employer/talent/search — Phase 1 Sprint 1.3.
 *
 * AI-ranked complement to the existing tier-gated /api/employer/candidates
 * endpoint. Same gates, same field-selection by access level, same privacy
 * transform on names — only the ranking changes (vector + LLM rerank instead
 * of plain filter-and-sort).
 *
 * Hard rules — match what /api/employer/candidates already enforces:
 *   - Auth: employer or admin role required.
 *   - Active-posting gate: non-admin without an active posting only sees
 *     `baseSelect` fields (same as filter-only browse). The query still runs;
 *     unlock-eligible metadata is just hidden.
 *   - Privacy transform: last name → first initial unless admin.
 *   - Per-employer cost cap: 10 reranks/day (counted from `ai_call_log`).
 *
 * Pipeline:
 *   1. Embed the natural-language query.
 *   2. Vector search over `candidate_embeddings` → top 50.
 *   3. Hydrate with the SAME tier-aware select used by /api/employer/candidates.
 *   4. LLM rerank top-50 → top-K with one-line "why this match" reasons.
 *   5. Apply the same display-name privacy transform.
 *
 * The endpoint is opt-in via the `ai.employer.talent_search` flag — when off
 * we return 404 and the existing filter-based browse stays the only entry.
 *
 * Body: { query: string; states?: string[]; k?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { getEmployerTier, getEmployerActivePostings } from '@/lib/tier-limits';
import { embed, complete } from '@/lib/ai/gateway';
import { semanticCandidateSearch } from '@/lib/ai/vector-search';
import { loadPrompt } from '@/lib/ai/prompts/registry';
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags';
import { logger } from '@/lib/logger';

const RERANK_DAILY_CAP = 10;

// Caller provides EITHER a free-text query OR a postingId to match against
// the JD they already wrote. Both paths share the same downstream pipeline,
// cost cap, tier gates, and privacy transform. The postingId path lets the
// employer's existing JD effort do the work — no retyping requirements.
const bodySchema = z.union([
    z.object({
        query: z.string().min(3).max(500),
        postingId: z.undefined().optional(),
        states: z.array(z.string().length(2)).max(10).optional(),
        k: z.number().int().min(1).max(20).optional(),
    }),
    z.object({
        query: z.undefined().optional(),
        postingId: z.string().min(1).max(64),
        states: z.array(z.string().length(2)).max(10).optional(),
        k: z.number().int().min(1).max(20).optional(),
    }),
]);

const rerankResultSchema = z.object({
    ranked: z.array(z.object({
        candidateIndex: z.number().int(),
        reason: z.string().max(500),
    })).max(10),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    // ── Rate limit + auth — same gates as /api/employer/candidates ──────
    const rl = await rateLimit(request, 'employer:talent-search', RATE_LIMITS.employer);
    if (rl) return rl;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { role: true },
    });
    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const isAdmin = profile.role === 'admin';
    const tier = await getEmployerTier(user.id);
    const hasActivePosting = isAdmin
        ? true
        : (await getEmployerActivePostings(user.id)).length > 0;

    const tenant = { type: 'employer' as const, id: user.id };

    // Feature flag.
    const enabled = await isAiFeatureEnabled('ai.employer.talent_search', tenant);
    if (!enabled) {
        return NextResponse.json({ error: 'Not enabled' }, { status: 404 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }
    const { states, k = 10 } = parsed.data;

    // ── Resolve the query — typed search OR JD from a posting ──────────
    // When postingId is supplied, the employer is asking "find candidates
    // for THIS posting." We embed the JD's title + description (capped to
    // ~6k chars to stay under the embedder's token limit) and run the
    // same downstream pipeline. The job must belong to this employer
    // (or admin) — no cross-employer JD scraping.
    let query: string;
    let postingTitle: string | undefined;
    if ('postingId' in parsed.data && parsed.data.postingId) {
        const employerJob = await prisma.employerJob.findFirst({
            where: {
                id: parsed.data.postingId,
                ...(isAdmin ? {} : { userId: user.id }),
            },
            select: {
                jobId: true,
                job: {
                    select: { title: true, description: true, isPublished: true, archivedAt: true },
                },
            },
        });
        if (!employerJob || !employerJob.job) {
            return NextResponse.json({ error: 'Posting not found' }, { status: 404 });
        }
        if (!employerJob.job.isPublished || employerJob.job.archivedAt) {
            return NextResponse.json({ error: 'Posting is not active' }, { status: 400 });
        }
        postingTitle = employerJob.job.title;
        // Trim to ~6000 chars — text-embedding-3-small handles ~8k tokens
        // (~32k chars) but real JDs are usually <2k chars and longer ones
        // dilute the signal anyway. Title up front because the embedder
        // weights early tokens slightly higher.
        const desc = (employerJob.job.description ?? '').slice(0, 6000);
        query = `${employerJob.job.title}\n\n${desc}`.trim();
        if (query.length < 3) {
            return NextResponse.json({ error: 'Posting has no usable JD text' }, { status: 400 });
        }
    } else if ('query' in parsed.data && parsed.data.query) {
        query = parsed.data.query;
    } else {
        // bodySchema's union should make this unreachable.
        return NextResponse.json({ error: 'Provide either query or postingId' }, { status: 400 });
    }

    // ── Per-employer per-day rerank cap (architecture doc §1.3.5) ───────
    const sinceMidnightUtc = new Date();
    sinceMidnightUtc.setUTCHours(0, 0, 0, 0);
    const todayCalls = await prisma.aiCallLog.count({
        where: {
            task: 'talent_search_rerank',
            tenantType: 'employer',
            tenantId: user.id,
            createdAt: { gte: sinceMidnightUtc },
        },
    });
    if (todayCalls >= RERANK_DAILY_CAP) {
        return NextResponse.json({
            error: 'Daily limit reached',
            message: `You've used your ${RERANK_DAILY_CAP} smart searches for today.`,
            upgradeCta: '/pricing',
            tier,
        }, { status: 429 });
    }

    // ── 1. Embed query ──────────────────────────────────────────────────
    let queryEmbedding: number[];
    try {
        const embedded = await embed({ input: query, tenant });
        queryEmbedding = embedded.embedding;
    } catch (err) {
        logger.warn('talent search: embed failed', undefined, err);
        return NextResponse.json({ error: 'Search temporarily unavailable' }, { status: 503 });
    }

    // ── 2. Vector search → top 50 ───────────────────────────────────────
    const vectorHits = await semanticCandidateSearch(queryEmbedding, {
        k: 50,
        licenseStates: states,
    });
    if (vectorHits.length === 0) {
        return NextResponse.json({ candidates: [], reason: 'no_matches', tier, hasActivePosting });
    }

    // ── 3. Hydrate using the SAME tier-aware select as /api/employer/candidates ──
    const baseSelect = {
        id: true,
        supabaseId: true,
        firstName: true,
        lastName: true,
        headline: true,
        yearsExperience: true,
        specialties: true,
        preferredWorkMode: true,
        avatarUrl: true,
        createdAt: true,
    } as const;

    const activeSelect = {
        ...baseSelect,
        certifications: true,
        licenseStates: true,
        desiredSalaryMin: true,
        desiredSalaryMax: true,
        desiredSalaryType: true,
        availableDate: true,
        resumeUrl: true,
    } as const;

    const adminSelect = {
        ...activeSelect,
        bio: true,
        preferredJobType: true,
        state: true,
        city: true,
    } as const;

    const select = isAdmin ? adminSelect : hasActivePosting ? activeSelect : baseSelect;

    const profiles = await prisma.userProfile.findMany({
        where: {
            supabaseId: { in: vectorHits.map((h) => h.supabaseId) },
            profileVisible: true,
            openToOffers: true,
            role: 'job_seeker',
        },
        select,
    });
    const byId = new Map(profiles.map((p) => [p.supabaseId, p]));

    // Preserve vector-rank order; build the candidate list for the LLM.
    const ordered = vectorHits
        .map((h, i) => {
            const p = byId.get(h.supabaseId);
            if (!p) return null;
            return { vectorRank: i + 1, similarity: h.similarity, profile: p };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    if (ordered.length === 0) {
        return NextResponse.json({ candidates: [], reason: 'no_profiles', tier, hasActivePosting });
    }

    // Build the LLM-facing candidate list. ALWAYS strip names + contact fields
    // even for admin reruns — the rerank prompt does not need them and they
    // could leak via the reason text. PII scanner enforces this on the
    // prompt template itself; we belt-and-suspenders here.
    const candidateList = ordered.slice(0, 30).map((c, i) => {
        const p = c.profile as Partial<{
            headline: string | null;
            yearsExperience: number | null;
            certifications: string | null;
            licenseStates: string | null;
            specialties: string | null;
            preferredWorkMode: string | null;
            bio: string | null;
        }>;
        const fields: string[] = [`Candidate #${i + 1}`];
        if (p.headline) fields.push(`Headline: ${p.headline}`);
        if (p.yearsExperience) fields.push(`Years: ${p.yearsExperience}`);
        if (p.certifications) fields.push(`Certs: ${p.certifications}`);
        if (p.licenseStates) fields.push(`States: ${p.licenseStates}`);
        if (p.specialties) fields.push(`Specialties: ${p.specialties}`);
        if (p.preferredWorkMode) fields.push(`Mode: ${p.preferredWorkMode}`);
        if (p.bio) fields.push(`Bio: ${p.bio.slice(0, 400)}`);
        return fields.join(' | ');
    }).join('\n\n');

    const jobSummary = `Active employer is searching for: "${query}"`;

    // ── 4. LLM rerank ──────────────────────────────────────────────────
    let ranked: Array<{ candidateIndex: number; reason: string }>;
    try {
        const prompt = await loadPrompt('talent_search_rerank');
        const result = await complete({
            task: 'talent_search_rerank',
            tenant,
            messages: prompt.render({ jobSummary, candidateList }),
            promptId: prompt.id,
            promptVersion: prompt.version,
            cacheKey: ['rerank', prompt.version, query, ordered.map((c) => c.profile.supabaseId).join(',')],
            outputSchema: rerankResultSchema,
        });
        ranked = result.parsed?.ranked ?? [];
    } catch (err) {
        logger.warn('talent search: rerank failed, falling back to vector order', undefined, err);
        ranked = ordered.slice(0, k).map((_, i) => ({ candidateIndex: i + 1, reason: 'Vector match (rerank unavailable).' }));
    }

    // ── 5. Build response with the SAME privacy transform as /api/employer/candidates ──
    const candidates = ranked.slice(0, k).map((r) => {
        const original = ordered[r.candidateIndex - 1];
        if (!original) return null;
        const c = original.profile as typeof original.profile & {
            firstName?: string | null;
            lastName?: string | null;
            headline?: string | null;
            yearsExperience?: number | null;
            specialties?: string | null;
            preferredWorkMode?: string | null;
            avatarUrl?: string | null;
            certifications?: string | null;
            licenseStates?: string | null;
            desiredSalaryMin?: number | null;
            desiredSalaryMax?: number | null;
            desiredSalaryType?: string | null;
            availableDate?: Date | null;
            resumeUrl?: string | null;
            bio?: string | null;
            preferredJobType?: string | null;
            state?: string | null;
            city?: string | null;
        };

        const base: Record<string, unknown> = {
            id: c.supabaseId,
            displayName: c.firstName
                ? `${c.firstName} ${isAdmin && c.lastName ? c.lastName : (c.lastName ? c.lastName.charAt(0) + '.' : '')}`.trim()
                : 'PMHNP Candidate',
            headline: c.headline,
            yearsExperience: c.yearsExperience,
            specialties: c.specialties ? c.specialties.split(',').map((s) => s.trim()) : [],
            preferredWorkMode: c.preferredWorkMode,
            avatarUrl: c.avatarUrl,
            initials: `${(c.firstName || 'P').charAt(0)}${(c.lastName || 'C').charAt(0)}`.toUpperCase(),
            joinedAt: c.createdAt.toISOString(),
            similarity: original.similarity,
            matchPercent: Math.round(original.similarity * 100),
            reason: r.reason,
        };

        if (hasActivePosting) {
            Object.assign(base, {
                certifications: c.certifications ? c.certifications.split(',').map((s) => s.trim()) : [],
                licenseStates: c.licenseStates ? c.licenseStates.split(',').map((s) => s.trim()) : [],
                desiredSalaryMin: c.desiredSalaryMin,
                desiredSalaryMax: c.desiredSalaryMax,
                desiredSalaryType: c.desiredSalaryType,
                availableDate: c.availableDate?.toISOString() ?? null,
                hasResume: !!c.resumeUrl,
            });
        }

        if (isAdmin) {
            Object.assign(base, {
                bio: c.bio,
                preferredJobType: c.preferredJobType,
                state: c.state,
                city: c.city,
            });
        }

        return base;
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    return NextResponse.json({
        // For postingId paths the raw query is the full JD text, which is
        // noisy to display. Surface the posting title separately so the UI
        // can render "Showing top candidates for {postingTitle}" without
        // dumping the JD body.
        query: postingTitle ? `Top matches for: ${postingTitle}` : query,
        postingTitle: postingTitle ?? null,
        candidates,
        tier,
        hasActivePosting,
        rerankUsesRemaining: Math.max(0, RERANK_DAILY_CAP - todayCalls - 1),
    });
}
