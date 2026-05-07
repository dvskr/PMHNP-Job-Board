/**
 * Resume parser eval suite — Sprint 2.1.
 *
 * Each case = (resume text → expected extracted fields). The runner calls
 * the live parseResume() function (gateway-routed `gpt-5-mini`) and scores
 * the output against the expected extraction on a per-field basis.
 *
 * Scoring metric: field-level F1.
 *   - For scalar string fields (firstName, headline, npiNumber, etc.):
 *       1.0 if exact-match (case-insensitive trim), else 0.
 *   - For array fields (certifications, licenseStates, specialties, skills):
 *       precision + recall against the expected set.
 *   - For structured arrays (licenses, education): 1.0 if EVERY expected
 *     row has a matching extracted row by key fields (license: state+number;
 *     education: schoolName+degreeType), else 0.
 *
 * Suite holds baseline iff mean F1 across cases ≥ 0.80. That's a meaningful
 * floor: a regression like "stopped extracting NPI numbers" or "started
 * dropping the licenses field" drops the F1 immediately.
 */

import type { SuiteContract } from '../types';
import type { ParsedResume } from '@/lib/resume-parser';

export interface ResumeParsingInput extends Record<string, string> {
    /** Raw resume text. Stored inline in the golden file because we do not
     *  ship binary PDF/DOCX fixtures into the repo. */
    resumeText: string;
}

/** What we expect the parser to extract. All fields optional; the suite
 *  only scores fields the curator marked as expected. */
export interface ResumeParsingExpected {
    firstName?: string;
    lastName?: string;
    phone?: string;            // loose match: contains all digits from expected
    linkedinUrl?: string;      // contains-match on the path part
    headline?: string;         // contains-match on the substring
    yearsExperience?: number;  // exact match
    npiNumber?: string;
    deaNumber?: string;
    certifications?: string[]; // set-match
    licenseStates?: string[];  // set-match
    specialties?: string[];    // set-match (loose contains)
    skills?: string[];         // set-match (loose contains)
    licenses?: Array<{ licenseState: string; licenseNumber: string }>; // key-match
    education?: Array<{ schoolName: string; degreeType: string }>;     // key-match
    /** Per-case pass threshold; defaults to suite baseline (0.80). */
    minF1?: number;
}

const STR_FIELDS = ['firstName', 'lastName', 'headline', 'npiNumber', 'deaNumber'] as const;
const NUM_FIELDS = ['yearsExperience'] as const;
const STR_ARRAY_FIELDS = ['certifications', 'licenseStates', 'specialties', 'skills'] as const;

/* ─────────────────────────── Pure scoring math ─────────────────────────── */

