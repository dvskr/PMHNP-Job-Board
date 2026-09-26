/**
 * Two things a reader must never be shown: a person who does not exist, and a
 * link that goes nowhere.
 *
 * Found 2026-09-26 while clearing the audit backlog.
 *
 *  - app/login/page.tsx filled AuthLayout's `testimonial` prop with a quote
 *    attributed to a named clinician with a credential and a city. Nobody said
 *    it, and it sat on the signin page of a hiring site whose whole promise is
 *    that the people are real. The prop is now `note: AuthPanelNote`, holding
 *    a statement the platform makes about itself. That rename is the actual
 *    fix: /signup had already been cleaned of its fake persona once and had
 *    put honest first-party copy through a slot still named for an
 *    endorsement, which is exactly the shape that invites the next one.
 *  - Two CTAs pointed at `/#subscribe`. No element on the homepage carries
 *    that id, so the fragment resolved to nothing and both buttons dropped the
 *    reader at the top of the homepage. /job-alerts is the real destination.
 *
 * Both sweeps cover the tree rather than naming the files that were wrong,
 * because the failure mode is a third file doing the same thing. Comments are
 * blanked first: the notes recording why these were wrong necessarily quote
 * the very strings being banned.
 */
import { describe, it, expect } from 'vitest';
import { readCode, sourceFilesUnder } from '../helpers/source';

const ROOTS = ['app', 'components'];

const sourceFiles = (): string[] => sourceFilesUnder(ROOTS);
const code = (rel: string): string => readCode(rel);

describe('no invented person is presented as a real one', () => {
  it('AuthLayout offers no slot named for an endorsement', () => {
    expect(code('components/auth/AuthLayout.tsx')).not.toMatch(/testimonial/i);
  });

  it('the slot it does offer is attributed to the platform, not a person', () => {
    const src = code('app/signup/page.tsx');
    // Every branch of the side panel names the platform as the speaker.
    const sources = [...src.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(s).toBe('PMHNP Hiring');
  });

  it('nothing anywhere passes a testimonial to an auth page', () => {
    const offenders = sourceFiles().filter((rel) => /testimonial\s*=\s*\{/.test(code(rel)));
    expect(
      offenders,
      `A testimonial has to name someone who actually said it. Offenders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('no CTA points at a homepage fragment that does not exist', () => {
  it('nothing links to /#subscribe', () => {
    const offenders: string[] = [];
    for (const rel of sourceFiles()) {
      code(rel).split('\n').forEach((line, i) => {
        if (line.includes('/#subscribe')) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(
      offenders,
      `No homepage element carries id="subscribe"; use /job-alerts. Offenders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('guards the guard: the sweep actually reads the tree', () => {
    expect(sourceFiles().length).toBeGreaterThan(300);
  });
});
