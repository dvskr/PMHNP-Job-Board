/**
 * Shared LLM extractor for job descriptions.
 *
 * Used by:
 *   - app/api/cron/enrich-jobs/route.ts (batched post-publish enrichment)
 *   - lib/ingestion-service.ts (inline borderline-completeness rescue)
 *
 * Returns parsed structured fields when GPT-5-mini can find them, null
 * otherwise. Callers decide what to do with the result (merge into
 * existing record, etc.) — this module just does the extraction.
 *
 * Routed through the AI gateway (task `jd_enrichment` in lib/ai/tasks.ts)
 * so calls get ai_call_log cost tracking, Redis caching, rate limiting, and
 * the circuit breaker for free. Model + timeout live in the task registry.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { complete } from './ai/gateway';
import { AiGatewayError } from './ai/types';
import { ENRICHMENT_BOUNDS } from './salary-bounds';

// Loose shape check passed to the gateway as outputSchema. Its real job is
// pre-cache validation: without it the gateway caches raw provider content,
// so an empty/truncated response (e.g. the model burning its token budget
// on reasoning) became a sticky null for the full cache TTL. Any JSON
// object passes; empty/malformed content throws invalid_output BEFORE the
// cache write and is retried on the next attempt.
const EXTRACT_OUTPUT_SCHEMA = z.object({}).passthrough();

export interface LLMExtractResult {
    salary_min?: number;
    salary_max?: number;
    salary_period?: string;
    job_type?: string;
    work_mode?: string;
    city?: string;
    state?: string;
    experience_level?: string;
    clinical_setting?: string;
    patient_population?: string;
    benefits?: string[];
}

export interface LLMExtractResponse {
    result: LLMExtractResult | null;
    inputTokens: number;
    outputTokens: number;
    elapsedMs: number;
}

const SYSTEM_PROMPT = `You extract structured job posting data. Return JSON with ONLY fields you can CONFIDENTLY find. Never guess or fabricate.

Fields:
- salary_min: number, minimum annual salary in USD. Convert: hourly×2080, monthly×12, weekly×52
- salary_max: number, maximum annual salary in USD
- salary_period: "hour", "month", or "year" (original unit BEFORE conversion)
- job_type: "Full-Time", "Part-Time", "Contract", "Per Diem", or "PRN"
- work_mode: EXACTLY ONE of "Remote", "Hybrid", "In-Person" (use these strings verbatim — do NOT use "On-site", "Onsite", "Telehealth", or other variants; map "Telehealth" to "Remote" and "On-site"/"Onsite" to "In-Person")
- city: string, job city (not employer HQ)
- state: string, full US state name
- experience_level: "Entry Level", "Mid Level", "Senior Level", or "Director"
- clinical_setting: e.g. "Outpatient", "Inpatient", "Residential", "Emergency", "Community Health", "Private Practice", "Correctional", "Telehealth", "Hospital"
- patient_population: e.g. "Adults", "Children", "Adolescents", "Geriatric", "All Ages", "Veterans", "Substance Abuse"
- benefits: string array, e.g. ["Health Insurance", "401k", "PTO", "CME Allowance", "Malpractice Coverage", "Student Loan Repayment", "Signing Bonus", "Relocation Assistance"]

Rules:
- ONLY include if explicitly stated in text
- Salary must be $${ENRICHMENT_BOUNDS.annualMin / 1000}k-$${ENRICHMENT_BOUNDS.annualMax / 1000}k/yr range for PMHNP roles
- Return {} if nothing found`;

// Cache-buster — any edit to the inline system prompt above invalidates
// previously cached completions without needing a manual version bump.
const SYSTEM_PROMPT_HASH = createHash('sha256').update(SYSTEM_PROMPT).digest('hex').slice(0, 12);

export async function extractWithLLM(
    description: string,
    title: string,
    employer: string,
    location: string,
): Promise<LLMExtractResponse> {
    const start = Date.now();
    // Preserve the pre-gateway contract: no key configured → quiet no-op
    // (no rate-limit consumption, no ai_call_log noise, no failed-call rows).
    if (!process.env.OPENAI_API_KEY) {
        return { result: null, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
    }
    try {
        const truncated = description.substring(0, 2500);
        const userContent = `Title: ${title}\nEmployer: ${employer}\nLocation: ${location}\n\n${truncated}`;
        // Hash the FULL user message (not just the description) — two jobs
        // with identical bodies but different title/employer/location must
        // not share a cache entry.
        const inputHash = createHash('sha256').update(userContent).digest('hex').slice(0, 12);

        const response = await complete({
            task: 'jd_enrichment',
            tenant: { type: 'system', id: 'llm-enrichment' },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent },
            ],
            cacheKey: ['jd_enrichment', SYSTEM_PROMPT_HASH, inputHash],
            outputSchema: EXTRACT_OUTPUT_SCHEMA,
        });

        const inputTokens = response.usage.inputTokens;
        const outputTokens = response.usage.outputTokens;
        const elapsedMs = Date.now() - start;

        if (!response.content) return { result: null, inputTokens, outputTokens, elapsedMs };

        const parsed = JSON.parse(response.content) as LLMExtractResult;

        // Validate salary range — toss obviously wrong values rather than letting them through.
        // Same bounds as the prompt text above (both derive from ENRICHMENT_BOUNDS).
        if (parsed.salary_min && (parsed.salary_min < ENRICHMENT_BOUNDS.annualMin || parsed.salary_min > ENRICHMENT_BOUNDS.annualMax)) {
            delete parsed.salary_min;
            delete parsed.salary_max;
            delete parsed.salary_period;
        }

        const result = Object.keys(parsed).length > 0 ? parsed : null;
        return { result, inputTokens, outputTokens, elapsedMs };
    } catch (err) {
        // Infrastructure failures (rate limit, breaker open / all providers
        // down, timeout) are RETHROWN so callers don't mistake "the gateway
        // was unavailable" for "the LLM found nothing" — enrich-jobs stamps
        // lastEnrichedAt on null results, which would permanently skip the
        // job. Both callers handle rejection (the cron skips the DB write,
        // the ingest rescue is try/catch-wrapped).
        if (
            err instanceof AiGatewayError &&
            (err.code === 'rate_limited' || err.code === 'all_providers_failed' || err.code === 'timeout')
        ) {
            throw err;
        }
        // Content-level failures (invalid_output, JSON parse, misconfig)
        // keep the null contract: deterministic "no enrichment".
        return { result: null, inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - start };
    }
}
