#!/usr/bin/env node
/**
 * PII scanner — Sprint 0.4.7 + 0.5.8.
 *
 * Greps every prompt file in lib/ai/prompts/ for forbidden patterns:
 *   - Direct field references (deaNumber, npiNumber, race, ethnicity, gender,
 *     dob, ssn, etc.)
 *   - Looks-like-PII regexes (10-digit NPI, DEA letter+digits, SSN dashes)
 *
 * The PII rules in docs/ai-architecture.md §10 are absolute: NONE of these
 * fields may appear in any prompt body or template variable name.
 *
 * One narrow exception: a prompt may NAME a protected attribute in order to
 * forbid its use ("Do NOT infer race, ethnicity, gender..."). That sentence
 * is the anti-bias guardrail the rules ask for, not a reference to applicant
 * data. See isNamedOnlyToForbid for exactly what qualifies. Identifier fields
 * (DEA, NPI, SSN, date of birth) never qualify.
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one violation found (fails CI)
 *   2 — usage error
 */

import path from 'path';
import { promises as fs } from 'fs';
import { listPrompts, loadPrompt } from '@/lib/ai/prompts/registry';
import type { AiTaskId } from '@/lib/ai/types';

interface Violation {
    file: string;
    where: 'system' | 'user_template';
    pattern: string;
    snippet: string;
}

/**
 * Forbidden literals — case-insensitive substring match. These are the field
 * names from UserProfile + applications that should NEVER appear in a prompt.
 */
const FORBIDDEN_FIELD_REFS: ReadonlyArray<string> = [
    'deaNumber', 'dea_number',
    'npiNumber', 'npi_number',
    'ssn', 'social security',
    'dob', 'dateofbirth', 'date_of_birth', 'birthdate', 'birth_date',
    'race', 'ethnicity',
    'gender',                // pronouns are okay; the field name itself isn't
    'sexualorientation', 'sexual_orientation',
    'religion',
    'nationalorigin', 'national_origin',
    'maritalstatus', 'marital_status',
    'veteranstatus', 'veteran_status',
    'disability', 'disabled',
];

/** Pattern matches that resemble actual PII payloads. */
const PII_VALUE_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
    { name: 'NPI 10-digit number',    re: /\b\d{10}\b/ },
    { name: 'DEA registration number', re: /\b[A-Z]{2}\d{7}\b/ },
    { name: 'SSN with dashes',         re: /\b\d{3}-\d{2}-\d{4}\b/ },
];

/**
 * Protected attributes a prompt may name only in order to forbid their use.
 * Identifier fields (DEA, NPI, SSN, date of birth) are deliberately absent: a
 * prompt has no reason to name those even inside a prohibition.
 */
const PROTECTED_ATTRIBUTE_REFS: ReadonlySet<string> = new Set([
    'race', 'ethnicity',
    'gender',
    'sexualorientation', 'sexual_orientation',
    'religion',
    'nationalorigin', 'national_origin',
    'maritalstatus', 'marital_status',
    'veteranstatus', 'veteran_status',
    'disability', 'disabled',
]);

/** Verbs a prohibition can govern: the ways a prompt could use an attribute. */
const RESTRICTION_VERBS = [
    'infer', 'consider', 'use', 'mention', 'assume', 'guess', 'speculate', 'comment', 'extract',
    'ask', 'request', 'collect', 'record', 'store', 'rely', 'factor', 'penalize', 'penalise',
    'reward', 'score', 'judge', 'rank', 'evaluate',
] as const;

/** "Do not" or "never", followed closely by one of those verbs. */
const PROHIBITION = new RegExp(
    `\\b(?:do not|don't|never|must not|may not|should not|shall not)\\b[^.!?;\\n]{0,60}?\\b(?:${RESTRICTION_VERBS.join('|')})\\b`,
    'i',
);

/**
 * The only words allowed between a prohibition and the attribute it bans:
 * the restriction verbs, list glue, and the vocabulary of a protected
 * attribute list. Any other word means the sentence has moved on to a new
 * instruction ("never rank by tenure alone, weigh gender too"), so the
 * attribute is no longer covered by the "never".
 */