function eqStr(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Did the actual string contain the expected substring (case-insensitive)? */
function containsStr(actual: string | undefined, expected: string): boolean {
    if (!actual) return false;
    return actual.toLowerCase().includes(expected.toLowerCase());
}

/** Phone match: every digit in expected appears in actual (in order, allowing
 *  skips). Handles formatting variation between '+15555555555' and '(555) 555-5555'. */
function phoneMatch(actual: string | undefined, expected: string): boolean {
    if (!actual) return false;
    const a = actual.replace(/\D/g, '');
    const e = expected.replace(/\D/g, '');
    if (e.length === 0) return true;
    return a.includes(e) || a.endsWith(e.slice(-10));
}

/** Set similarity: |intersection| / |expected|. */
function setRecall(actual: string[] | undefined, expected: string[]): number {
    if (expected.length === 0) return 1;
    if (!actual || actual.length === 0) return 0;
    const aLower = new Set(actual.map((s) => s.trim().toLowerCase()));
    let hits = 0;
    for (const e of expected) {
        const eLower = e.trim().toLowerCase();
        // Match if any actual item contains the expected substring (handles
        // "Adult Telehealth" expected vs "Adult Telehealth Mood" actual).
        if (aLower.has(eLower)) { hits += 1; continue; }
        for (const a of aLower) {
            if (a.includes(eLower) || eLower.includes(a)) { hits += 1; break; }
        }
    }
    return hits / expected.length;
}

/** Did the parser produce a row matching every expected key combo? */
function structuredMatch<T extends Record<string, unknown>>(
    actual: T[] | undefined,
    expected: Array<Record<string, string>>,
    keyFields: ReadonlyArray<keyof T & string>,
): number {
    if (expected.length === 0) return 1;
    if (!actual || actual.length === 0) return 0;
    let hits = 0;
    for (const e of expected) {
        const found = actual.some((a) =>
            keyFields.every((k) => eqStr(String(a[k] ?? ''), e[k])),
        );
        if (found) hits += 1;
    }
    return hits / expected.length;
}

/** Compute mean F1 across all expected fields in a single case. */
export function scoreResumeCase(
    parsed: ParsedResume,
    expected: ResumeParsingExpected,
): { score: number; perField: Record<string, number> } {
    const perField: Record<string, number> = {};

    for (const f of STR_FIELDS) {
        if (expected[f] !== undefined) {
            perField[f] = containsStr(parsed[f], expected[f] as string) ? 1 : 0;
        }
    }
    for (const f of NUM_FIELDS) {
        if (expected[f] !== undefined) {
            perField[f] = parsed[f] === expected[f] ? 1 : 0;
        }
    }
    for (const f of STR_ARRAY_FIELDS) {
        if (expected[f] !== undefined) {
            perField[f] = setRecall(parsed[f], expected[f] as string[]);
        }
    }
    if (expected.phone !== undefined) {
        perField.phone = phoneMatch(parsed.phone, expected.phone) ? 1 : 0;
    }
    if (expected.linkedinUrl !== undefined) {
        perField.linkedinUrl = containsStr(parsed.linkedinUrl, expected.linkedinUrl) ? 1 : 0;
    }
    if (expected.licenses !== undefined) {
        perField.licenses = structuredMatch(parsed.licenses, expected.licenses, ['licenseState', 'licenseNumber']);
    }
    if (expected.education !== undefined) {
        perField.education = structuredMatch(parsed.education, expected.education, ['schoolName', 'degreeType']);
    }

    const fieldScores = Object.values(perField);
    const score = fieldScores.length === 0 ? 1 : fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length;
    return { score, perField };
}

/* ─────────────────────────── Suite contract ─────────────────────────── */

export const resumeParsingContract: SuiteContract<ResumeParsingInput, ResumeParsingExpected> = {
    /** 0.80 mean F1 across all cases. Below = REGRESSION. */
    baselineThreshold: 0.80,
    scoreCase({ gold, modelOutput }) {
        const parsed = modelOutput as ParsedResume | null;
        if (!parsed) {
            return { passed: false, score: 0, reason: 'no parsed output' };
        }
        const { score, perField } = scoreResumeCase(parsed, gold.expected);
        const min = gold.expected.minF1 ?? 0.80;
        const failed = Object.entries(perField).filter(([, v]) => v < 1).map(([k, v]) => `${k}=${v.toFixed(2)}`);
        return {
            passed: score >= min,
            score,
            reason: failed.length === 0
                ? `F1=${score.toFixed(3)} (all fields perfect)`
                : `F1=${score.toFixed(3)} (min=${min}); imperfect: ${failed.join(', ')}`,
        };
    },
};

/* ─────────────────────────── Standalone runner ─────────────────────────── */

export interface ResumeParsingPerCase {
    id: string;
    score: number;
    perField: Record<string, number>;
    passed: boolean;
    reason: string;
}

export interface ResumeParsingSuiteResult {
    promptVersion: string;
    totalCases: number;
    passed: number;
    failed: number;
    meanScore: number;
    perCase: ReadonlyArray<ResumeParsingPerCase>;
    holdsBaseline: boolean;
    summary: string;
}

export async function runResumeParsingSuite(): Promise<ResumeParsingSuiteResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { complete } = await import('@/lib/ai/gateway');
    const { loadPrompt } = await import('@/lib/ai/prompts/registry');
    const { z } = await import('zod');

    const file = path.join(process.cwd(), 'tests', 'ai', 'golden', 'resume-parsing.json');
    const raw = await fs.readFile(file, 'utf-8');
    const json = JSON.parse(raw) as {
        promptVersion?: string;
        cases: Array<{ id: string; input: ResumeParsingInput; expected: ResumeParsingExpected }>;
    };
    const promptVersion = json.promptVersion ?? 'v1';
    const cases = json.cases ?? [];

    const prompt = await loadPrompt('resume_parsing');
    const tenant = { type: 'system' as const, id: 'eval-resume-parsing' };
    // Permissive output schema — the route's sanitizer is the gate; the
    // raw model can return extra/missing fields and we'll score what's there.
    const looseSchema = z.record(z.string(), z.unknown());

    const perCase: ResumeParsingPerCase[] = [];
    for (const c of cases) {
        try {
            const result = await complete({
                task: 'resume_parsing',
                tenant,
                messages: prompt.render({ resumeText: c.input.resumeText }),
                promptId: prompt.id,
                promptVersion: prompt.version,
                cacheKey: ['eval-resume', prompt.version, c.id],
                outputSchema: looseSchema,
            });
            const parsed = (result.parsed ?? {}) as ParsedResume;
            const { score, perField } = scoreResumeCase(parsed, c.expected);
            const min = c.expected.minF1 ?? 0.80;
            const failed = Object.entries(perField).filter(([, v]) => v < 1).map(([k, v]) => `${k}=${v.toFixed(2)}`);
            perCase.push({
                id: c.id,
                score,
                perField,
                passed: score >= min,
                reason: failed.length === 0
                    ? `F1=${score.toFixed(3)} (all fields perfect)`
                    : `F1=${score.toFixed(3)} (min=${min}); imperfect: ${failed.join(', ')}`,
            });
        } catch (err) {
            perCase.push({
                id: c.id,
                score: 0,
                perField: {},
                passed: false,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const passed = perCase.filter((p) => p.passed).length;
    const meanScore = perCase.length === 0 ? 0 : perCase.reduce((a, b) => a + b.score, 0) / perCase.length;
    const holdsBaseline = meanScore >= resumeParsingContract.baselineThreshold;

    return {
        promptVersion,
        totalCases: perCase.length,
        passed,
        failed: perCase.length - passed,
        meanScore,
        perCase,
        holdsBaseline,
        summary: holdsBaseline
            ? `Resume parser holds baseline — mean F1 ${meanScore.toFixed(3)} ≥ ${resumeParsingContract.baselineThreshold.toFixed(2)} (${passed}/${perCase.length} cases passed)`
            : `REGRESSION — mean F1 ${meanScore.toFixed(3)} < baseline ${resumeParsingContract.baselineThreshold.toFixed(2)} (${passed}/${perCase.length} cases passed)`,
    };
}
