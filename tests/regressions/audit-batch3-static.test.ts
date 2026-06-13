/**
 * Static regression guards for the third audit batch (remaining mediums + lows).
 * Each reads the real source so a future edit can't silently undo the fix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('image sitemap emits absolute image URLs', () => {
  it('does not prepend BASE_URL to an already-absolute image', () => {
    const src = read('app/image-sitemap.xml/route.ts');
    expect(src).not.toMatch(/<image:loc>\$\{BASE_URL\}\$\{entry\.image\}/);
    expect(src).toContain("entry.image.startsWith('http')");
  });
});

describe('autofill mints a signed URL before fetching the resume', () => {
  for (const f of ['app/api/autofill/classify-fields/route.ts', 'app/api/autofill/generate-answer/route.ts']) {
    it(`${f} uses mintResumeReadUrl`, () => {
      const src = read(f);
      expect(src).toContain('mintResumeReadUrl');
      // The bare-path value must no longer be passed straight to extractResumeText.
      expect(src).not.toMatch(/extractResumeText\(candidateProfile\?\.resumeUrl\)/);
    });
  }
});

describe('ingest adapter fetch budgets stay under the orchestrator window', () => {
  const MAX = 240_000;
  for (const f of [
    'lib/aggregators/adzuna.ts',
    'lib/aggregators/usajobs.ts',
    'lib/aggregators/healthcareercenter.ts',
    'lib/aggregators/bamboohr.ts',
    'lib/aggregators/ashby.ts',
    'lib/aggregators/jazzhr.ts',
    'lib/aggregators/workable.ts',
  ]) {
    it(`${f} budget < ${MAX}ms`, () => {
      const src = read(f);
      const m = src.match(/TIME_BUDGET_MS\s*=\s*([\d_]+)/);
      expect(m, `no TIME_BUDGET_MS in ${f}`).toBeTruthy();
      const val = Number(m![1].replace(/_/g, ''));
      expect(val).toBeLessThan(MAX);
    });
  }
});

describe('analytics GET endpoints require admin', () => {
  for (const f of ['app/api/analytics/clicks/route.ts', 'app/api/analytics/sources/route.ts']) {
    it(`${f} checks role === 'admin'`, () => {
      const src = read(f);
      expect(src).toMatch(/role !== 'admin'/);
    });
  }
});

describe('push-subscribe DELETE is owner-gated', () => {
  it('verifies subscription owner before deleting', () => {
    const src = read('app/api/push-subscribe/route.ts');
    expect(src).toContain('sub.userId');
    expect(src).toMatch(/user\.id !== sub\.userId/);
  });
});

describe('greenhouse chunk total matches the schedule', () => {
  it('CHUNKED_SOURCE_TOTAL_CHUNKS.greenhouse is 4', () => {
    const src = read('lib/health/chunked-presence.ts');
    expect(src).toMatch(/greenhouse:\s*4/);
  });
});
