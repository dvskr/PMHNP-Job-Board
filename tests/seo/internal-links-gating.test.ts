/**
 * tests/seo/internal-links-gating.test.ts
 *
 * Decision-tree rule 6: "Internal links without job-count gating" is a
 * rejected anti-pattern. Every link to a pSEO cell must come from a query
 * that filters to populated pages, and no internal link may point at a URL
 * the site itself answers 404, 410 or 308 on.
 *
 * Three regressions are pinned here:
 *   1. cityLinkHref sends the ten curated metros to /jobs/metro/{slug} rather
 *      than through the city page's 308.
 *   2. The two highest-authority geo hubs (state hub, salary-guide state) and
 *      the job-detail breadcrumb gate their city links on the same render-gate
 *      constant the city page 404s below.
 *   3. No taxonomy landing page advertised in the primary sitemap is an orphan
 *      (sitemap-only URLs are the classic "Discovered, currently not indexed"
 *      profile, and answer engines get no anchor context for them).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { cityLinkHref } from '@/lib/pseo/related-cities';
import { getAllMetroSlugs } from '@/lib/metro-data';
import { JOBS_TAXONOMY } from '@/lib/pseo/jobs-segments-edge';

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('cityLinkHref', () => {
  it('routes curated metro slugs to the metro page, not the 308 on /jobs/city', () => {
    for (const slug of getAllMetroSlugs()) {
      expect(cityLinkHref(slug)).toBe(`/jobs/metro/${slug}`);
    }
  });

  it('leaves ordinary city slugs on the generic city route', () => {
    expect(cityLinkHref('boise-id')).toBe('/jobs/city/boise-id');
  });

  it('normalizes case so a mixed-case slug still matches a metro', () => {
    expect(cityLinkHref('Dallas-TX')).toBe('/jobs/metro/dallas-tx');
  });
});

describe('city links on the geo hubs are gated on the city render gate', () => {
  const surfaces: ReadonlyArray<[string, string]> = [
    ['state hub', 'app/jobs/state/[state]/page.tsx'],
    ['salary-guide state page', 'app/salary-guide/[state]/page.tsx'],
    ['job detail', 'app/jobs/[slug]/page.tsx'],
  ];

  for (const [name, path] of surfaces) {
    it(`${name} builds city hrefs through cityLinkHref`, () => {
      const src = read(path);
      expect(src).toContain('cityLinkHref');
    });

    it(`${name} checks MIN_JOBS_FOR_CATEGORY_CITY before emitting a city link`, () => {
      const src = read(path);
      expect(src).toContain('MIN_JOBS_FOR_CATEGORY_CITY');
    });

    it(`${name} no longer interpolates a raw /jobs/city/ URL`, () => {
      const src = read(path);
      // A template literal or JSX expression building the city URL by hand is
      // exactly the ungated pattern this file exists to prevent.
      expect(src).not.toMatch(/\/jobs\/city\/\$\{/);
      expect(src).not.toMatch(/href=\{`\/jobs\/city\//);
    });
  }

  it('the salary-guide city query uses publicJobsWhere, not a bare isPublished', () => {
    const src = read('app/salary-guide/[state]/page.tsx');
    const topCities = src.slice(src.indexOf('async function getTopCities'));
    const body = topCities.slice(0, topCities.indexOf('\n}'));
    expect(body).toContain('publicJobsWhere()');
    expect(body).not.toMatch(/isPublished:\s*true/);
  });
});

describe('primary-sitemap taxonomy hubs have at least one internal inbound link', () => {
  // Files that describe URLs rather than link to them. A sitemap entry is the
  // thing being compensated for here, so it cannot count as the inbound link.
  const EXCLUDED = new Set(['app/sitemap.ts', 'app/robots.ts', 'middleware.ts']);

  const sourceFiles = ['app', 'components', 'lib']
    .flatMap((d) => walk(join(ROOT, d)))
    .map((f) => relative(ROOT, f).split(sep).join('/'))
    .filter((f) => !EXCLUDED.has(f) && !f.startsWith('app/api/'));

  const contents = new Map(sourceFiles.map((f) => [f, read(f)]));

  const sitemapped = JOBS_TAXONOMY.filter((e) => e.inPrimarySitemap).map((e) => e.slug);

  it.each(sitemapped)('/jobs/%s is linked from somewhere other than its own route', (slug) => {
    // Exact landing-page URL only: a deeper /jobs/{slug}/{state} link does not
    // give the hub itself anchor text, and self-referential canonicals and
    // BreadcrumbSchema items inside the hub's own directory do not count.
    const pattern = new RegExp(`/jobs/${slug}(?![a-zA-Z0-9\\-/])`);
    const ownDir = `app/jobs/${slug}/`;
    const linkedFrom = sourceFiles.filter(
      (f) => !f.startsWith(ownDir) && pattern.test(contents.get(f) as string),
    );
    expect(linkedFrom.length, `/jobs/${slug} has no inbound internal link`).toBeGreaterThan(0);
  });
});

describe('the footer links canonical taxonomy URLs', () => {
  const footer = read('components/Footer.tsx');

  it('does not vote for /jobs/substance-abuse, which canonicalizes elsewhere', () => {
    // The page stays live for users; a sitewide footer link just routed the
    // site's strongest internal signal through a canonical hop.
    // Matches the href, not a prose mention: the comment above the replacement
    // link names the old URL on purpose.
    expect(footer).not.toMatch(/href:\s*'\/jobs\/substance-abuse'/);
  });

  it('links /jobs/addiction, the canonical target', () => {
    expect(footer).toContain('/jobs/addiction');
  });

  it('carries the four hubs that had no inbound link anywhere', () => {
    for (const slug of ['easy-apply', 'entry-level', 'mid-career', 'lgbtq']) {
      expect(footer, `footer is missing /jobs/${slug}`).toContain(`/jobs/${slug}`);
    }
  });

  it('uses noun-phrase anchors on those hubs rather than bare labels', () => {
    for (const label of [
      'Easy Apply PMHNP Jobs',
      'Entry Level PMHNP Jobs',
      'Mid-Career PMHNP Jobs',
      'Senior PMHNP Jobs',
      'LGBTQ+ Affirming PMHNP Jobs',
    ]) {
      expect(footer).toContain(label);
    }
  });
});