const LIST_WORDS: ReadonlySet<string> = new Set([
    ...RESTRICTION_VERBS,
    'on', 'of', 'about', 'from', 'by', 'to', 'or', 'and', 'nor', 'any', 'the', 'a', 'an', 'as', 'in', 'for',
    'into', 'with', 'such', 'like', 'including', 'example', 'based', 'their', "candidate's", "applicant's",
    "person's", "someone's", 'candidate', 'applicant', 'person',
    'protected', 'attribute', 'attributes', 'characteristic', 'characteristics', 'class', 'classes', 'status',
    'age', 'date', 'birth', 'photo', 'photos', 'name', 'names', 'marital', 'sexual', 'orientation', 'veteran',
    'national', 'origin', 'pregnancy', 'citizenship', 'identity',
    'race', 'ethnicity', 'gender', 'religion', 'disability', 'disabled',
]);

function isAttributeList(gap: string): boolean {
    const words = gap.toLowerCase().replace(/\b(?:e\.g|i\.e)\.?/g, ' ').match(/[a-z']+/g) ?? [];
    return words.every((w) => LIST_WORDS.has(w));
}

/**
 * Words that turn a prohibition into a conditional or a second, positive
 * instruction ("do not mention race unless...", "...but do use gender"). A
 * sentence carrying one is not a clean prohibition and gets no exemption.
 */
const EXCEPTION =
    /\b(?:unless|except|instead|but|however|rather|otherwise|if|when|always|do (?:use|include|consider|mention|record|note)|should(?!\s+not\b)|must(?!\s+not\b))\b/i;

/** A following sentence that opens by reversing the one before it. */
const REVERSAL_OPENER = /^[\s\-*•]*(?:instead|however|but|rather|otherwise|unless|except)\b/i;

interface Span { start: number; end: number }

/**
 * Spans of text between boundaries. Sentences end at . ! ? or a newline;
 * clauses also end at a semicolon. "e.g." and "i.e." do not end either.
 */
function splitSpans(text: string, boundary: RegExp): Span[] {
    const spans: Span[] = [];
    // Blank spans (the line break between two bullets) are dropped, so "the
    // next sentence" always means the next one with words in it.
    const push = (start: number, end: number) => {
        if (text.slice(start, end).trim() !== '') spans.push({ start, end });
    };
    let start = 0;
    for (let m = boundary.exec(text); m; m = boundary.exec(text)) {
        const before = text.slice(Math.max(0, m.index - 3), m.index).toLowerCase();
        if (m[0] === '.' && (before === 'e.g' || before === 'i.e')) continue;
        push(start, m.index + 1);
        start = m.index + 1;
    }
    push(start, text.length);
    return spans;
}

interface TextSpans { sentences: Span[]; clauses: Span[] }

function textSpans(text: string): TextSpans {
    return {
        sentences: splitSpans(text, /[.!?](?=\s)|\n/g),
        clauses: splitSpans(text, /[.!?;](?=\s)|\n/g),
    };
}

/** Is this offset inside a {{template variable}}? An unclosed one counts. */
function insidePlaceholder(text: string, index: number): boolean {
    const open = text.lastIndexOf('{{', index);
    if (open < 0) return false;
    const close = text.indexOf('}}', open);
    return close < 0 || close >= index;
}

/**
 * True when a protected attribute at `index` is only being named so the
 * prompt can forbid its use. All of these must hold:
 *   - it is not inside a {{template variable}} (that is a data reference
 *     whatever the sentence around it says);
 *   - its own clause carries an explicit prohibition, the attribute comes
 *     after it ("use gender, and never guess" does not qualify), and only
 *     list words sit between the two (see LIST_WORDS);
 *   - the whole sentence carves out no exception and adds no positive
 *     instruction, and the next sentence does not open by reversing it
 *     ("Never assume gender; instead infer it from the name").
 * Anything else stays a violation, so a prompt that needs more has to declare
 * `_pii_scan_allow` with a reason, where a reviewer will see it.
 */
function isNamedOnlyToForbid(text: string, index: number, spans: TextSpans): boolean {
    if (insidePlaceholder(text, index)) return false;
    const within = (s: Span) => index >= s.start && index < s.end;
    const clause = spans.clauses.find(within);
    const sentenceAt = spans.sentences.findIndex(within);
    if (!clause || sentenceAt < 0) return false;

    const prohibition = PROHIBITION.exec(text.slice(clause.start, clause.end));
    if (!prohibition) return false;
    const listStart = clause.start + prohibition.index + prohibition[0].length;
    if (index < listStart) return false;
    if (!isAttributeList(text.slice(listStart, index))) return false;

    const sentence = spans.sentences[sentenceAt];
    if (EXCEPTION.test(text.slice(sentence.start, sentence.end))) return false;
    const next = spans.sentences[sentenceAt + 1];
    return !(next && REVERSAL_OPENER.test(text.slice(next.start, next.end)));
}

function findViolations(
    file: string,
    where: 'system' | 'user_template',
    text: string,
    allow: ReadonlySet<string>,
): Violation[] {
    const found: Violation[] = [];
    const lower = text.toLowerCase();
    const spans = textSpans(text);

    for (const ref of FORBIDDEN_FIELD_REFS) {
        const needle = ref.toLowerCase();
        if (allow.has(needle)) continue;
        const exemptable = PROTECTED_ATTRIBUTE_REFS.has(needle);
        // Every occurrence is checked, not only the first: a guardrail line
        // near the top must not hide a real reference further down. One
        // violation per pattern keeps the report readable.
        for (let idx = lower.indexOf(needle); idx >= 0; idx = lower.indexOf(needle, idx + 1)) {
            if (exemptable && isNamedOnlyToForbid(text, idx, spans)) continue;
            const snippet = text.slice(Math.max(0, idx - 30), idx + ref.length + 30);
            found.push({ file, where, pattern: `field:${ref}`, snippet });
            break;
        }
    }

    for (const { name, re } of PII_VALUE_PATTERNS) {
        const m = re.exec(text);
        if (m) {
            const snippet = text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
            found.push({ file, where, pattern: name, snippet });
        }
    }

    return found;
}

/** Scan every registered prompt version. Shared by the CLI and the test suite. */
async function scanAllPrompts(): Promise<{ scanned: number; violations: Violation[] }> {
    const prompts = await listPrompts();
    let scanned = 0;
    let violations: Violation[] = [];
    for (const entry of prompts) {
        for (const v of entry.versions) {
            const file = path.join('lib', 'ai', 'prompts', entry.task, `${v}.json`);
            const loaded = await loadPrompt(entry.task as AiTaskId, v);

            // Read the raw JSON to honor a per-prompt `_pii_scan_allow` array.
            // Prompts that LEGITIMATELY need to extract a forbidden field (e.g.,
            // resume_parsing extracts npiNumber + deaNumber as professional
            // credentials) declare the exemption + reason inline. The scanner
            // reads this list and skips matching entries; everything else
            // remains strict.
            const raw = JSON.parse(await fs.readFile(file, 'utf-8')) as { _pii_scan_allow?: string[] };
            const allow = new Set((raw._pii_scan_allow ?? []).map((s) => s.toLowerCase()));

            violations = violations.concat(findViolations(file, 'system',        loaded.rawSystem,         allow));
            violations = violations.concat(findViolations(file, 'user_template', loaded.rawUserTemplate,   allow));
            scanned++;
        }
    }
    return { scanned, violations };
}

async function main(): Promise<void> {
    const { scanned, violations: total } = await scanAllPrompts();
    if (scanned === 0) {
        console.log('[pii-scan] No prompts registered. Skipping.');
        process.exit(0);
    }

    if (total.length === 0) {
        console.log(`[pii-scan] PASS — ${scanned} prompt files scanned, no violations.`);
        process.exit(0);
    }

    console.error('[pii-scan] FAIL — forbidden patterns detected:\n');
    for (const v of total) {
        console.error(`  ✗ ${v.file} (${v.where})`);
        console.error(`     pattern: ${v.pattern}`);
        console.error(`     near:    ${v.snippet.replace(/\n/g, ' ⏎ ')}\n`);
    }
    console.error(`\n[pii-scan] ${total.length} violation(s). See docs/ai-architecture.md §10 for the PII handling rules.`);
    process.exit(1);
}

// Only run when invoked as a script (npm run lint:pii-prompts). Importing
// from a test must NOT trigger the scan.
if (typeof require !== 'undefined' && require.main === module) {
    main().catch((err) => {
        console.error('[pii-scan] error', err);
        process.exit(2);
    });
}

// Exposed for unit tests.
export const __testing = {
    findViolations: (file: string, where: 'system' | 'user_template', text: string, allow: ReadonlySet<string> = new Set()) =>
        findViolations(file, where, text, allow),
    scanAllPrompts,
    FORBIDDEN_FIELD_REFS,
    PII_VALUE_PATTERNS,
};
