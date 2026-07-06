/**
 * Vector search + embedding upsert helpers.
 *
 * Prisma 7 doesn't natively type pgvector columns, so all reads/writes go
 * through `$queryRaw`. The cast-to-vector trick (`::vector`) lets us pass an
 * embedding as a regular JSON-stringified number array via parameter binding.
 *
 * Search semantics:
 *   - Cosine similarity: `embedding <=> $1::vector` returns distance (0 = perfect).
 *   - Hybrid search uses Reciprocal Rank Fusion (RRF) to combine vector rank
 *     with the existing keyword ranking — see hybridJobSearch().
 *
 * Filters are deliberately conservative — we always require `is_published=true`
 * and exclude archived jobs. Don't surface inactive content via semantic search.
 */

import { createHash } from 'crypto';
import { prisma } from '../prisma';
import { embed } from './gateway';
import { ATS_HOST_SUBSTRINGS } from './job-classifier';
import { getEmbeddingModel } from './tasks';
import { logger } from '../logger';

export interface JobSearchHit {
    jobId: string;
    /** Cosine similarity in [0, 1] (1 = perfect match). Computed as 1 - distance. */
    similarity: number;
}

export interface CandidateSearchHit {
    supabaseId: string;
    similarity: number;
}

export interface SemanticJobSearchOptions {
    /** Top-K to return. Defaults to 25. */
    k?: number;
    /** Optional state filter (e.g. ['CA', 'TX']). */
    states?: readonly string[];
    /** Optional remote-only filter. */
    remoteOnly?: boolean;
    /** Optional minimum quality score. */
    minQualityScore?: number;
}

/**
 * Convert a JS number array to the pgvector literal string form. Necessary
 * because Prisma's parameter binding doesn't know how to serialize arrays as
 * `vector` — passing as text + casting `::vector` is the documented workaround.
 *
 * Hardening: every element is coerced through Number() and validated as a
 * finite number. NaN / Infinity / non-numeric inputs all collapse to 0 so
 * a malformed embedding can never become a string literal in the SQL that
 * gets interpolated below. Pure defense-in-depth — embedding providers
 * return finite floats today; this guarantees that property at the seam.
 */
function toVectorLiteral(values: readonly number[]): string {
    const safe = values.map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    });
    return `[${safe.join(',')}]`;
}

interface JobSearchRow { job_id: string; distance: number }

/**
 * Postgres-flavor regex matching any known ATS host — built from the shared
 * ATS_HOST_SUBSTRINGS list so it stays in lockstep with job-classifier.ts.
 * Safe to interpolate into SQL: it's a trusted compile-time constant derived
 * from the hardcoded host list (regex metachars escaped), never user input.
 */
const ATS_APPLY_LINK_REGEX = ATS_HOST_SUBSTRINGS
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

/**
 * Compute similarity between a query embedding and EVERY direct-apply-tier
 * job (employer-posted + Easy Apply + aggregator scrapes whose apply_link
 * goes straight to a known employer ATS), regardless of vector rank.
 *
 * Why: vector top-K is dominated by generic aggregator listings that score
 * marginally higher on cosine similarity. The smaller pool of high-value
 * direct-apply jobs gets statistically buried — even a strong 67% match for
 * a candidate's profile loses to 80 generic "Remote PMHNP" listings at 70%+.
 *
 * This helper guarantees every direct-apply-tier job reaches the selector
 * with an accurate similarity score. The selector then applies its quota /
 * license / health / freshness / diversity filters as usual — inclusion in
 * this pool is a fair-shot guarantee, not a slot guarantee.
 *
 * The ATS pattern set is derived from ATS_HOST_SUBSTRINGS in
 * lib/ai/job-classifier.ts so jobs that the classifier calls "direct_apply"
 * are the same set this query returns.
 */
export async function platformRevenueJobsWithSimilarity(
    queryEmbedding: readonly number[],
): Promise<JobSearchHit[]> {
    const vec = toVectorLiteral(queryEmbedding);
    const sql = `
        SELECT je.job_id, (je.embedding <=> '${vec}'::vector) AS distance
        FROM job_embeddings je
        JOIN jobs j ON j.id = je.job_id
        WHERE j.is_published = true
          AND j.archived_at IS NULL
          AND (
              j.source_type = 'employer'
              OR j.apply_on_platform = true
              OR j.source_type = 'direct'
              OR j.apply_link ~* '${ATS_APPLY_LINK_REGEX}'
          );
    `;
    const rows = await prisma.$queryRawUnsafe<JobSearchRow[]>(sql);
    return rows.map((r) => ({
        jobId: r.job_id,
        similarity: Math.max(0, Math.min(1, 1 - Number(r.distance ?? 1))),
    }));
}

