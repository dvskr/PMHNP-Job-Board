/**
 * Organic audit 2026-08, workstream A (blog) regression locks.
 *
 * A1: SERP titles doubled the year ("... 2026 Directory ... (2026)") because
 *     the append guard only checked for a trailing "(YYYY)". The guard must
 *     append the year ONLY when the title contains no 4-digit year anywhere.
 * A2: duplicate blog clusters (private-practice salary x3, residency x3,
 *     job-outlook x2, remote x3) must stay consolidated via next.config.ts
 *     301s, with no redirect chains among the blog entries.
 * A3: "Last Reviewed" is an editorial claim gated on reviewed_at; the
 *     unconditional "Updated {currentYear}" badge was a fabricated freshness
 *     signal and must not come back.
 * A4: FAQ + HowTo schema for the state-licensure cluster keys off the live
 *     pmhnp-license-{state} slug pattern; the old regex matched zero posts.
 *     The HowTo must not carry invented totalTime/estimatedCost figures.
 * A5: blogFaqData answers must not hardcode dollar figures, percentages, or
 *     job counts — sourced numbers interpolate from STAT_SOURCES.
 *
 * Source-lock style (see tests/api/renewal-cta.test.ts): read the real
 * source so these cannot be silently regressed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STAT_SOURCES } from '@/lib/stats-sources';

const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const blogPage = read('app/blog/[slug]/page.tsx');
const nextConfig = read('next.config.ts');

// ─── A1: title year guard ────────────────────────────────────────────────────

describe('A1: blog SERP title year append', () => {
    it('guards on "contains any 4-digit year", not "ends with (YYYY)"', () => {
        expect(blogPage).toContain('/\\b(19|20)\\d{2}\\b/.test(post.title)');
    });

    it('no longer uses the old end-anchored (YYYY) match for the title', () => {
        expect(blogPage).not.toContain('post.title.match(/\\(\\d{4}\\)');
    });

    it('the guard regex suppresses the append for any title mentioning a year', () => {
        // Mirror of the source expression at app/blog/[slug]/page.tsx.
        const containsYear = /\b(19|20)\d{2}\b/;
        const year = new Date().getFullYear();
        const titleFor = (t: string) => (containsYear.test(t) ? t : `${t} (${year})`);

        // Mid-title year: must NOT double the year (the old bug).
        const midYear = 'PMHNP Residency & Fellowship Programs: 2026 Directory + How to Apply';
        expect(titleFor(midYear)).toBe(midYear);

        // Trailing (YYYY): still suppressed.
        const trailing = 'PMHNP Interview Questions (2026)';
        expect(titleFor(trailing)).toBe(trailing);

        // Year-free title: append is allowed.
        expect(titleFor('How to Become a PMHNP')).toBe(`How to Become a PMHNP (${year})`);

        // Non-year digits do not suppress the append.
        expect(titleFor('Top 10 PMHNP Interview Questions')).toBe(
            `Top 10 PMHNP Interview Questions (${year})`
        );
    });
});

// ─── A2: duplicate-cluster redirects ─────────────────────────────────────────

/** Extract every {source, destination, permanent: true} entry from next.config.ts. */
function redirectMap(): Map<string, string> {
    const map = new Map<string, string>();
    const pairRe = /source:\s*'([^']+)',\s*destination:\s*'([^']+)',\s*permanent:\s*true/g;
    for (const m of nextConfig.matchAll(pairRe)) {
        map.set(m[1], m[2]);
    }
    return map;
}

describe('A2: duplicate blog cluster 301s in next.config.ts', () => {
    const redirects = redirectMap();

    const expected: Array<[string, string]> = [
        // Private-practice salary: both variants -> the GSC-strongest original.
        ['/blog/pmhnp-private-practice-salary',
            '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn'],
        ['/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn-2',
            '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn'],
        // Residency: third copy -> the directory post.
        ['/blog/pmhnp-residency-programs',
            '/blog/pmhnp-residency-fellowship-programs-2026-directory-how-to-apply'],
        // Job outlook: long slug -> the ranking short slug.
        ['/blog/pmhnp-job-outlook-2026-growth-rate-demand-future-predictions',
            '/blog/pmhnp-job-outlook'],
        // Remote trio: the weaker two -> the strongest.
        ['/blog/remote-pmhnp-jobs-guide-2026',
            '/blog/ultimate-guide-remote-pmhnp-jobs-2026'],
        ['/blog/remote-pmhnp-jobs-in-2026-what-remote-really-means',
            '/blog/ultimate-guide-remote-pmhnp-jobs-2026'],
    ];

    it.each(expected)('301s %s', (source, destination) => {
        expect(redirects.get(source)).toBe(destination);
    });

    it('keeps the pre-existing blog consolidation redirects', () => {
        expect(redirects.get('/blog/pmhnp-residency-fellowship-programs-2026-directory-how-to-apply-2'))
            .toBe('/blog/pmhnp-residency-fellowship-programs-2026-directory-how-to-apply');
        expect(redirects.get('/blog/pmhnp-job-outlook-2026-growth-rate-demand-future-predictions-2'))
            .toBe('/blog/pmhnp-job-outlook');
    });

    it('no blog redirect destination is itself a redirect source (no chains)', () => {
        for (const [source, destination] of redirects) {
            if (!source.startsWith('/blog/')) continue;
            expect(redirects.has(destination), `${source} -> ${destination} chains onward`).toBe(false);
        }
    });
});

// ─── A3: freshness honesty ───────────────────────────────────────────────────

describe('A3: no fabricated freshness signals on blog posts', () => {
    it('the unconditional "Updated {currentYear}" badge is gone', () => {
        expect(blogPage).not.toContain('Updated {new Date().getFullYear()}');
        expect(blogPage).not.toContain('ed-author-badge">Updated');
    });

    it('"Last Reviewed" renders only from reviewed_at, never updated_at', () => {
        const idx = blogPage.indexOf('Last Reviewed</label>');
        expect(idx).toBeGreaterThan(-1);
        const block = blogPage.slice(Math.max(0, idx - 400), idx + 200);
        expect(block).toContain('post.reviewed_at && (');
        expect(block).toContain('formatDate(post.reviewed_at)');
        expect(block).not.toContain('formatDate(post.updated_at)');
    });
});

// ─── A4: state-licensure schema unlock ───────────────────────────────────────

describe('A4: license-cluster FAQ + HowTo schema', () => {
    it('keys off the live pmhnp-license-{state} slug pattern', () => {
        expect(blogPage).toContain('/^pmhnp-license-(.+)$/');
        // The FAQ/HowTo state match reuses that same live pattern.
        expect(blogPage).toContain('const stateSlugMatch = licenseSlugMatch;');
    });

    it('the dead how-to-get-your-pmhnp-license regex is gone', () => {
        expect(blogPage).not.toContain('how-to-get-your-pmhnp-license-in-');
    });

    it('HowTo schema carries no invented totalTime or estimatedCost', () => {
        // Key form with colon so explanatory comments do not false-positive.
        expect(blogPage).not.toContain('totalTime:');
        expect(blogPage).not.toContain('estimatedCost:');
    });
});

// ─── A5: blogFaqData stat honesty ────────────────────────────────────────────

/** The FAQ data region: hardcoded map + dynamic license generation,
 *  ending where the HowTo schema starts. */
function faqDataRegion(): string {
    const start = blogPage.indexOf('const blogFaqData');
    const end = blogPage.indexOf('const howToSchema');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return blogPage.slice(start, end);
}

describe('A5: blog FAQ answers do not hardcode stats', () => {
    const faqRegion = faqDataRegion();

    it('contains no literal dollar figures', () => {
        expect(faqRegion).not.toMatch(/\$\d/);
    });

    it('contains no literal percentages', () => {
        expect(faqRegion).not.toMatch(/\d+\s*%/);
    });

    it('contains no invented open-position counts', () => {
        expect(faqRegion).not.toMatch(/[\d,]+\+?\s+open positions/i);
        expect(faqRegion).not.toMatch(/hundreds of/i);
    });

    it('sourced figures interpolate from STAT_SOURCES', () => {
        expect(faqRegion).toContain('STAT_SOURCES.averageSalary');
        expect(faqRegion).toContain('STAT_SOURCES.blsGrowthProjection');
        expect(blogPage).toContain("import { STAT_SOURCES } from '@/lib/stats-sources'");
    });

    it('the dynamic license FAQ makes no unsourced timeline claim', () => {
        expect(faqRegion).not.toMatch(/\d+-\d+\s*weeks/i);
    });

    it('FAQ copy and its interpolated STAT_SOURCES fields carry no em/en dashes', () => {
        expect(faqRegion).not.toMatch(/[–—]/);
        const interpolated = [
            STAT_SOURCES.averageSalary.formatted,
            STAT_SOURCES.averageSalary.source,
            STAT_SOURCES.blsGrowthProjection.formatted,
            STAT_SOURCES.blsGrowthProjection.source,
            STAT_SOURCES.hrsaShortagePopulation.formatted,
            STAT_SOURCES.hrsaShortagePopulation.source,
        ];
        for (const field of interpolated) {
            expect(field).not.toMatch(/[–—]/);
        }
    });
});
