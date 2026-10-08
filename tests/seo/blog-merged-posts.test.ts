/**
 * Twenty-two posts that existed only in the database were merged into the
 * posts and pages that cover the same ground (2026-10-08). They were thin,
 * carried unsourced pay figures, and competed with the canonical guides.
 *
 * Two things must stay true while their URLs are still out in the world:
 *   1. each old URL 301s to a destination that exists and does not redirect
 *      onward;
 *   2. the five that had search traction land on a page that still answers
 *      what they answered. The redirect is only honest while that section is
 *      there, so removing one of these sections has to be a deliberate act.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { readCode } from '../helpers/source';

const ROOT = path.resolve(__dirname, '../..');

const MERGED: Array<[string, string]> = [
    // Pay and negotiation
    ['how-to-ask-for-a-raise-as-a-pmhnp-scripts-timing', '/blog/pmhnp-salary-negotiation'],
    ['pmhnp-salary-negotiation-3-things-most-people-skip', '/blog/pmhnp-salary-negotiation'],
    ['the-real-cost-of-accepting-a-low-ball-offer', '/blog/pmhnp-salary-negotiation'],
    ['dnp-vs-msn-pmhnp-salary-is-the-extra-degree-worth-it', '/blog/how-to-become-a-pmhnp'],
    ['hospital-vs-private-practice-pay-real-numbers-for-pmhnps', '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn'],
    ['highest-paying-pmhnp-states-col-adjusted-in-2026', '/blog/pmhnp-salary-by-state-2026'],
    ['pmhnp-salary-growth-the-10-year-trend-20162026', '/blog/pmhnp-job-outlook'],
    // Market and job search
    ['35-pmhnp-job-growth-what-it-means-for-your-career', '/blog/pmhnp-job-outlook'],
    ['how-fast-do-pmhnp-jobs-get-filled-timelines-tips', '/blog/pmhnp-interview-questions-2026'],
    ['3-red-flags-in-pmhnp-job-postings-and-what-to-do', '/blog/new-grad-pmhnp-guide-2026'],
    ['entry-level-pmhnp-what-to-realistically-expect', '/blog/new-grad-pmhnp-guide-2026'],
    ['california-pmhnp-jobs-693-openings-what-to-know', '/blog/pmhnp-jobs-california-texas-2026'],
    // Work arrangements
    ['travellocum-tenens-pmhnp-is-it-worth-it', '/blog/locum-tenens-pmhnp-guide-2026'],
    ['per-diem-pmhnp-the-flexibility-math', '/blog/pmhnp-prn-moonlighting-guide-2026'],
    ['part-time-pmhnp-can-you-make-real-money', '/blog/part-time-pmhnp-jobs-guide'],
    // Telehealth
    ['telehealth-vs-in-person-which-pmhnp-role-pays-more', '/blog/telehealth-pmhnp-guide'],
    ['telehealth-vs-in-person-pmhnp-vote-in-our-poll', '/blog/telehealth-pmhnp-guide'],
    ['telehealth-pmhnp-the-fastest-growing-segment-in-2026', '/blog/telehealth-pmhnp-guide'],
    // Employer and brand posts go to the pages that serve those readers.
    ['why-your-pmhnp-job-post-isnt-getting-applicants', '/for-employers'],
    ['how-to-write-a-pmhnp-job-post-that-actually-converts', '/for-employers'],
    ['retention-starts-with-the-pmhnp-job-post-heres-how', '/for-employers'],
    ['why-we-built-a-pmhnp-only-job-board-no-noise', '/about'],
];

/** Every permanent {source, destination} pair in next.config.ts, comments ignored. */
function redirectMap(): Map<string, string> {
    const map = new Map<string, string>();
    const pairRe = /source:\s*'([^']+)',\s*destination:\s*'([^']+)',\s*permanent:\s*true/g;
    for (const m of readCode('next.config.ts').matchAll(pairRe)) map.set(m[1], m[2]);
    return map;
}

describe('merged blog posts redirect to what replaced them', () => {
    const redirects = redirectMap();

    it('covers all twenty-two', () => {
        expect(new Set(MERGED.map(([slug]) => slug)).size).toBe(22);
    });

    it.each(MERGED)('/blog/%s goes to %s', (slug, destination) => {
        expect(redirects.get(`/blog/${slug}`)).toBe(destination);
    });

    it.each([...new Set(MERGED.map(([, d]) => d))])('destination %s exists and does not redirect onward', (destination) => {
        expect(redirects.has(destination), `${destination} is itself redirected`).toBe(false);
        const target = destination.startsWith('/blog/')
            ? path.join(ROOT, 'content', 'blog', `${destination.slice('/blog/'.length)}.mdx`)
            : path.join(ROOT, 'app', ...destination.split('/').filter(Boolean), 'page.tsx');
        expect(fs.existsSync(target), `${destination} has no ${path.relative(ROOT, target)}`).toBe(true);
    });

    it('no merged post came back as a repo file', () => {
        for (const [slug] of MERGED) {
            expect(fs.existsSync(path.join(ROOT, 'content', 'blog', `${slug}.mdx`)), slug).toBe(false);
        }
    });
});

describe('the merged posts with search traction keep their answer', () => {
    const SECTIONS: Array<[string, string]> = [
        ['how-to-become-a-pmhnp', '### DNP vs MSN: Does the Degree Change PMHNP Pay?'],
        ['pmhnp-salary-negotiation', '## How to Ask for a Raise in Your Current Role'],
        ['pmhnp-interview-questions-2026', '## How Long Does PMHNP Hiring Take?'],
        ['locum-tenens-pmhnp-guide-2026', '### Travel PMHNP vs Locum Tenens, and Where New Grads Fit'],
        ['pmhnp-private-practice-salary-how-much-can-you-really-earn', '**Hospital employment vs private practice.**'],
    ];

    it.each(SECTIONS)('%s still carries "%s"', (slug, marker) => {
        const body = fs.readFileSync(path.join(ROOT, 'content', 'blog', `${slug}.mdx`), 'utf8');
        expect(body).toContain(marker);
    });

    it('every one of those pages is a redirect destination', () => {
        const destinations = new Set(MERGED.map(([, d]) => d));
        for (const [slug] of SECTIONS) expect(destinations.has(`/blog/${slug}`), slug).toBe(true);
    });
});
