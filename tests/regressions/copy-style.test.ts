/**
 * House style for everything a reader can see: colons, commas, periods,
 * semicolons, parentheses, or "X to Y" for ranges. Never an em dash or an en
 * dash.
 *
 * Until 2026-09 the rule was only pinned on the three highest-traffic pricing
 * pages (tests/regressions/paid-first-pricing-static.test.ts), and the rest of
 * the site drifted: 681 dashes across 197 files, in headings, metadata
 * descriptions, email bodies, Stripe line items and pSEO narratives. A sweep
 * that covers only a few files is a rule that holds only on those files.
 *
 * This sweeps every .ts and .tsx under app/, components/ and lib/. Comments
 * are blanked first, because an engineering note is not copy and the rule
 * does not apply to it. A dash that has to survive as DATA (a regex character
 * class, a normalizer stripping dashes from scraped text) is written as its
 * escape, \u2013 or \u2014, which keeps the behaviour and keeps this green.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const ROOTS = ['app', 'components', 'lib'];
const DASH = /[\u2013\u2014]/;

/** Every .ts/.tsx under the swept roots, repo-relative with forward slashes. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  };
  for (const root of ROOTS) walk(path.join(ROOT, root));
  return out;
}

/**
 * Blank comments while preserving every character position, so a reported
 * line number is real. Understands // (except after a colon, so URLs survive)
 * and block comments. Deliberately simple: string and regex literals are not
 * tracked, which is why data dashes must be written as escapes.
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
      if (src[i] === '\n') { mode = 'code'; out += '\n'; } else out += ' ';
      i += 1;
      continue;
    }
    if (pair === '*/') { mode = 'code'; out += '  '; i += 2; continue; }
    out += src[i] === '\n' ? '\n' : ' ';
    i += 1;
  }
  return out;
}

describe('no em dash or en dash reaches a reader', () => {
  const files = sourceFiles();

  it('sweeps the whole user-facing surface, not a sample', () => {
    // Guards the guard: a wrong root would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(500);
  });

  it('every app/, components/ and lib/ source is dash-free outside comments', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const body = blankComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      if (!DASH.test(body)) continue;
      body.split('\n').forEach((line, index) => {
        if (DASH.test(line)) offenders.push(`${rel}:${index + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(
      offenders,
      `${offenders.length} em/en dash(es) in copy. Rewrite with a colon, comma, period or "X to Y"; ` +
        `a dash needed as data goes in as \\u2013 or \\u2014:\n  ${offenders.slice(0, 60).join('\n  ')}` +
        (offenders.length > 60 ? `\n  ... and ${offenders.length - 60} more` : ''),
    ).toEqual([]);
  });
});
