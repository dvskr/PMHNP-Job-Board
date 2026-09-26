/**
 * /post-job is public, indexable and listed in the sitemap, and it is the
 * site's primary commercial page, but it shipped zero <h1> elements: its
 * outline started at a step label ("Company Information"), so a crawler and a
 * screen reader both got the page with no top-level heading. /post-job/preview
 * had the opposite problem, two <h1>s, the page title and the previewed job
 * title.
 *
 * The invariant is one h1 per route. Asserting it on the source is a proxy for
 * asserting it on the rendered DOM, but these are the only files that can
 * produce an h1 on these routes, and unlike the e2e checks it needs no server.
 *
 * On /post-job the h1 also has to sit outside PostJobContent: that component
 * returns early for the loading, signed-out and wrong-role states, so an h1
 * placed inside it would be missing from exactly the HTML a crawler receives.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const ROUTES = ['app/post-job/page.tsx', 'app/post-job/preview/page.tsx', 'app/post-job/checkout/page.tsx'];

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const countH1 = (src: string) => (src.match(/<h1[\s>]/g) || []).length;

describe('post-job heading outline', () => {
  it.each(ROUTES)('%s declares exactly one h1', (rel) => {
    expect(countH1(read(rel))).toBe(1);
  });

  it('the /post-job h1 is rendered outside the component that returns early', () => {
    const src = read('app/post-job/page.tsx');
    const h1Index = src.indexOf('<h1');
    const contentStart = src.indexOf('function PostJobContent(');
    const contentEnd = src.indexOf('export default function PostJobPage(');

    expect(h1Index).toBeGreaterThan(-1);
    expect(contentStart).toBeGreaterThan(-1);
    expect(contentEnd).toBeGreaterThan(contentStart);
    // After the wizard component closes means it is in the page shell that
    // wraps every auth state, including the Suspense fallback.
    expect(h1Index).toBeGreaterThan(contentEnd);
  });

  it('no post-job route is missing a heading level between h1 and its sections', () => {
    // A page whose first heading after the h1 is an h3 or lower reads as a gap
    // to anyone navigating by heading.
    for (const rel of ROUTES) {
      const levels = [...read(rel).matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
      const afterFirstH1 = levels.slice(levels.indexOf(1) + 1);
      if (afterFirstH1.length === 0) continue;
      expect(Math.min(...afterFirstH1), `${rel} jumps past h2`).toBeLessThanOrEqual(2);
    }
  });
});