/** Run a semantic job search. Returns top-K (job_id, similarity) hits. */
export async function semanticJobSearch(
    queryEmbedding: readonly number[],
    options: SemanticJobSearchOptions = {},
): Promise<JobSearchHit[]> {
    const k = options.k ?? 25;
    const vec = toVectorLiteral(queryEmbedding);

    // NOTE: Filter on `state_code` (2-letter, e.g. "CA"), NOT `state` which
    // holds full names like "California". Caller passes 2-letter codes.
    // Param numbering: vec + k are interpolated as literals, so the states
    // array (when present) is the only positional parameter and uses $1.
    const stateFilter = options.states && options.states.length > 0
        ? `AND j.state_code = ANY($1::text[])`
        : '';
    const remoteFilter = options.remoteOnly ? `AND j.is_remote = true` : '';
    const qualityFilter = (() => {
        // Guard against NaN / Infinity / negative values reaching the SQL
        // string. `Math.floor(NaN)` is `NaN`, which would interpolate as
        // the literal string "NaN" and cause Postgres to reject the
        // query — a low-effort DoS vector before this clamp.
        const raw = options.minQualityScore;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return '';
        const clamped = Math.max(0, Math.min(100, Math.floor(raw)));
        return `AND j.quality_score >= ${clamped}`;
    })();

    // We deliberately re-bind the vector via $queryRawUnsafe so the literal
    // works through Prisma's param marshaling. SQL injection isn't a risk
    // because the only string interpolation is the trusted vector literal we
    // just constructed from numbers.
    const sql = `
        SELECT je.job_id, (je.embedding <=> '${vec}'::vector) AS distance
        FROM job_embeddings je
        JOIN jobs j ON j.id = je.job_id
        WHERE j.is_published = true
          AND j.archived_at IS NULL
          ${stateFilter}
          ${remoteFilter}
          ${qualityFilter}
        ORDER BY je.embedding <=> '${vec}'::vector
        LIMIT ${Math.max(1, Math.min(200, k))};
    `;

    const rows = options.states && options.states.length > 0
        ? await prisma.$queryRawUnsafe<JobSearchRow[]>(sql, options.states)
        : await prisma.$queryRawUnsafe<JobSearchRow[]>(sql);

    return rows.map((r) => ({
        jobId: r.job_id,
        similarity: Math.max(0, Math.min(1, 1 - Number(r.distance ?? 1))),
    }));
}

interface CandidateSearchRow { supabase_id: string; distance: number }

export interface SemanticCandidateSearchOptions {
    k?: number;
    /**
     * Restrict to candidates whose `licenseStates` includes any of these state
     * codes. Filtering happens in the candidate join, so the candidate must
     * have an active user_profiles row.
     */
    licenseStates?: readonly string[];
}

export async function semanticCandidateSearch(
    queryEmbedding: readonly number[],
    options: SemanticCandidateSearchOptions = {},
): Promise<CandidateSearchHit[]> {
    const k = options.k ?? 25;
    const vec = toVectorLiteral(queryEmbedding);

    const stateFilter = options.licenseStates && options.licenseStates.length > 0
        ? `AND EXISTS (
            SELECT 1 FROM unnest(string_to_array(up.license_states, ',')) s
            WHERE TRIM(s) = ANY($1::text[])
          )`
        : '';

    const sql = `
        SELECT ce.supabase_id, (ce.embedding <=> '${vec}'::vector) AS distance
        FROM candidate_embeddings ce
        JOIN user_profiles up ON up.supabase_id = ce.supabase_id
        WHERE up.deleted_at IS NULL
          AND up.profile_visible = true
          ${stateFilter}
        ORDER BY ce.embedding <=> '${vec}'::vector
        LIMIT ${Math.max(1, Math.min(200, k))};
    `;

    const rows = options.licenseStates && options.licenseStates.length > 0
        ? await prisma.$queryRawUnsafe<CandidateSearchRow[]>(sql, options.licenseStates)
        : await prisma.$queryRawUnsafe<CandidateSearchRow[]>(sql);

    return rows.map((r) => ({
        supabaseId: r.supabase_id,
        similarity: Math.max(0, Math.min(1, 1 - Number(r.distance ?? 1))),
    }));
}

/**
 * Reciprocal Rank Fusion — combine multiple ranked lists into one. The
 * canonical formula: `score(d) = Σ 1 / (k + rank(d))`. `k=60` is the value
 * used by the original RRF paper and works well across heterogeneous rankers.
 */
export function reciprocalRankFusion<T>(
    rankings: ReadonlyArray<ReadonlyArray<{ id: T; score?: number }>>,
    k = 60,
): Array<{ id: T; rrfScore: number }> {
    const scores = new Map<T, number>();
    for (const list of rankings) {
        list.forEach((item, index) => {
            const rank = index + 1;
            scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank));
        });
    }
    return [...scores.entries()]
        .map(([id, rrfScore]) => ({ id, rrfScore }))
        .sort((a, b) => b.rrfScore - a.rrfScore);
}

// ── Embedding upsert helpers ─────────────────────────────────────────

/**
 * Build the canonical text we embed for a job. Stable + deterministic so
 * `inputHash` only changes when the underlying content actually changes.
 */
