/**
 * The index-urls cron must submit the SAME URL the job page canonicals to,
 * and must submit only URLs whose content actually changed.
 *
 * C1 — non-canonical submissions. The cron rebuilt every URL with
 * slugify(title, id) while app/jobs/[slug]/page.tsx canonicals to
 * `job.slug || slugify(title, id)`. The two diverge for real rows: admin
 * posts mint their slug from title PLUS employer, and rows created before the
 * 2026-07 slugify change (leading-hyphen trim, word-boundary truncation) keep
 * the old shape. Each such submission spends quota on a URL that canonicals
 * elsewhere, so it lands as "Duplicate, submitted URL not selected as
 * canonical" and the real URL never gets pinged.
 *
 * C2 — resubmitting the whole catalog. The query ORed `updatedAt >= since`.
 * updatedAt is Prisma's @updatedAt column, so it moves on a job view's
 * viewCount increment and on renewJob's touch for every job re-seen by
 * ingest, which runs each source two to three times a day. The daily set was
 * therefore ~the entire live catalog: Bing's per-site daily quota spent on
 * unchanged URLs and thousands of no-change IndexNow submissions.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { jobIndexUrl, recentlyChangedJobsFilter } from '@/lib/search-indexing';
import { slugify } from '@/lib/utils';

const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

// Fictional fixtures. The UUID shape matters: the job page resolves a row by
// the trailing UUID, so every variant reaches the same page and only the
// canonical differs.
const UUID = '3f1c9a2e-7b04-4d6a-9f21-5c8e0b7a6d13';

describe('C1: submitted job URLs are the canonical ones', () => {
    it('uses the stored slug when the row has one', () => {
        const url = jobIndexUrl({
            id: UUID,
            title: 'Psychiatric Nurse Practitioner',
            slug: `psychiatric-nurse-practitioner-riverbend-health-${UUID}`,
        });

        expect(url).toBe(
            `https://pmhnphiring.com/jobs/psychiatric-nurse-practitioner-riverbend-health-${UUID}`
        );
    });

    it('does NOT recompute a slug that differs from the stored one', () => {
        // The admin-post shape: slug built from title plus employer. The old
        // cron emitted the title-only recompute, a URL the page redirects
        // its canonical away from.
        const stored = slugify('Psychiatric Nurse Practitioner Riverbend Health', UUID);
        const recomputed = slugify('Psychiatric Nurse Practitioner', UUID);
        expect(stored).not.toBe(recomputed);

        const url = jobIndexUrl({
            id: UUID,
            title: 'Psychiatric Nurse Practitioner',
            slug: stored,
        });
        expect(url).toContain(stored);
        expect(url).not.toContain(recomputed);
    });

    it('falls back to slugify only for legacy rows with no stored slug', () => {
        const expected = slugify('PMHNP Outpatient', UUID);
        expect(jobIndexUrl({ id: UUID, title: 'PMHNP Outpatient', slug: null }))
            .toBe(`https://pmhnphiring.com/jobs/${expected}`);
        expect(jobIndexUrl({ id: UUID, title: 'PMHNP Outpatient' }))
            .toBe(`https://pmhnphiring.com/jobs/${expected}`);
    });

    it('the cron selects the slug column and builds URLs through jobIndexUrl', () => {
        const src = read('app/api/cron/index-urls/route.ts');
        expect(src).toMatch(/slug:\s*true/);
        expect(src).toMatch(/orderedJobs\.map\(jobIndexUrl\)/);
        // A local recompute is exactly the bug: the route must not slugify.
        expect(src).not.toMatch(/slugify\(/);
    });
});

describe('C2: only genuinely changed jobs are resubmitted', () => {
    const since = new Date('2026-09-24T00:00:00Z');

    it('matches newly created and newly re-enriched jobs', () => {
        expect(recentlyChangedJobsFilter(since)).toEqual([
            { createdAt: { gte: since } },
            { lastEnrichedAt: { gte: since } },
        ]);
    });

    it('never keys off updatedAt, which every view and ingest touch bumps', () => {
        const clause = JSON.stringify(recentlyChangedJobsFilter(since));
        expect(clause).not.toContain('updatedAt');

        const src = read('app/api/cron/index-urls/route.ts');
        expect(src).toMatch(/OR:\s*recentlyChangedJobsFilter\(since\)/);
        expect(src).not.toMatch(/updatedAt:\s*\{/);
    });
});
