/**
 * OG image redesign locks (2026-08).
 *
 * The share cards at app/api/og/{route,city/route}.tsx are marketing surfaces:
 *   - copy must stay claim-free (no "#1", no superlatives), and
 *   - both routes must keep the shared cream/teal/ink visual system plus the
 *     edge-cache directives, with the v=3 cache buster on the URL builders so
 *     scrapers refetch the new design.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const OG_ROUTES = ['app/api/og/route.tsx', 'app/api/og/city/route.tsx'];

describe('OG image copy stays claim-free', () => {
  // "#1 " (with trailing space so hex colors like #1A2E35 never match) plus
  // the usual superlative vocabulary.
  const banned = [
    /#1\s/,
    /\bNo\.\s*1\b/i,
    /\bnumber one\b/i,
    /\bbest\b/i,
    /\bleading\b/i,
    /\blargest\b/i,
    /\bpremier\b/i,
    /\btop[- ]rated\b/i,
  ];

  for (const f of OG_ROUTES) {
    it(`${f} contains no superlative claims`, () => {
      const src = read(f);
      for (const pattern of banned) {
        expect(src).not.toMatch(pattern);
      }
    });
  }
});

describe('OG routes share the current visual system', () => {
  for (const f of OG_ROUTES) {
    it(`${f} uses the cream/teal/ink palette with eyebrow and domain bar`, () => {
      const src = read(f);
      expect(src).toContain("'#F7F5F0'"); // cream ground
      expect(src).toContain("'#0D9488'"); // teal accent
      expect(src).toContain("'#1A2E35'"); // ink text
      expect(src).toContain('PMHNP HIRING'); // uppercase eyebrow
      expect(src).toContain('pmhnphiring.com'); // bottom bar domain
      expect(src).toContain('width: 1200');
      expect(src).toContain('height: 630');
      // Edge caching preserved (tests/e2e/regression.spec.ts checks it live).
      expect(src).toContain('s-maxage=2592000');
    });
  }
});

/**
 * The buster is versioned per layout, not site-wide.
 *
 * Scrapers cache by URL and the edge holds each render for 30 days, so a
 * layout change only reaches Twitter, Slack and LinkedIn if its URLs change.
 * The job branch moved to the pay slab and went to 4; the page branch did not
 * move and stays at 3, which keeps thousands of still-correct page images in
 * cache instead of re-rendering them for nothing.
 */
describe('og URL builders carry a cache buster matched to their layout', () => {
  it('app/layout.tsx site-wide og image', () => {
    expect(read('app/layout.tsx')).toContain('/api/og?v=3');
  });
  it('lib/pseo/category-city-template.tsx city og params', () => {
    expect(read('lib/pseo/category-city-template.tsx')).toMatch(/v: '3'/);
  });
  it('lib/pseo/setting-state-template.tsx state og url', () => {
    expect(read('lib/pseo/setting-state-template.tsx')).toContain('&v=3');
  });
  it('the job page moved to 4 with the pay-slab layout', () => {
    expect(read('app/jobs/[slug]/page.tsx')).toMatch(/searchParams\.set\('v', '4'\)/);
  });
});

/**
 * The pay slab is the reason the job layout changed, so pin the two things
 * that make it work rather than its exact pixel sizes.
 */
describe('the job card leads with advertised pay when there is any', () => {
  const src = read('app/api/og/route.tsx');

  it('branches on hasSalary instead of rendering one job layout', () => {
    expect(src).toMatch(/:\s*hasSalary\s*\?\s*\(/);
  });

  it('never invents a figure when the posting published none', () => {
    // The old default put "Competitive Pay" on the card. hasSalary already
    // treats that string as absent; this keeps it from coming back.
    expect(src).not.toMatch(/salary\s*=\s*['"`]\$/);
    expect(src).toMatch(/searchParams\.get\('salary'\) \|\| 'Competitive Pay'/);
  });

  it('sizes the slab so a long range cannot walk off the 1200px frame', () => {
    // Satori does not wrap or clip, so this has to be computed, not hoped for.
    expect(src).toMatch(/function salaryFontSize/);
  });
});