export function buildJobEmbeddingText(job: {
    title: string;
    description: string | null;
    setting?: string | null;
    population?: string | null;
    state?: string | null;
    benefits?: string[];
}): string {
    const parts: string[] = [`Title: ${job.title}`];
    if (job.setting) parts.push(`Setting: ${job.setting}`);
    if (job.population) parts.push(`Population: ${job.population}`);
    if (job.state) parts.push(`State: ${job.state}`);
    if (job.benefits?.length) parts.push(`Benefits: ${job.benefits.join(', ')}`);
    if (job.description) parts.push(`Description: ${job.description.slice(0, 4000)}`);
    return parts.join('\n');
}

/**
 * Build the canonical text we embed for a candidate. Strips PII (names, NPI/DEA,
 * race/gender/age/etc — those fields don't appear in the build either, but the
 * defensive note matters: the PII scanner in Sprint 0.4 will fail this if any
 * sensitive field name leaks in.
 */
export function buildCandidateEmbeddingText(candidate: {
    headline?: string | null;
    yearsExperience?: number | null;
    certifications?: string | null;
    licenseStates?: string | null;
    specialties?: string | null;
    skills?: string[];
    bio?: string | null;
}): string {
    const parts: string[] = [];
    if (candidate.headline) parts.push(`Headline: ${candidate.headline}`);
    if (candidate.yearsExperience) parts.push(`Years of Experience: ${candidate.yearsExperience}`);
    if (candidate.certifications) parts.push(`Certifications: ${candidate.certifications}`);
    if (candidate.licenseStates) parts.push(`Licensed States: ${candidate.licenseStates}`);
    if (candidate.specialties) parts.push(`Specialties: ${candidate.specialties}`);
    if (candidate.skills?.length) parts.push(`Skills: ${candidate.skills.join(', ')}`);
    if (candidate.bio) parts.push(`Bio: ${candidate.bio.slice(0, 1500)}`);
    return parts.join('\n');
}

function sha256Hex(s: string): string {
    return createHash('sha256').update(s).digest('hex');
}

/**
 * Upsert a job embedding. Returns true if a new embedding was generated, false
 * if the text hash AND embedding model matched the existing row (no-op).
 * Comparing the model too means a swap in tasks.ts regenerates stale vectors
 * instead of silently mixing old-model rows with new-model queries.
 */
export async function upsertJobEmbedding(
    jobId: string,
    inputText: string,
    tenantId = 'system',
): Promise<{ updated: boolean }> {
    const inputHash = sha256Hex(inputText);

    const existing = await prisma.$queryRawUnsafe<Array<{ input_hash: string; model: string }>>(
        `SELECT input_hash, model FROM job_embeddings WHERE job_id = $1`,
        jobId,
    );
    if (
        existing.length > 0 &&
        existing[0].input_hash === inputHash &&
        existing[0].model === getEmbeddingModel()
    ) {
        return { updated: false };
    }

    const result = await embed({
        input: inputText,
        tenant: { type: 'system', id: tenantId },
    });
    const vec = toVectorLiteral(result.embedding);

    await prisma.$executeRawUnsafe(
        `
        INSERT INTO job_embeddings (job_id, embedding, model, input_hash, updated_at)
        VALUES ($1, '${vec}'::vector, $2, $3, NOW())
        ON CONFLICT (job_id) DO UPDATE
          SET embedding = EXCLUDED.embedding,
              model = EXCLUDED.model,
              input_hash = EXCLUDED.input_hash,
              updated_at = NOW();
        `,
        jobId, result.model, inputHash,
    );

    logger.info('Job embedding upserted', { jobId, model: result.model, costUsd: result.usage.costUsd });
    return { updated: true };
}

/**
 * Upsert a candidate embedding. Returns true if a new embedding was generated.
 * Same skip rule as jobs: hash AND model must both match to no-op.
 */
export async function upsertCandidateEmbedding(
    supabaseId: string,
    inputText: string,
): Promise<{ updated: boolean }> {
    const inputHash = sha256Hex(inputText);

    const existing = await prisma.$queryRawUnsafe<Array<{ input_hash: string; model: string }>>(
        `SELECT input_hash, model FROM candidate_embeddings WHERE supabase_id = $1`,
        supabaseId,
    );
    if (
        existing.length > 0 &&
        existing[0].input_hash === inputHash &&
        existing[0].model === getEmbeddingModel()
    ) {
        return { updated: false };
    }

    const result = await embed({
        input: inputText,
        tenant: { type: 'system', id: 'embedding-worker' },
    });
    const vec = toVectorLiteral(result.embedding);

    await prisma.$executeRawUnsafe(
        `
        INSERT INTO candidate_embeddings (supabase_id, embedding, model, input_hash, updated_at)
        VALUES ($1, '${vec}'::vector, $2, $3, NOW())
        ON CONFLICT (supabase_id) DO UPDATE
          SET embedding = EXCLUDED.embedding,
              model = EXCLUDED.model,
              input_hash = EXCLUDED.input_hash,
              updated_at = NOW();
        `,
        supabaseId, result.model, inputHash,
    );

    logger.info('Candidate embedding upserted', { supabaseId, model: result.model, costUsd: result.usage.costUsd });
    return { updated: true };
}

/** Exposed for tests. */
export const __testing = { toVectorLiteral, sha256Hex };
