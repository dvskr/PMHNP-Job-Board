/**
 * AI feature flag system — Sprint 0.4.3.
 *
 * Decision order (first match wins):
 *   1. Env kill switch — `KILL_AI_<FLAG>=1` disables the flag instantly.
 *      No deploy required; a 30-sec env edit + redeploy is the SLA.
 *   2. DB override — admin-managed row in `ai_feature_flag_override` for
 *      either a specific tenant or '__GLOBAL__'.
 *   3. Compiled default — the `default` field in FLAG_REGISTRY below.
 *
 * Per non-negotiable #1: every AI feature ships behind a flag, killable in
 * <1 minute. The env layer is the panic button; the DB layer handles
 * gradual rollouts and per-customer pilot enablement.
 *
 * Lookups are cached per-process for 60 seconds — the AI features that read
 * flags do so once per request, so the cache is mostly a defense against a
 * bad cron firing thousands of lookups in a tight loop. Cache TTL is short
 * enough that admin kill-switch flips reach all instances within ~1 minute.
 */

import { prisma } from '../prisma';
import { logger } from '../logger';
import type { AiTenant } from './types';

/** Flag identifier — registers all known AI feature flags. */
export type AiFeatureFlag =
    // Phase 1 — semantic search rolls out gradually.
    | 'ai.search.semantic'
    | 'ai.search.match_badge'
    | 'ai.candidate.recommendations'
    | 'ai.candidate.recommendations_email'
    | 'ai.employer.talent_search'
    // Phase 2.
    | 'ai.candidate.application_coach'
    | 'ai.candidate.cover_letter'
    | 'ai.candidate.resume_parser'
    // Phase 3.
    | 'ai.employer.jd_generator'
    | 'ai.employer.bias_audit'
    | 'ai.employer.outreach_composer'
    | 'ai.employer.candidate_compare'
    | 'ai.employer.interview_prep'
    // Phase 4.
    | 'ai.platform.spam_detection'
    | 'ai.platform.support_bot'
    | 'ai.platform.seo_content';

interface FlagDefault {
    /** Compiled-in default value (env + DB can override). */
    default: boolean;
    /** Human-readable description for the admin kill-switch UI. */
    description: string;
}

const FLAG_REGISTRY: Record<AiFeatureFlag, FlagDefault> = {
    'ai.search.semantic':                 { default: false, description: 'Semantic (vector) job search on /jobs' },
    'ai.search.match_badge':              { default: false, description: 'Show "% match" badge on job cards' },
    'ai.candidate.recommendations':       { default: false, description: 'Personalized "For you" recommendations on candidate dashboard' },
    'ai.candidate.recommendations_email': { default: false, description: 'Weekly recommendation digest email (opt-in)' },
    'ai.employer.talent_search':          { default: false, description: 'Vector talent search in employer dashboard' },
    'ai.candidate.application_coach':     { default: false, description: 'Pre-submit feedback on applications' },
    'ai.candidate.cover_letter':          { default: false, description: 'Cover letter generator' },
    'ai.candidate.resume_parser':         { default: true,  description: 'Resume → profile auto-fill (already shipped)' },
    'ai.employer.jd_generator':           { default: false, description: 'Job description generator wizard' },
    'ai.employer.bias_audit':             { default: false, description: 'Inline bias audit on JD submit' },
    'ai.employer.outreach_composer':      { default: false, description: 'Pre-drafted personalized outreach messages' },
    'ai.employer.candidate_compare':      { default: false, description: 'Side-by-side AI candidate comparison' },
    'ai.employer.interview_prep':         { default: false, description: 'AI-generated interview question packs' },
    'ai.platform.spam_detection':         { default: false, description: 'Spam / fraud classifier on new jobs + applications' },
    'ai.platform.support_bot':            { default: false, description: 'First-line support chatbot on /contact' },
    'ai.platform.seo_content':            { default: false, description: 'AI-drafted city/state/specialty SEO pages (admin tool)' },
};

interface CachedFlag { value: boolean; cachedAt: number }
const CACHE = new Map<string, CachedFlag>();
const CACHE_TTL_MS = 60_000;

function envKey(flag: AiFeatureFlag): string {
    // Convert 'ai.candidate.cover_letter' → 'KILL_AI_CANDIDATE_COVER_LETTER'.
    return `KILL_${flag.toUpperCase().replace(/[.-]/g, '_')}`;
}

function envKillActive(flag: AiFeatureFlag): boolean {
    return process.env[envKey(flag)] === '1';
}

async function dbOverride(flag: AiFeatureFlag, tenant: AiTenant): Promise<boolean | null> {
    try {
        const rows = await prisma.aiFeatureFlagOverride.findMany({
            where: {
                flag,
                OR: [
                    { tenantType: tenant.type, tenantId: tenant.id },
                    { tenantType: 'global', tenantId: null },
                ],
                AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
            },
            // Tenant-specific row beats global; sort accordingly.
            orderBy: [{ tenantType: 'desc' }],
        });
        if (rows.length === 0) return null;
        const tenantSpecific = rows.find((r) => r.tenantId === tenant.id && r.tenantType === tenant.type);
        return (tenantSpecific ?? rows[0]).enabled;
    } catch (err) {
        // DB outage shouldn't gate features — fall through to default.
        logger.warn('AI feature flag DB lookup failed; using default', { flag, tenant }, err);
        return null;
    }
}

/**
 * Returns true if the flag is enabled for the given tenant. Reads cached for
 * up to 60 seconds. Use a fresh tenant lookup with `forceRefresh: true` after
 * an admin flips a kill switch.
 */
export async function isAiFeatureEnabled(
    flag: AiFeatureFlag,
    tenant: AiTenant,
    options?: { forceRefresh?: boolean },
): Promise<boolean> {
    const cacheKey = `${flag}:${tenant.type}:${tenant.id}`;
    const cached = CACHE.get(cacheKey);
    if (!options?.forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached.value;
    }

    // Layer 1: env kill switch.
    if (envKillActive(flag)) {
        CACHE.set(cacheKey, { value: false, cachedAt: Date.now() });
        return false;
    }

    // Layer 2: DB override.
    const override = await dbOverride(flag, tenant);
    if (override !== null) {
        CACHE.set(cacheKey, { value: override, cachedAt: Date.now() });
        return override;
    }

    // Layer 3: compiled default.
    const value = FLAG_REGISTRY[flag].default;
    CACHE.set(cacheKey, { value, cachedAt: Date.now() });
    return value;
}

/** All flags + their current static defaults — used by admin UI. */
export function listFlags(): Array<{ flag: AiFeatureFlag; default: boolean; description: string }> {
    return (Object.entries(FLAG_REGISTRY) as Array<[AiFeatureFlag, FlagDefault]>).map(
        ([flag, def]) => ({ flag, default: def.default, description: def.description }),
    );
}

/** Manually invalidate cached entries — used after admin kill-switch flip. */
export function invalidateFlagCache(flag?: AiFeatureFlag): void {
    if (!flag) {
        CACHE.clear();
        return;
    }
    for (const key of CACHE.keys()) {
        if (key.startsWith(`${flag}:`)) CACHE.delete(key);
    }
}

export const __testing = { envKey, CACHE };
