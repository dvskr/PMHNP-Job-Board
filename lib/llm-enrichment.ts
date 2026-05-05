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
 */

import OpenAI from 'openai';

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
- Salary must be $40k-$500k/yr range for PMHNP roles
- Return {} if nothing found`;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openai;
}

export interface ExtractWithLLMOptions {
    /** Per-call timeout (ms). Default 8s — caller should always set this for inline use. */
    timeoutMs?: number;
}

export async function extractWithLLM(
    description: string,
    title: string,
    employer: string,
    location: string,
    options: ExtractWithLLMOptions = {},
): Promise<LLMExtractResponse> {
    const start = Date.now();
    const openai = getOpenAI();
    if (!openai) {
        return { result: null, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
    }
    const { timeoutMs = 8000 } = options;
    try {
        const truncated = description.substring(0, 2500);

        const response = await openai.chat.completions.create({
            model: 'gpt-5-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Title: ${title}\nEmployer: ${employer}\nLocation: ${location}\n\n${truncated}`,
                },
            ],
            max_completion_tokens: 4096,
        }, {
            // Hard wall on per-call latency. Without this, a hung OpenAI
            // request can starve the orchestrator's 240s ingest budget.
            // 8s is generous — typical gpt-5-mini calls return in 1-2s.
            timeout: timeoutMs,
        });

        const inputTokens = response.usage?.prompt_tokens || 0;
        const outputTokens = response.usage?.completion_tokens || 0;
        const elapsedMs = Date.now() - start;

        const content = response.choices[0]?.message?.content;
        if (!content) return { result: null, inputTokens, outputTokens, elapsedMs };

        const parsed = JSON.parse(content) as LLMExtractResult;

        // Validate salary range — toss obviously wrong values rather than letting them through.
        if (parsed.salary_min && (parsed.salary_min < 40000 || parsed.salary_min > 500000)) {
            delete parsed.salary_min;
            delete parsed.salary_max;
            delete parsed.salary_period;
        }

        const result = Object.keys(parsed).length > 0 ? parsed : null;
        return { result, inputTokens, outputTokens, elapsedMs };
    } catch {
        return { result: null, inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - start };
    }
}
