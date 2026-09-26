/**
 * Two defects shared by useSavedJobs and useAppliedJobs (hunt 2026-09-03).
 *
 *  1. Every mutation ended in `.catch(() => {})`. The bookmark stayed filled
 *     in and localStorage recorded it, then the next sync replaced the whole
 *     local map with the server's, so the save silently disappeared. For
 *     markApplied that swallowed record is the ONLY trace that a candidate
 *     applied to an external job.
 *
 *  2. Sign-out cleared no client state, and `migrated` lives at module scope.
 *     The next account to sign in on the same browser had the previous user's
 *     leftover localStorage read as "local only" and POSTed into ITS account,
 *     so A's saved jobs and application history landed in B's.
 *
 * Vitest runs in a node environment with no DOM here, so these are source
 * assertions in the same style as tests/lib/applied-jobs-hydration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const HOOKS = {
  useSavedJobs: fs.readFileSync(path.join(process.cwd(), 'lib/hooks/useSavedJobs.ts'), 'utf8'),
  useAppliedJobs: fs.readFileSync(path.join(process.cwd(), 'lib/hooks/useAppliedJobs.ts'), 'utf8'),
};

/** Source with comment lines removed — the fixed patterns are quoted in the
 *  explanatory comments, so a naive substring search would match those. */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

describe.each(Object.entries(HOOKS))('%s failure handling', (name, src) => {
  it('has no fire-and-forget catch that swallows a rejected mutation', () => {
    expect(codeOnly(src)).not.toContain('.catch(() => {})');
  });

  it('rolls the optimistic update back when the server refuses it', () => {
    expect(src).toContain('function rollback(');
    // Every mutation fetch must inspect res.ok rather than treating a 500 as
    // success just because the promise resolved.
    const okChecks = src.match(/if \(!res\.ok\) throw new Error/g) ?? [];
    expect(okChecks.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a non-ok sync response instead of returning silently', () => {
    expect(src).not.toMatch(/if \(!res\.ok\) return;/);
    expect(src).toMatch(/failed with \$\{res\.status\}/);
  });

  it('exports a sign-out reset that clears the module cache and localStorage', () => {
    const fn = name === 'useSavedJobs'
      ? 'export function resetSavedJobsForSignOut'
      : 'export function resetAppliedJobsForSignOut';
    expect(src).toContain(fn);

    const start = src.indexOf(fn);
    const body = src.slice(start, src.indexOf('\n}', start));
    // Leaving `migrated` true would skip the migration on the next account;
    // leaving it false without clearing storage is exactly the bleed.
    expect(body).toContain('migrated = false');
    expect(body).toContain('isAuth = false');
    expect(body).toContain('localStorage.removeItem');
  });
});
