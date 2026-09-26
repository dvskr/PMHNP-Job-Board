/**
 * Locks for the site shell: root layout, header and footer.
 *
 * These four surfaces render on (nearly) every route, so a regression in any
 * of them is a sitewide regression. Each assertion below pins the RULE, not
 * one spelling of the code that implements it, because the shell gets
 * restyled often and a test that pins markup just gets deleted.
 *
 * Source-reading rather than rendering: Header pulls in framer-motion,
 * next/navigation and the Supabase browser client, so a jsdom render here
 * would be testing the mocks.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const header = read('components/Header.tsx');
const footer = read('components/Footer.tsx');
const layout = read('app/layout.tsx');

describe('mobile nav dialog keeps its a11y promises', () => {
  it('wires the shared focus trap, not just an Escape key handler', () => {
    // The menu declares role="dialog" aria-modal="true", which promises three
    // things: focus moves in on open, Tab cycles inside, focus returns to the
    // trigger on close. It delivered none of them: Tab walked out into the
    // hero search and the employer cards behind the overlay. useFocusTrap is
    // the same hook MobileFilterDrawer / ReportJobButton / ComposeMessageModal
    // use, so a fix that reimplements trapping by hand would still be a bug.
    expect(header).toContain("from '@/lib/hooks/useFocusTrap'");
    expect(header).toMatch(/useFocusTrap<[^>]*>\(\{\s*isOpen:\s*isMenuOpen/);
  });

  it('attaches the trap container to the element carrying aria-modal', () => {
    // A trap whose ref never reaches the dialog element is a no-op that type
    // checks. Assert the ref and the aria-modal attribute sit in one opening
    // tag: the overlay element itself.
    const openTagStart = header.indexOf('<m.div');
    expect(openTagStart).toBeGreaterThan(-1);
    const openTag = header.slice(openTagStart, header.indexOf('>', openTagStart));
    expect(openTag).toContain('ref={menuRef}');
    expect(openTag).toContain('aria-modal="true"');
  });

  it('does not keep a second, competing Escape handler', () => {
    // useFocusTrap owns Escape now. Two document-level handlers both calling
    // setIsMenuOpen(false) is survivable, but it is also how the next person
    // concludes the trap is optional.
    expect(header).not.toMatch(/e\.key === 'Escape'/);
  });
});

describe('sitewide nav links cost nothing to crawl', () => {
  it('the footer does not link /saved, which robots.txt disallows', () => {
    // /saved is signed-in only: middleware serves it noindex,nofollow and
    // robots.txt re-blocked it once AUTH_REBLOCK_DATE passed. A link in the
    // sitewide footer is how a blocked URL earns GSC's "Indexed, though
    // blocked by robots.txt".
    expect(footer).not.toMatch(/href:\s*'\/saved'/);
  });

  it('the header links the canonical /jobs/new-grad, not the redirecting slug', () => {
    // next.config.ts permanently redirects /new-grad here, so the bare slug
    // in a sitewide menu spent a redirect hop on every page.
    expect(header).toMatch(/href:\s*'\/jobs\/new-grad'/);
    expect(header).not.toMatch(/href:\s*'\/new-grad'/);
  });
});

describe('only the LCP image claims high fetch priority', () => {
  it('the header logo is eager but not priority', () => {
    // The header renders from the root layout, so `priority` on its 56px logo
    // emitted a fetchpriority=high preload on EVERY route, competing with the
    // real LCP image (hero / category / blog cover), which is priority too.
    const logo = header.slice(header.indexOf('src="/logo.png"'));
    const tagEnd = logo.indexOf('/>');
    const tag = logo.slice(0, tagEnd);
    expect(tag).not.toMatch(/\bpriority\b/);
    expect(tag).toContain('loading="eager"');
  });
});

describe('the private legal name never reaches a client bundle', () => {
  // config/brand.ts carries legal.founderName, which it documents as
  // legal-context-only ("Do NOT render this in user-visible UI or schema").
  // Bundlers do not tree-shake individual properties off an imported object
  // literal, so ANY 'use client' component importing that module ships the
  // name. These are the components the root layout renders on every route, so
  // an import here is an import in the chunk every visitor downloads.
  const ALWAYS_RENDERED_CLIENT_COMPONENTS = [
    'components/Header.tsx',
    'components/Footer.tsx',
    'components/BottomNav.tsx',
    'components/LayoutShell.tsx',
    'components/MainContent.tsx',
    'components/MobileHideOnAppRoutes.tsx',
  ];

  it.each(ALWAYS_RENDERED_CLIENT_COMPONENTS)('%s does not import the brand config', (rel) => {
    expect(read(rel)).not.toMatch(/^\s*import\s[^\n]*from\s+['"]@\/config\/brand['"]/m);
  });

  it('the server layout is the one passing those strings down', () => {
    expect(footer).toContain("'use client'");
    expect(layout).toContain('legalEntityName={brand.legal.entityName}');
  });
});

describe('root layout head and graph', () => {
  it('drops preconnects to Google Fonts hosts next/font never contacts', () => {
    // Inter and Lora (and Newsreader on /blog) load through next/font/google,
    // which downloads the files at build time and self-hosts them under
    // /_next/static/media. The hints were two wasted TLS handshakes in the
    // critical window on every page load.
    const hints = [...layout.matchAll(/<link[^>]*href="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(hints.some((h) => h.includes('fonts.googleapis.com'))).toBe(false);
    expect(hints.some((h) => h.includes('fonts.gstatic.com'))).toBe(false);
  });

  it('derives the asset preconnect from ASSET_BASE instead of a literal host', () => {
    expect(layout).toContain("from '@/lib/asset-url'");
    expect(layout).not.toContain('sggccmqjzuimwlahocmy.supabase.co');
  });

  it('gives the creator a Person node with a stable @id the author fields can reference', () => {
    // Without an @id, every byline is a bare name string and no entity
    // reconciler can connect the salary guide's author to a page about them.
    expect(layout).toContain('"@type": "Person"');
    expect(layout).toContain('/about#creator');
    expect(layout).toContain('brand.legal.creatorName');
    // Attribution rule: the public Organization never carries a `founder`.
    expect(layout).not.toMatch(/"founder"/);
  });

  it('uses one canonical Organization logo URL', () => {
    // logo and image pointed at two different files while other publisher
    // blocks used a third, which is three Organization signals to reconcile.
    const org = layout.slice(layout.indexOf('"@type": "Organization"'), layout.indexOf('"sameAs"'));
    const logoUrls = [...org.matchAll(/\$\{brand\.baseUrl\}(\/[\w.-]+\.png)/g)].map((m) => m[1]);
    expect(logoUrls.length).toBeGreaterThan(1);
    expect(new Set(logoUrls).size).toBe(1);
  });
});

describe('title separators follow house style', () => {
  it('no spaced hyphen stands in for a dash in any layout title string', () => {
    // House style is colons, commas, periods, or "X to Y". The dash sweep
    // caught em and en dashes; a spaced hyphen reads the same in a SERP and
    // slipped through, leaving the root default (inherited by every page
    // without its own title) inconsistent with the rest of the title set.
    const titleLines = layout
      .split('\n')
      .filter((l) => /^\s*(default|template|title|alt):/.test(l));
    expect(titleLines.length).toBeGreaterThan(0);
    for (const line of titleLines) {
      expect(line, `spaced hyphen in: ${line.trim()}`).not.toMatch(/\S - \S/);
    }
  });
});
