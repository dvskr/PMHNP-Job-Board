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
    PRACTICE_AUTHORITY_SOURCE,
    PRACTICE_AUTHORITY_SOURCE_URL,
    getStatePracticeAuthority,
} from '@/lib/state-practice-authority';
import { METRO_CITIES } from '@/lib/metro-data';
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

/** Read a repo file as UTF-8 by its repo-relative path. */
function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * Lines a reader could end up seeing, with engineering notes removed.
 *
 * Comments are blanked rather than dropped so reported line numbers still
 * point at the real line. They have to go: these notes record exactly which
 * wrong figure and which overclaim was removed, so a sweep that read them
 * would fail on its own explanation of the fix.
 */
function copyLines(src: string): { line: string; no: number }[] {
    const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    return withoutBlocks
        .split(/\r?\n/)
        .map((line, i) => ({ line: line.replace(/\/\/.*/, ''), no: i + 1 }))
        .filter(({ line }) => line.trim() !== '');
}

describe('metro pages cannot contradict the practice-authority table', () => {
    // Four of the ten metros used to carry a hand-typed label that disagreed
    // with the table one click away: Columbus and Chicago said Full against
    // Reduced, Atlanta and Dallas said Reduced against Restricted. These
    // answers ship as FAQPage JSON-LD, so the contradiction was in structured
    // data, which is the form answer engines trust most.
    it('every metro label is the one its state carries in the table', () => {
        const label = { full: 'Full', reduced: 'Reduced', restricted: 'Restricted' } as const;
        for (const metro of METRO_CITIES) {
            const info = getStatePracticeAuthority(metro.state);
            expect(info, `${metro.slug}: "${metro.state}" is not in STATE_PRACTICE_AUTHORITY`).not.toBeNull();
            expect(metro.practiceAuthority, `${metro.slug} (${metro.state})`).toBe(label[info!.authority]);
        }
    });

    it('no metro names an authority level its own state does not have', () => {
        // Prose drifts even when the field is derived, and the metro page
        // prints licensureNote right under the derived badge.
        const LEVELS = ['Full', 'Reduced', 'Restricted'] as const;
        const offenders: string[] = [];
        for (const metro of METRO_CITIES) {
            const prose = [metro.licensureNote, metro.heroDescription, ...metro.whyThisMetro, ...metro.faqs.map((f) => f.answer)].join(' ');
            for (const level of LEVELS) {
                if (level === metro.practiceAuthority) continue;
                if (new RegExp(`\b${level} Practice Authority\b`).test(prose)) {
                    offenders.push(`${metro.slug} (${metro.state} is ${metro.practiceAuthority}) says "${level} Practice Authority"`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('no surface publishes a hand-written dollar figure', () => {
    // The site's published policy (app/llms.txt) is that every pay figure is a
    // median of advertised ranges from live postings, shipped with its sample
    // size and withheld below the floor. A typed dollar amount in copy is by
    // definition a figure that policy did not produce, and the metro FAQs and
    // /faq both used to disagree with /salary-guide for the same state.
    // components/StateFAQ.tsx was on this list until 2026-09-25, when it turned
    // out nothing rendered it: the state page builds its own FAQ array and
    // emits the FAQPage itself, so the component was dead and would have
    // shipped a SECOND FaqPage if anyone had wired it up. Deleted with its
    // accordion sibling. The metro page joined the list in its place.
    const SURFACES = [
        'lib/metro-data.ts',
        'app/faq/page.tsx',
        'app/jobs/state/[state]/page.tsx',
        'app/jobs/metro/[slug]/page.tsx',
    ];
    // A literal amount, e.g. $155,000 or $130K. Template interpolation reads
    // `$${fmtK(...)}` or `${...}`, so a digit never follows the dollar sign.
    const LITERAL_DOLLARS = /\$\s?\d/;

    it.each(SURFACES)('%s has no literal dollar amount in copy', (rel) => {
        const offenders = copyLines(read(rel))
            .filter(({ line }) => LITERAL_DOLLARS.test(line))
            .map(({ line, no }) => `${rel}:${no}  ${line.trim().slice(0, 120)}`);
        expect(
            offenders,
            `these lines type a dollar figure instead of deriving it through lib/salary-report:\n  ${offenders.join('\n  ')}`,
        ).toEqual([]);
    });

    it('the state page computes a median through the engine, never a SQL mean', () => {
        const src = read('app/jobs/state/[state]/page.tsx');
        expect(src).toMatch(/summarizeMidpoints|cleanSalaryRows/);
        // The retired aggregate: prisma _avg over the salary columns.
        expect(src).not.toMatch(/_avg:\s*\{\s*normalizedMinSalary/);
    });

    it('the /faq salary answers are computed, not typed', () => {
        const src = read('app/faq/page.tsx');
        expect(src).toMatch(/getOfferMarketData/);
        expect(src).toMatch(/getHubStateSummaries/);
    });
});

describe('the site does not describe a product or a pipeline it does not have', () => {
    it('no FAQ answer offers free job posting', () => {
        // Posting is paid: first post half price, standard, renewal, all from
        // lib/config.ts. A FAQPage answer saying "create a free employer
        // account" is lifted verbatim by answer engines and lands the reader
        // on a paid checkout.
        const FREE_POSTING = /free (employer account|job post|posting)|post (a job |your job )?for free/i;
        for (const rel of ['app/contact/page.tsx', 'app/faq/page.tsx']) {
            const offenders = copyLines(read(rel))
                .filter(({ line }) => FREE_POSTING.test(line))
                .map(({ line, no }) => `${rel}:${no}  ${line.trim().slice(0, 120)}`);
            expect(offenders).toEqual([]);
        }
    });

    it('prices on the contact FAQ come from config, never typed', () => {
        const src = read('app/contact/page.tsx');
        expect(src).toMatch(/config\.firstPostPrice/);
        expect(src).toMatch(/from '@\/lib\/config'/);
    });

    it('the About methodology claims only what the pipeline does', () => {
        // There is no BLS ingestion anywhere in lib/ or app/ (BLS appears only
        // as a cited labor-market stat), nothing queries a board of nursing,
        // and ingest runs in two waves a day rather than on a 24-hour cycle.
        const src = read('app/about/AboutClient.tsx');
        const copy = copyLines(src).map(({ line }) => line).join('\n');
        expect(copy).not.toMatch(/Bureau of Labor Statistics/i);
        // The overclaim, not the unrelated "general nursing boards bury
        // psychiatric NP roles" line, which is about other job sites.
        expect(copy).not.toMatch(/against (state )?nursing boards/i);
        expect(copy).not.toMatch(/24-hour cycle/i);
        // "Verified" is a paid status set in the Stripe webhook, not a count of
        // employers that appeared in a scrape.
        expect(copy).not.toMatch(/Verified Employers/i);
    });
});

describe('the practice-authority citation travels with the table', () => {
    it('stats-sources cites the table\'s own source constants', () => {
        expect(STAT_SOURCES.fullPracticeStates.source).toBe(PRACTICE_AUTHORITY_SOURCE);
        expect(STAT_SOURCES.fullPracticeStates.sourceUrl).toBe(PRACTICE_AUTHORITY_SOURCE_URL);
        expect(PRACTICE_AUTHORITY_SOURCE_URL).toMatch(/^https:\/\/www\.aanp\.org\//);
    });
});
