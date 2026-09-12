/**
 * Static guards on the 2026-09 paid-first migration.
 *
 * The board moved off "first post free" onto a paid-first model: every post
 * goes through Checkout, the first post per employer identity is half price,
 * and there is one 60-day duration. The risk with a change of that shape is
 * not that it fails to ship, it is that a corner of it survives: one page
 * still promising a free post, one route still creating a job without
 * payment, one guarantee sentence that keeps promising a refund after the
 * flag is switched off. Each test below reads the real source and pins one
 * of those corners shut.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/lib/config';

const ROOT = process.cwd();

const cache = new Map<string, string>();
const read = (rel: string): string => {
  const hit = cache.get(rel);
  if (hit !== undefined) return hit;
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  cache.set(rel, src);
  return src;
};

/** Every .ts/.tsx file under a repo-relative directory, as repo-relative paths. */
function sourceFilesUnder(dir: string): string[] {
  const found: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (/\.tsx?$/.test(entry.name)) found.push(child);
    }
  };
  walk(dir);
  return found;
}

const USER_FACING_FILES = [...sourceFilesUnder('app'), ...sourceFilesUnder('components')];

/** Repo-relative paths whose text matches. Pattern must not carry /g. */
const filesMatching = (pattern: RegExp): string[] =>
  USER_FACING_FILES.filter((rel) => pattern.test(read(rel)));

/**
 * Same sweep as filesMatching, but each hit is reported as `path:line  text`
 * so a failure says which line to delete instead of only which file to open.
 * A match that straddles a line break (JSX wraps copy freely) still reports
 * the file, flagged so nobody hunts for a line number that does not exist.
 * Pattern must not carry /g: a stateful lastIndex would skip hits.
 */
function hitsFor(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const rel of filesMatching(pattern)) {
    const lines = read(rel).split('\n');
    const onOneLine = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => pattern.test(line));
    if (onOneLine.length === 0) {
      out.push(`${rel} (match spans a line break)`);
      continue;
    }
    for (const { line, number } of onOneLine) {
      out.push(`${rel}:${number}  ${line.trim().slice(0, 110)}`);
    }
  }
  return out;
}

/**
 * Renders offenders into the assertion itself so a failure names the files
 * instead of printing "expected 7 to be 0".
 */
const offenders = (files: string[], complaint: string): string =>
  files.length === 0 ? '' : `${complaint}:\n  ${files.join('\n  ')}`;

/**
 * Blanks out comments while preserving every character position, so line
 * numbers survive and an em dash in an engineering note is not mistaken for
 * user-facing copy. Deliberately simple: it understands line comments (except
 * after a colon, so the slashes in a URL survive) and block comments. Nothing
 * else: string and regex literals are not tracked.
 */
