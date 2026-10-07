/**
 * Tests for the PII scanner findViolations() function. Doesn't run the CLI —
 * just validates the detection logic.
 */

import { describe, it, expect } from 'vitest';
import { __testing } from '@/scripts/scan-prompt-pii';

describe('PII scanner', () => {
    it('flags forbidden field references (case-insensitive)', () => {
        const violations = __testing.findViolations('test.json', 'system', 'Include the candidate deaNumber if present.');
        expect(violations.some((v) => v.pattern === 'field:deaNumber')).toBe(true);
    });

    it('flags raw 10-digit NPI numbers in the prompt body', () => {
        const violations = __testing.findViolations('test.json', 'user_template', 'Their identifier is 1234567890 — please review.');
        expect(violations.some((v) => v.pattern.includes('NPI'))).toBe(true);
    });

    it('flags DEA-shaped strings (XX9999999)', () => {
        const violations = __testing.findViolations('test.json', 'system', 'DEA AB1234567 must be checked.');
        expect(violations.some((v) => v.pattern.includes('DEA'))).toBe(true);
    });

    it('flags SSN-shaped strings', () => {
        const violations = __testing.findViolations('test.json', 'system', 'SSN 123-45-6789 should never appear here.');
        expect(violations.some((v) => v.pattern.includes('SSN'))).toBe(true);
    });

    it('flags demographic field references (race, ethnicity, gender)', () => {
        const violations = __testing.findViolations('test.json', 'system', 'Score uses race and ethnicity.');
        expect(violations.some((v) => v.pattern === 'field:race')).toBe(true);
        expect(violations.some((v) => v.pattern === 'field:ethnicity')).toBe(true);
    });

    it('does NOT flag clean prompt content', () => {
        const violations = __testing.findViolations('test.json', 'system', 'Score the candidate based on certifications and license states.');
        expect(violations).toEqual([]);
    });
});

/**
 * A prompt has to be able to say "do not infer race, ethnicity, gender...".
 * That sentence is the anti-bias guardrail the PII rules ask for, and the
 * scanner used to fail it as if it were a reference to applicant data, which
 * kept the AI quality gate red from 2026-07-28. The exemption is deliberately
 * narrow: these tests pin every way it must NOT open up.
 */
describe('PII scanner: protected attributes named only to forbid their use', () => {
    const scan = (text: string) => __testing.findViolations('test.json', 'system', text).map((v) => v.pattern);

    // The two guardrail lines as they ship in the resume prompts.
    const REVIEW_GUARDRAIL = '- Do NOT comment on, extract, or infer: race, ethnicity, gender, age, date of birth, religion, marital status, sexual orientation, disability status, veteran status, national origin, photos, or any protected attribute.';
    const TAILORING_GUARDRAIL = '- Do NOT comment on, extract, or infer any protected attribute (race, ethnicity, gender, age, religion, disability, veteran status, national origin, marital status, sexual orientation).';

    it.each([REVIEW_GUARDRAIL, TAILORING_GUARDRAIL])('accepts an explicit prohibition: %s', (line) => {
        expect(scan(`Rules:\n- Be concise.\n${line}\n- Return JSON only.`)).toEqual([]);
    });

    it.each([
        'Never consider race or gender in a score.',
        'You must not use disability or religion as a signal.',
        'Do not infer protected attributes (e.g. race, ethnicity, gender).',
    ])('accepts other clear prohibitions: %s', (line) => {
        expect(scan(line)).toEqual([]);
    });

    it('still flags the same words in an instruction to use them', () => {
        expect(scan('Consider the gender and race of the candidate.')).toEqual(['field:race', 'field:gender']);
    });

    it('flags a later use even when a prohibition comes first', () => {
        expect(scan(`${REVIEW_GUARDRAIL}\n- Then note the applicant's race in the summary.`)).toContain('field:race');
    });

    it('scopes the exemption to its own sentence', () => {
        expect(scan('Do not infer anything about the reader. Rank by gender.')).toEqual(['field:gender']);
        expect(scan('Do not score on tone; weigh ethnicity.')).toEqual(['field:ethnicity']);
    });

    it('flags a word that comes before the prohibition in the same sentence', () => {
        expect(scan('Weigh gender heavily and do not infer anything else.')).toEqual(['field:gender']);
    });

    it.each([
        'Do not mention race unless the resume states it.',
        'Do not infer gender except from stated pronouns.',
        'Do not guess religion, but do use ethnicity.',
        'Never assume gender; instead infer it from the name.',
        'Do not mention disability if the job is remote.',
        'Do not infer race and always record gender.',
        'Do not infer race and you should note gender.',
    ])('flags a prohibition that carves out an exception: %s', (line) => {
        expect(scan(line).length).toBeGreaterThan(0);
    });

    it.each([
        ['Never rank by tenure alone, weigh gender too.', 'field:gender'],
        ['Do not use seniority to sort, sort by race.', 'field:race'],
        ['Do not comment on tone, and make sure the summary states religion.', 'field:religion'],
    ])('flags a sentence that moves on from the prohibition: %s', (line, pattern) => {
        expect(scan(line)).toEqual([pattern]);
    });

    it('accepts a prohibition whose list is introduced with ordinary list words', () => {
        expect(scan('Do not infer, from a name or photo, the race or religion of a candidate.')).toEqual([]);
        expect(scan('Never use protected characteristics such as gender, disability, or ethnicity.')).toEqual([]);
    });

    it('flags a prohibition that the next sentence reverses', () => {
        expect(scan('Never assume gender. Instead, infer it from the name.')).toEqual(['field:gender']);
        expect(scan('- Do not mention religion.\n- However, weigh it when it is stated.')).toEqual(['field:religion']);
    });

    it('is not put off by an unrelated sentence that follows', () => {
        expect(scan('Do not infer race, ethnicity or gender. Return JSON only.')).toEqual([]);
    });

    it('does not treat every "do not" as a ban on use', () => {
        expect(scan('Do not forget to include gender in the summary.')).toEqual(['field:gender']);
    });

    it('flags a template variable even inside a prohibition', () => {
        expect(scan('Do not infer {{gender}} from the name.')).toEqual(['field:gender']);
        expect(scan('Never use {{ candidate_race }} in the score.')).toEqual(['field:race']);
    });

    it('never exempts identifier fields, even in a prohibition', () => {
        const found = scan('Do not ask for the SSN, the deaNumber, the npiNumber or the dob.');
        expect(found).toEqual(expect.arrayContaining(['field:ssn', 'field:deaNumber', 'field:npiNumber', 'field:dob']));
    });

    it('keeps the per-prompt allow list working as before', () => {
        const found = __testing.findViolations('test.json', 'system', 'Extract the npiNumber.', new Set(['npinumber']));
        expect(found).toEqual([]);
    });
});

describe('PII scanner: every registered prompt', () => {
    it('passes, so a prompt that fails the scan fails the test suite and not only the nightly gate', async () => {
        const { scanned, violations } = await __testing.scanAllPrompts();
        expect(scanned).toBeGreaterThan(0);
        expect(violations.map((v) => `${v.file} (${v.where}) ${v.pattern}`)).toEqual([]);
    });
});
