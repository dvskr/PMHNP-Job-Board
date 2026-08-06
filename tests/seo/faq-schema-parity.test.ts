/**
 * FAQ schema-visible parity locks (audit 2026-08 C1/C2/C3/C8).
 *
 * Google's FAQ policy requires FAQPage schema to mirror content that is
 * actually visible on the page. Three verified regressions motivated these
 * locks:
 *   - metro pages emitted TWO byte-identical FAQPage blocks (inline + the
 *     CategoryFAQ component),
 *   - state pages shipped schema stubs whose answers diverged from the
 *     visible accordion,
 *   - the homepage carried a 12-question FAQPage with ZERO visible FAQ
 *     content and invented stats ("62% remote", "California 2,500+").
 * Each page must build its FAQPage from the SAME array the visible section
 * renders — never a second hand-written answer set.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const count = (src: string, re: RegExp): number => (src.match(re) ?? []).length;

describe('metro pages emit exactly one FAQPage (via CategoryFAQ)', () => {
  const src = read('app/jobs/metro/[slug]/page.tsx');

  it('has no inline FAQPage block', () => {
    expect(src).not.toMatch(/'@type':\s*'FAQPage'/);
  });

  it('renders CategoryFAQ from metro.faqs so schema and accordion share one source', () => {
    expect(src).toMatch(/<CategoryFAQ[^>]*customFaqs=\{metro\.faqs\}/);
  });
});

describe('CategoryFAQ builds schema and accordion from the same array', () => {
  const src = read('components/CategoryFAQ.tsx');

  it('maps mainEntity over the same faqs it hands the accordion', () => {
    expect(src).toMatch(/mainEntity:\s*faqs\.map/);
    expect(src).toMatch(/<CategoryFAQAccordion faqs=\{faqs\}/);
    expect(src).toMatch(/jsonLdString\(faqSchema\)/);
  });
});

describe('state pages map FAQPage from the visible stateFaqs array', () => {
  const src = read('app/jobs/state/[state]/page.tsx');

  it('declares the single-source stateFaqs array', () => {
    expect(src).toMatch(/const stateFaqs = \[/);
  });

  it('renders the visible accordion from stateFaqs', () => {
    expect(src).toMatch(/\{stateFaqs\.map\(\(faq, idx\)/);
  });

  it('maps the FAQPage schema from the SAME stateFaqs array', () => {
    expect(src).toMatch(/mainEntity:\s*stateFaqs\.map/);
  });

  it('has exactly one FAQPage block and no divergent stub answers', () => {
    expect(count(src, /'@type':\s*'FAQPage'/g)).toBe(1);
    // The old stubs truncated answers like this — they must not return.
    expect(src).not.toMatch(/Yes, many telehealth positions are available\./);
    expect(src).not.toMatch(/'Multiple cities'/);
  });
});

describe('homepage FAQ is honest, visible, and single-sourced', () => {
  const src = read('app/page.tsx');

  it('declares the single-source homepageFaqs array', () => {
    expect(src).toMatch(/const homepageFaqs/);
  });

  it('maps the FAQPage schema from homepageFaqs', () => {
    expect(src).toMatch(/mainEntity:\s*homepageFaqs\.map/);
    expect(count(src, /'@type':\s*'FAQPage'/g)).toBe(1);
  });

  it('renders a VISIBLE FAQ section from the same array', () => {
    expect(src).toMatch(/\{homepageFaqs\.map\(\(faq, idx\)/);
    expect(src).toMatch(/homepage-faq-heading/);
  });

  it('carries no single-item BreadcrumbList', () => {
    expect(src).not.toMatch(/'@type':\s*'BreadcrumbList'/);
  });

  it('invented stats stay dead: no unsourced percentages, counts, or salary claims', () => {
    // Each of these literals appeared in the old schema-only FAQ with no
    // source anywhere. Live/sourced figures must come from STAT_SOURCES or
    // DB-derived props instead.
    expect(src).not.toMatch(/62%/);
    expect(src).not.toMatch(/2,500\+/);
    expect(src).not.toMatch(/8-16 patients/);
    expect(src).not.toMatch(/\$250,000/);
    expect(src).not.toMatch(/34 states/);
    expect(src).not.toMatch(/\$180,000-\$300,000/);
    expect(src).not.toMatch(/Talkiatry|Cerebral|Lyra Health/);
  });

  it('cited figures route through STAT_SOURCES', () => {
    expect(src).toMatch(/STAT_SOURCES\.averageSalary/);
    expect(src).toMatch(/STAT_SOURCES\.blsGrowth2032/);
    expect(src).toMatch(/STAT_SOURCES\.fullPracticeStates/);
  });
});

describe('category pages with built-in FAQ data render CategoryFAQ (audit C8)', () => {
  // Every slug with a generator in lib/pseo/category-faq-data.ts must render
  // the component — 10 of these 12 shipped the data file without ever
  // rendering it (no visible FAQ, no schema).
  const CATEGORY_PAGES: Array<[string, string]> = [
    ['remote', 'app/jobs/remote/page.tsx'],
    ['telehealth', 'app/jobs/telehealth/page.tsx'],
    ['travel', 'app/jobs/travel/page.tsx'],
    ['new-grad', 'app/jobs/new-grad/page.tsx'],
    ['per-diem', 'app/jobs/per-diem/page.tsx'],
    ['inpatient', 'app/jobs/inpatient/page.tsx'],
    ['outpatient', 'app/jobs/outpatient/page.tsx'],
    ['substance-abuse', 'app/jobs/substance-abuse/page.tsx'],
    ['child-adolescent', 'app/jobs/child-adolescent/page.tsx'],
    ['addiction', 'app/jobs/addiction/page.tsx'],
    ['behavioral-health', 'app/jobs/behavioral-health/page.tsx'],
    ['community-health', 'app/jobs/community-health/page.tsx'],
  ];

  it.each(CATEGORY_PAGES)('%s page renders CategoryFAQ', (slug, rel) => {
    const src = read(rel);
    expect(src).toMatch(new RegExp(`<CategoryFAQ category="${slug}"`));
  });
});
