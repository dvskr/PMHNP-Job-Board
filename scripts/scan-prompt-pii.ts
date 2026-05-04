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

function findViolations(
    file: string,
    where: 'system' | 'user_template',
    text: string,
    allow: ReadonlySet<string>,
): Violation[] {
    const found: Violation[] = [];
    const lower = text.toLowerCase();

    for (const ref of FORBIDDEN_FIELD_REFS) {
        if (allow.has(ref.toLowerCase())) continue;
        const idx = lower.indexOf(ref.toLowerCase());
        if (idx >= 0) {
            const snippet = text.slice(Math.max(0, idx - 30), idx + ref.length + 30);
            found.push({ file, where, pattern: `field:${ref}`, snippet });
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

async function main(): Promise<void> {
    const prompts = await listPrompts();
    if (prompts.length === 0) {
        console.log('[pii-scan] No prompts registered. Skipping.');
        process.exit(0);
    }

    let total: Violation[] = [];
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

            total = total.concat(findViolations(file, 'system',        loaded.rawSystem,         allow));
            total = total.concat(findViolations(file, 'user_template', loaded.rawUserTemplate,   allow));
        }
    }

    if (total.length === 0) {
        console.log(`[pii-scan] PASS — ${prompts.reduce((a, b) => a + b.versions.length, 0)} prompt files scanned, no violations.`);
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
    FORBIDDEN_FIELD_REFS,
    PII_VALUE_PATTERNS,
};