function blankComments(src: string): string {
  let out = '';
  let mode: 'code' | 'line' | 'block' = 'code';
  let i = 0;
  while (i < src.length) {
    const pair = src.slice(i, i + 2);
    if (mode === 'code') {
      if (pair === '//' && src[i - 1] !== ':') { mode = 'line'; out += '  '; i += 2; continue; }
      if (pair === '/*') { mode = 'block'; out += '  '; i += 2; continue; }
      out += src[i];
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; i += 1; continue; }
      out += ' ';
      i += 1;
      continue;
    }
    if (pair === '*/') { mode = 'code'; out += '  '; i += 2; continue; }
    out += src[i] === '\n' ? '\n' : ' ';
    i += 1;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('lib/config.ts drops the free-post vocabulary', () => {
  const src = read('lib/config.ts');
  // Comments stripped on purpose: the header explains what the new keys
  // replaced, and naming the retired key in that sentence is not a leftover.
  const code = blankComments(src);

  it('no longer exports freePostsPerEmail', () => {
    expect(code).not.toContain('freePostsPerEmail');
  });

  it('no longer exports freeDurationDays', () => {
    expect(code).not.toContain('freeDurationDays');
  });

  it('exports the discount gate and the three prices that replaced them', () => {
    expect(src).toContain('discountedPostsPerEmployer');
    expect(src).toContain('firstPostPrice');
    expect(src).toContain('stripeFirstPostPriceInCents');
    expect(src).toContain('priceInCentsFor');
  });
});

describe('the unpaid posting route is retired, not merely unused', () => {
  const rel = 'app/api/jobs/post-free/route.ts';
  const src = read(rel);

  it('answers 410 Gone', () => {
    expect(src, `${rel} should return a 410`).toContain('410');
    expect(src).toMatch(/status:\s*410/);
  });

  it('creates nothing: no job, no employer row, no transaction', () => {
    const writes = [/\bjob\.create\s*\(/, /\bemployerJob\.create\s*\(/, /\$transaction/]
      .filter((pattern) => pattern.test(src))
      .map((pattern) => String(pattern));
    expect(offenders(writes, `${rel} still writes to the database`)).toBe('');
  });

  it('carries no quota or pricing logic of its own any more', () => {
    expect(src).not.toContain('buildQuotaKeys');
    expect(src).not.toContain('FREE_EMAIL_DOMAINS');
    expect(src).not.toContain('expiresFromNow');
  });
});

describe('no surface still advertises a free first post', () => {
  /**
   * Deliberately wider than the phrase the first sweep searched for. Pinning
   * the exact string "first post free" is why two surfaces survived it: the
   * offer had been written as "first one free" on one page and "your first
   * post is free" on another. Copy varies, the promise does not, so the guard
   * matches the promise: a first {post,one,listing,job} that is, will be, or
   * simply reads as free.
   */
  const FREE_FIRST_POST = /first\s+(?:post|one|listing|job)\s+(?:is\s+|are\s+|will\s+be\s+|comes\s+)?free/i;

  it('no phrasing of "the first post is free" appears in app/ or components/', () => {
    expect(offenders(hitsFor(FREE_FIRST_POST), 'still selling a free first post')).toBe('');
  });

  it('the phrase "no credit card required" appears nowhere in app/ or components/', () => {
    expect(offenders(hitsFor(/no\s+credit\s+card\s+required/i), 'still promising that no card is needed')).toBe('');
  });

  /**
   * There is no trial in the paid-first model: the first post is a purchase at
   * a lower price, not a sample. A plan label, badge or billing row that still
   * says "Free trial" tells a paying employer they were never charged.
   */
  it('nothing is labelled a free trial', () => {
    expect(offenders(hitsFor(/free\s+trial/i), 'still labels something a free trial')).toBe('');
  });
});

describe('guarantee copy is gated on the config flag, not hardcoded', () => {
  const SURFACES = ['app/pricing/page.tsx', 'app/for-employers/page.tsx'];

  /** `config.firstPostGuarantee` used as a condition rather than merely mentioned. */
  const GATE = /config\.firstPostGuarantee\s*(?:&&|\?)|if\s*\(\s*!?config\.firstPostGuarantee\s*\)/g;
  /** The prescribed wording. Distinctive enough not to collide with a refund FAQ. */
  const PROMISE = /refund it in full/i;

  const countMatches = (src: string, pattern: RegExp): number => src.match(pattern)?.length ?? 0;

  /**
   * How many places the page puts the guarantee in front of a reader.
   *
   * The copy is normally hoisted into one constant and referenced from each
   * surface, so counting the wording alone would report one site however many
   * times it is rendered. When a constant holds it, its references are the
   * render sites; otherwise the inline occurrences are.
   */
  function guaranteeRenderSites(src: string): number {
    const declaration = src.match(
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*[`'"][^`'"]*refund it in full/i,
    );
    if (!declaration) return countMatches(src, new RegExp(PROMISE.source, 'gi'));
    const references = countMatches(src, new RegExp(`\\b${declaration[1]}\\b`, 'g'));
    return Math.max(0, references - 1); // minus the declaration itself
  }

  it.each(SURFACES)('%s renders the guarantee only behind the flag', (rel) => {
    const src = read(rel);

    if (!config.firstPostGuarantee) {
      // Flag off means the promise is gone from every surface, which is the
      // entire point of it being a flag.
      expect(offenders(PROMISE.test(src) ? [rel] : [],
        'still promises a refund while config.firstPostGuarantee is off')).toBe('');
      return;
    }

    expect(offenders(PROMISE.test(src) ? [] : [rel],
      'is missing the first-post guarantee copy')).toBe('');

    // Every place the promise is rendered needs a gate of its own. Counting
    // both sides catches the copy being dropped into a fourth spot without
    // one; it cannot tell which gate guards which site.
    const sites = guaranteeRenderSites(src);
    const gates = countMatches(src, GATE);
    expect(offenders(gates >= 1 ? [] : [rel],
      'states the guarantee unconditionally instead of gating on config.firstPostGuarantee')).toBe('');
    expect(offenders(
      gates >= sites ? [] : [`${rel} (${sites} render sites, ${gates} gates)`],
      'renders the guarantee in more places than it gates',
    )).toBe('');
  });

  it.each(SURFACES)('%s interpolates the guarantee numbers from config', (rel) => {
    const src = read(rel);
    if (!config.firstPostGuarantee) return;

    for (const key of ['firstPostPrice', 'guaranteeMinApplicants', 'guaranteeWindowDays']) {
      expect(offenders(src.includes(`config.${key}`) ? [] : [rel],
        `does not read config.${key}`)).toBe('');
    }
  });

  it.each(SURFACES)('%s hardcodes none of the guarantee numbers', (rel) => {
    const body = blankComments(read(rel));
    const literals = [/\$149\b/, /\$299\b/, /\$249\b/, /\b3 applicants\b/]
      .filter((pattern) => pattern.test(body))
      .map((pattern) => `${rel} contains the literal ${String(pattern)}`);
    expect(offenders(literals, 'hardcodes a price or threshold that lives in config')).toBe('');
  });
});

describe('no em dash or en dash in the pricing-funnel copy', () => {
  const SURFACES = [
    'app/pricing/page.tsx',
    'app/for-employers/page.tsx',
    'app/post-job/preview/page.tsx',
  ];

  it.each(SURFACES)('%s uses colons, commas, periods, or "X to Y"', (rel) => {
    const lines = blankComments(read(rel)).split('\n');
    const hits = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /[–—]/.test(line))
      .map(({ number }) => `${rel}:${number}`);
    expect(offenders(hits, 'uses an em dash or en dash in user-facing copy')).toBe('');
  });
});
