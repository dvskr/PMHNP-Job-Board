/**
 * The brand name belongs to the root title template, once.
 *
 * app/layout.tsx defines `title: { template: '%s | PMHNP Hiring' }`. Next
 * applies that template to every plain-string child title and to a nested
 * layout's `title.default`, so a page that spells the suffix out itself
 * renders "... | PMHNP Hiring | PMHNP Hiring": 74 characters on an indexable,
 * sitemapped page, past the SERP pixel limit and a classic trigger for Google
 * rewriting the title.
 *
 * A title that genuinely needs the whole string (the salary guide, the FAQ)
 * opts out with `title: { absolute: '...' }`, which the template never
 * touches. That is the invariant here: a hardcoded brand suffix is legal only
 * inside an `absolute:`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');

/** `title: '... | PMHNP Hiring'` (or the non-brand "PMHNP Jobs" variant). */
const HARDCODED_SUFFIX = /title:\s*[`'"][^`'"]*\|\s*PMHNP\s+(Hiring|Jobs)[`'"]/;
/** A nested layout's `default:` passes through the root template too. */
const HARDCODED_DEFAULT = /default:\s*[`'"][^`'"]*\|\s*PMHNP\s+(Hiring|Jobs)[`'"]/;

/**
 * Files owned by other workstreams that still carry the doubled suffix. Each
 * is a handoff, not an exemption: drop the ` | PMHNP Hiring` from the string
 * so the root template supplies it once, and delete the entry here. Noindexed
 * pages are in the list too, because the doubled name still shows in the
 * browser tab and in anything that quotes the title of a shared link.
 */
const PENDING_HANDOFF = new Set([
  'app/companies/page.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/resume-studio/page.tsx',
  'app/employer/analytics/page.tsx',
  'app/employer/layout.tsx',
  'app/employer/login/page.tsx',
  'app/employer/signup/page.tsx',
  'app/forgot-password/layout.tsx',
  'app/login/page.tsx',
  'app/onboarding/professional/page.tsx',
  'app/settings/layout.tsx',
  'app/signup/page.tsx',
]);

function metadataFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^(page|layout)\.tsx?$/.test(entry.name)) {
        out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(path.join(ROOT, 'app'));
  return out;
}

/** Drop `absolute:` objects: those opt out of the template by design. */
function withoutAbsoluteTitles(src: string): string {
  return src.replace(/absolute:\s*[`'"][^`'"]*[`'"]/g, 'absolute: OMITTED');
}

describe('no page hardcodes the brand suffix the root template already adds', () => {
  const files = metadataFiles();

  it('sweeps every page and layout under app/', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('every plain-string title leaves the brand to the template', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (PENDING_HANDOFF.has(rel)) continue;
      const src = withoutAbsoluteTitles(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      src.split('\n').forEach((line, i) => {
        if (HARDCODED_SUFFIX.test(line) || HARDCODED_DEFAULT.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
        }
      });
    }
    expect(
      offenders,
      'Drop the brand suffix so app/layout.tsx\'s title.template supplies it once, ' +
        'or move the whole string into `title: { absolute: ... }`:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the root template is still the thing that supplies the brand', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    expect(src).toMatch(/template:\s*[`'"]%s \|/);
  });
});
