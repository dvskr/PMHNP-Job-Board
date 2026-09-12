/**
 * Structural locks for the job-detail route. The page is a 1,200-line RSC
 * that can't be unit-rendered in node, so the guarantees are pinned at the
 * source level:
 *
 *   - Internal links (related jobs, "more from this employer", city and
 *     new-grad buckets) and the counts beside them must use the same
 *     publicJobsWhere predicate /jobs filters by. A bare `isPublished: true`
 *     surfaced expired and off-specialty rows as live cards that dead-end on
 *     the 410/404 the detail route itself answers, and inflated every
 *     "N more jobs" number on the page.
 *
 *   - No loading.tsx in this segment. A loading file wraps the page in a
 *     Suspense boundary whose fallback IS the streamed shell: Next flushes it
 *     (committing HTTP 200) before getJob has decided whether the slug even
 *     exists, so an unknown or expired job answered 200 with a "Page Not
 *     Found" body instead of the 404 the notFound() calls below intend. With
 *     no boundary the shell waits for getJob and the status is honest.
 *
 *   - The mobile sticky Apply bar must clear BottomNav. The nav is
 *     `md:hidden fixed bottom-0 z-50`; the Apply bar is `lg:hidden fixed
 *     z-[60]`, so below 768px a `bottom-0` Apply bar buried the entire nav.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SEGMENT_DIR = path.resolve(__dirname, '../../app/jobs/[slug]');
const src = fs.readFileSync(path.join(SEGMENT_DIR, 'page.tsx'), 'utf8');

// Line comments quote the very patterns under test, so strip them first.
const code = src
  .split('\n')
  .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n');

describe('job-detail internal links use the public jobs predicate', () => {
  it('imports publicJobsWhere from the shared filters module', () => {
    expect(code).toMatch(/import\s*\{[^}]*publicJobsWhere[^}]*\}\s*from\s*'@\/lib\/filters'/);
  });

  it('applies it to every related-job query and on-page count', () => {
    // Two link buckets + employer-count + company jobCount + state average.
    const calls = code.match(/publicJobsWhere\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
  });

  it('leaves no bare `isPublished: true` predicate behind', () => {
    // The single legitimate occurrence is the column selection in getJob,
    // which reads the flag rather than filtering on it.
    const occurrences = code.match(/isPublished: true/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(code).toMatch(/select:\s*\{[\s\S]{0,80}isPublished: true/);
  });
});

describe('job-detail unknown slugs answer 404, not a streamed 200 shell', () => {
  it('has no loading.tsx in the [slug] segment', () => {
    expect(fs.existsSync(path.join(SEGMENT_DIR, 'loading.tsx'))).toBe(false);
  });

  it('still calls notFound() for the gone and expired cases', () => {
    expect(code).toMatch(/status === 'gone'[\s\S]{0,40}notFound\(\)/);
    expect(code).toMatch(/status === 'expired'[\s\S]{0,40}notFound\(\)/);
  });
});

describe('mobile sticky Apply bar clears the BottomNav', () => {
  it('offsets the bar by the nav height below md and sits flush from md up', () => {
    const bar = code.match(/<div className="lg:hidden fixed[^"]*"/);
    expect(bar).not.toBeNull();
    expect(bar![0]).toContain('bottom-[calc(80px_+_env(safe-area-inset-bottom))]');
    expect(bar![0]).toContain('md:bottom-0');
    expect(bar![0]).not.toMatch(/\sbottom-0\b/);
  });
});
