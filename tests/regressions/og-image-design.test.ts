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

describe('og URL builders carry the v=3 cache buster', () => {
  it('app/layout.tsx site-wide og image', () => {
    expect(read('app/layout.tsx')).toContain('/api/og?v=3');
  });
  it('lib/pseo/category-city-template.tsx city og params', () => {
    expect(read('lib/pseo/category-city-template.tsx')).toMatch(/v: '3'/);
  });
  it('lib/pseo/setting-state-template.tsx state og url', () => {
    expect(read('lib/pseo/setting-state-template.tsx')).toContain('&v=3');
  });
});
