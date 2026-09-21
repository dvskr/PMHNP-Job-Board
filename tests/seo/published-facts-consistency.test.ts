/**
 * The site must not contradict itself about a published fact.
 *
 * Answer engines read FAQ markup, salary pages and licensure content and
 * reconcile them into one claim about the entity. When those surfaces disagree,
 * the site stops being quotable: this is an E-E-A-T problem long before it is
 * a schema problem.
 *
 * Two contradictions were live until 2026-09-21, both inside FAQPage JSON-LD:
 *
 *   Full Practice Authority count. lib/state-practice-authority.ts listed 25
 *   states plus DC, its own header comment claimed "27 states + DC",
 *   lib/stats-sources.ts also claimed "27 states + DC", and
 *   content/blog/pmhnp-private-practice-salary.mdx published "28 states + DC"
 *   in prose twice and once inside its FAQ schema. The practice-authority map
 *   and the sentence printed beside it disagreed.
 *
 *   National average salary. lib/salary-stats.ts declared an unsourced
 *   $158,000 while lib/stats-sources.ts declared a cited $155,000, and both
 *   rendered as "the national average" on different pages.
 *
 * Both are now derived from one place. These tests pin that, and pin the
 * honesty rule that came with them: BLS OEWS 29-1171 covers nurse
 * practitioners of every specialty, so a figure taken from it may not be
 * presented as a PMHNP salary.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { STAT_SOURCES } from '@/lib/stats-sources';
import {
    STATE_PRACTICE_AUTHORITY,
    FULL_PRACTICE_COUNT,
    FULL_PRACTICE_STATE_COUNT,
    FULL_PRACTICE_SUMMARY,
} from '@/lib/state-practice-authority';
import {
    NATIONAL_AVG_PMHNP_SALARY,
    NATIONAL_AVG_PMHNP_SALARY_FORMATTED,
} from '@/lib/salary-stats';

const ROOT = path.resolve(__dirname, '../../');

/** Every .ts/.tsx/.mdx a reader or crawler can reach. */
function contentFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(tsx?|mdx)$/.test(entry.name)) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
        }
    };
    for (const root of ['app', 'components', 'lib', 'content']) walk(path.join(ROOT, root));
    return out;
}

describe('Full Practice Authority count is derived, not retyped', () => {
    it('matches the jurisdictions actually classified as full', () => {
        const actual = Object.values(STATE_PRACTICE_AUTHORITY).filter((s) => s.authority === 'full').length;
        expect(FULL_PRACTICE_COUNT).toBe(actual);
        expect(FULL_PRACTICE_STATE_COUNT).toBe(actual - 1); // the table includes DC
    });

    it('the stats source quotes the derived summary rather than its own number', () => {
        expect(STAT_SOURCES.fullPracticeStates.formatted).toBe(FULL_PRACTICE_SUMMARY);
        expect(STAT_SOURCES.fullPracticeStates.value).toBe(String(FULL_PRACTICE_STATE_COUNT));
    });

    it('covers every US jurisdiction, so the count is over a complete table', () => {
        // A partial table would make a derived count quietly wrong rather than
        // loudly wrong, which is worse.
        expect(Object.keys(STATE_PRACTICE_AUTHORITY)).toHaveLength(51);
    });

    it('no page or article retypes an FPA jurisdiction count', () => {
        // "28 states + DC", "27 states and DC", "34 states + DC" and friends.
        // "50 states + DC" and "51" are excluded: those describe complete US
        // coverage ("All 50 States + DC by Practice Authority"), which is a
        // different claim and is not at risk of drifting.
        const RETYPED = /\b(\d{1,2})\s+(?:states?|jurisdictions?)\s*(?:\+|plus|and)\s*(?:DC|D\.C\.|the District of Columbia)/gi;
        const TOTALS = new Set(['50', '51']);
        const offenders: string[] = [];
        for (const rel of contentFiles()) {
            if (rel === 'lib/state-practice-authority.ts') continue; // derives it
            const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
            src.split('\n').forEach((line, index) => {
                // Engineering notes may describe the history; copy may not.
                if (/^\s*(\*|\/\/)/.test(line)) return;
                for (const m of line.matchAll(RETYPED)) {
                    if (!TOTALS.has(m[1])) offenders.push(`${rel}:${index + 1}  ${line.trim().slice(0, 110)}`);
                }
            });
        }
        expect(
            offenders,
            'these files hardcode a Full Practice Authority count instead of using ' +
                `FULL_PRACTICE_SUMMARY (currently "${FULL_PRACTICE_SUMMARY}"):\n  ${offenders.join('\n  ')}`,
        ).toEqual([]);
    });
});

describe('one national salary figure, and it is cited', () => {
    it('salary-stats re-exports the sourced figure instead of declaring its own', () => {
        expect(NATIONAL_AVG_PMHNP_SALARY).toBe(Number(STAT_SOURCES.npAverageSalaryBls.value));
        expect(NATIONAL_AVG_PMHNP_SALARY_FORMATTED).toBe(STAT_SOURCES.npAverageSalaryBls.formatted);
    });

    it('the retired unsourced constant is gone', () => {
        const src = fs.readFileSync(path.join(ROOT, 'lib/salary-stats.ts'), 'utf8');
        // A numeric literal assignment, not the doc comment that records why
        // the old one was removed.
        expect(src).not.toMatch(/const\s+NATIONAL_AVG_PMHNP_SALARY\s*=\s*\d/);
        expect(src).toMatch(/from '\.\/stats-sources'/);
    });

    it('carries a source and a date, because an uncited figure is not quotable', () => {
        expect(STAT_SOURCES.npAverageSalaryBls.source).toMatch(/BLS OEWS/);
        expect(STAT_SOURCES.npAverageSalaryBls.sourceUrl).toMatch(/^https:\/\/www\.bls\.gov\//);
        expect(STAT_SOURCES.npAverageSalaryBls.asOf).toMatch(/^\d{4}(-\d{2})?$/);
    });

    it('is named and described as the all-specialty NP figure it is', () => {
        // BLS does not break out psychiatric mental health NPs. Presenting this
        // as a PMHNP salary attributes a specialty claim to a source that does
        // not report the specialty.
        expect(STAT_SOURCES.npAverageSalaryBls.source).toMatch(/all specialties/i);
        expect(STAT_SOURCES).not.toHaveProperty('averageSalary');
    });
});
