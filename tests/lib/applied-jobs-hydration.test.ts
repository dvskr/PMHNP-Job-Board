/**
 * useAppliedJobs must not read localStorage during render, and must not offer
 * to delete a submitted application.
 *
 * Two defects found 2026-09-13:
 *
 *  1. The hook body seeded its module cache with `getStoredAppliedJobs()`
 *     during render. The server has no localStorage, so a seeker with prior
 *     applications got an SSR tree saying "not applied" and a first client
 *     render saying "applied" — React discarded the subtree (hydration error
 *     #418/#425) on /jobs, every pSEO listing page, and job detail pages.
 *
 *  2. removeApplied/clearAll fired DELETE /api/applications for every tracked
 *     id, including real in-platform submissions.
 *
 * Vitest runs in a node environment with no DOM, so these are source
 * assertions in the tests/regressions/*-static.test.ts style: they pin the
 * invariant at the only place it can be broken again.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
    path.join(process.cwd(), 'lib/hooks/useAppliedJobs.ts'),
    'utf8',
);

/** Body of `export default function useAppliedJobs()` up to its first useEffect. */
function renderPhase(): string {
    const start = SRC.indexOf('export default function useAppliedJobs');
    expect(start).toBeGreaterThan(-1);
    const effect = SRC.indexOf('useEffect(', start);
    expect(effect).toBeGreaterThan(start);
    return SRC.slice(start, effect);
}

describe('useAppliedJobs — hydration safety', () => {
    it('does not read localStorage in the render phase', () => {
        const body = renderPhase();
        expect(body).not.toContain('getStoredAppliedJobs');
        expect(body).not.toContain('localStorage');
    });

    it('seeds the cache from an effect instead', () => {
        expect(SRC).toContain('function ensureCache()');
        const effectStart = SRC.indexOf('useEffect(', SRC.indexOf('export default function useAppliedJobs'));
        expect(SRC.slice(effectStart).includes('ensureCache()')).toBe(true);
    });

    it('exposes isHydrated so consumers can gate their own reads', () => {
        expect(SRC).toContain('isHydrated: boolean');
        expect(SRC).toContain('setIsHydrated(true)');
    });
});

describe('useAppliedJobs — submitted applications are not prunable', () => {
    it('tracks which server rows are real submissions', () => {
        expect(SRC).toContain('submittedIds');
        expect(SRC).toContain("r.sourceUrl === 'platform' || r.consentGiven === true");
    });

    it('removeApplied bails out on a submitted row', () => {
        const start = SRC.indexOf('const removeApplied');
        const end = SRC.indexOf('const clearAll');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        expect(SRC.slice(start, end)).toContain('if (submittedIds.has(jobId)) return;');
    });

    it('clearAll keeps submitted rows and never issues a DELETE for them', () => {
        const start = SRC.indexOf('const clearAll');
        const end = SRC.indexOf('const getAppliedDate');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const body = SRC.slice(start, end);
        expect(body).toContain('.filter((id) => !submittedIds.has(id))');
        // The ids that get a DELETE are the filtered set, not Object.keys().
        expect(body).not.toMatch(/ids\s*=\s*Object\.keys\([^)]*\);/);
    });

    it('exposes isSubmitted so the UI can hide the remove control', () => {
        expect(SRC).toContain('isSubmitted: (jobId: string) => boolean');
    });
});
