/**
 * Regression guards for the components-rest audit sweep.
 *
 * Each test pins the RULE the fix implements, not the exact code that
 * implements it, so a later refactor of the same component does not fail the
 * suite for cosmetic reasons.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getRelevantBlogSlugs } from '@/components/RelatedBlogPosts';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Every `source: '/blog/...'` entry in the next.config redirects array. */
function blogRedirectSources(): string[] {
  const src = read('next.config.ts');
  return [...src.matchAll(/source:\s*'(\/blog\/[^']+)'/g)].map(m => m[1]);
}

describe('job pages never link a blog slug that redirects', () => {
  const redirected = new Set(blogRedirectSources());

  it('next.config really does declare blog redirects (guards the parser)', () => {
    expect(redirected.size).toBeGreaterThan(0);
  });

  // Every branch of getRelevantBlogSlugs, so a slug added to any one of them
  // is covered.
  const cases = [
    { name: 'default job', opts: {} },
    { name: 'remote job', opts: { isRemote: true } },
    { name: 'telehealth job', opts: { isTelehealth: true } },
    { name: 'new grad job', opts: { isNewGrad: true } },
    { name: 'remote new grad job', opts: { isRemote: true, isNewGrad: true } },
  ];

  for (const { name, opts } of cases) {
    it(`${name}: no returned slug is a redirect source`, () => {
      const slugs = getRelevantBlogSlugs(opts);
      expect(slugs.length).toBeGreaterThan(0);
      for (const slug of slugs) {
        expect(redirected.has(`/blog/${slug}`)).toBe(false);
      }
    });
  }

  it('the salary money page is linked directly, not through /blog', () => {
    const src = read('components/RelatedBlogPosts.tsx');
    expect(src).toContain("'/salary-guide'");
    expect(getRelevantBlogSlugs({})).not.toContain('pmhnp-salary-guide-2026');
  });
});

describe('components never link a robots-disallowed /jobs query URL', () => {
  // app/robots.ts disallows /jobs?*q= and /jobs?*location=, and app/jobs
  // noindexes any filtered view, so an internal link to one spends authority
  // on a URL Googlebot must not fetch. Comments are allowed to mention them.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '');

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.tsx')) files.push(rel);
    }
  };
  walk('components');

  it('sweeps a non-trivial number of component files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no component emits /jobs?q= or /jobs?location=', () => {
    const offenders = files.filter(f => /\/jobs\?(q|location)=/.test(stripComments(read(f))));
    expect(offenders).toEqual([]);
  });
});

describe('homepage hero paints without JavaScript', () => {
  // Comments are allowed to describe the bug; only real code counts.
  const src = read('components/HomepageHero.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|\*).*$/gm, '');

  it('the h1 is not inside a framer-motion subtree gated at opacity 0', () => {
    // framer-motion serialises the initial variant into the SSR markup, which
    // shipped the text LCP candidate and the search form invisible until
    // hydration.
    expect(src).not.toMatch(/from 'framer-motion'/);
    expect(src).not.toContain('initial="hidden"');
    expect(src).toContain('<h1');
  });
});

describe('Easy Apply cannot silently drop or truncate a cover letter', () => {
  const client = read('components/InPlatformApplyForm.tsx');
  const server = read('app/api/applications/apply-direct/route.ts');

  it('the textarea cap matches the server cap exactly', () => {
    const clientCap = client.match(/MAX_COVER_LETTER_LENGTH\s*=\s*(\d+)/)?.[1];
    const serverCap = server.match(/MAX_COVER_LETTER_LENGTH\s*=\s*(\d+)/)?.[1];
    expect(clientCap).toBeDefined();
    expect(serverCap).toBeDefined();
    expect(clientCap).toBe(serverCap);
    expect(client).toContain('maxLength={MAX_COVER_LETTER_LENGTH}');
  });

  it('submit is blocked while either upload is still in flight', () => {
    const disabled = client.match(/disabled=\{submitting[^}]*\}/)?.[0] ?? '';
    expect(disabled).toContain('uploadingResume');
    expect(disabled).toContain('uploadingCoverLetter');
  });

  it('the confirmation panel reacts to the server auto-reject flag', () => {
    expect(client).toContain('data.autoRejected');
    // The old copy promised an email the API never reports having attempted.
    expect(client).not.toContain("They&apos;ll be notified by email");
  });
});

describe('the citation matches the byline the page actually claims', () => {
  const src = read('components/blog/EditorialToolbar.tsx');

  it('does not attribute posts to a nonexistent editorial team', () => {
    const citation = src.match(/const citation = `([^`]+)`/)?.[1];
    expect(citation).toBeDefined();
    expect(citation).not.toContain('Editorial Team');
    expect(citation).toMatch(/^PMHNP Hiring\. "\$\{title\}"/);
  });
});

describe('accordion answer panels are addressable', () => {
  for (const file of ['components/FAQAccordion.tsx', 'components/CategoryFAQAccordion.tsx']) {
    const src = read(file);

    it(`${file} exposes aria-expanded and aria-controls`, () => {
      expect(src).toContain('aria-expanded=');
      expect(src).toContain('aria-controls=');
    });

    it(`${file} scopes panel ids per instance so duplicates cannot collide`, () => {
      // /faq mounts six accordions; index-only ids restarted in every section.
      expect(src).toContain('useId');
      expect(src).not.toMatch(/id=\{`faq-answer-\$\{index\}`\}/);
    });
  }
});

describe('public lead-capture email fields have an accessible name', () => {
  const files = [
    'components/BlogEmailSignup.tsx',
    'components/ResourceDownloadGate.tsx',
    'components/SalaryGuideForm.tsx',
  ];

  for (const file of files) {
    it(`${file} names its email input with aria-label or a label element`, () => {
      const src = read(file);
      // A placeholder is not an accessible name and disappears on input.
      const emailInput = src.slice(src.indexOf('type="email"'));
      const named = /aria-label=/.test(emailInput.slice(0, 400)) || /htmlFor=/.test(src);
      expect(named).toBe(true);
    });
  }
});
