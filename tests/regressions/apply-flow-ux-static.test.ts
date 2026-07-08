/**
 * Regression guards for the 2026-07 apply-flow UX fixes. Each test reads the
 * real source file and asserts the fix is still in place, so a future edit
 * can't silently reintroduce the bug.
 *
 *   U1 — card apply buttons must route through the detail page (?apply=1)
 *        instead of window.open'ing job.applyLink directly. The direct open
 *        bypassed BOTH the sign-up wall and /api/jobs/[id]/track-apply, so
 *        apply_click_count undercounted the metric employers pay for.
 *   U2 — the auth modal must not promise vaporware (Chrome extension) and
 *        must offer the real application-tracking benefit instead.
 *   U3 — ApplyButton must await the in-flight auth check before branching,
 *        so a fast click can't flash the sign-in wall at authed users.
 *   U4 — the mobile sticky bar stays a single row (compact Apply + icon
 *        Save) with no MessageEmployer button inside it.
 *   U5 — SaveJobButton persists through useSavedJobs (server sync for
 *        authed users), not raw localStorage-only writes.
 *   U6 — saved page "Clear all" is confirm()-guarded like its applied twin.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('U1 — job cards route applies through the detail page', () => {
  it('JobCard has no direct window.open on the apply link', () => {
    const src = read('components/JobCard.tsx');
    expect(src).not.toContain('window.open(job.applyLink');
    expect(src).toContain('?apply=1');
  });

  it('JobCard labels are "Easy Apply" (platform) or "Apply" — never "Direct Apply"', () => {
    const src = read('components/JobCard.tsx');
    expect(src).not.toContain('Direct Apply');
    expect(src).toContain('Easy Apply');
  });
});

describe('U2 — auth modal promises only real benefits', () => {
  it('no Chrome-extension / coming-soon bullet; tracking benefit present', () => {
    const src = read('components/ApplyButton.tsx');
    expect(src).not.toContain('Chrome extension');
    expect(src).not.toContain('Coming soon');
    expect(src).toContain('Track all your applications in one place');
  });
});

describe('U3 — apply click awaits the auth check (no wall flash)', () => {
  it('handleApply awaits the stored auth promise before branching', () => {
    const src = read('components/ApplyButton.tsx');
    expect(src).toMatch(/authPromiseRef/);
    expect(src).toMatch(/await authPromiseRef\.current/);
  });
});

describe('U4 — mobile sticky bar is one row', () => {
  it('sticky bar uses compact ApplyButton + icon SaveJobButton, no MessageEmployer', () => {
    const src = read('app/jobs/[slug]/page.tsx');
    const stickyStart = src.indexOf('Sticky Apply Bar - Mobile Only');
    expect(stickyStart).toBeGreaterThan(-1);
    const sticky = src.slice(stickyStart);
    expect(sticky).toContain('compact');
    expect(sticky).toContain('variant="icon"');
    expect(sticky).not.toContain('<MessageEmployerButton');
  });

  it('hero shows the freshness badge and mobile users keep a Message mount', () => {
    const src = read('app/jobs/[slug]/page.tsx');
    expect(src).toMatch(/<Badge variant="outline" size="md">\{freshness\}<\/Badge>/);
    // Messaging must stay reachable on phones for employer posts (the
    // sidebar copy is hidden lg:block).
    expect(src).toMatch(/lg:hidden[^>]*>\s*<MessageEmployerButton/);
  });
});

describe('U5 — SaveJobButton syncs saves for authenticated users', () => {
  it('uses the useSavedJobs hook rather than raw localStorage writes', () => {
    const src = read('components/SaveJobButton.tsx');
    expect(src).toContain("from '@/lib/hooks/useSavedJobs'");
    expect(src).not.toContain("from '@/lib/saved-jobs'");
  });
});

describe('U6 — saved page clear-all is confirmation-guarded', () => {
  it('both Clear all and Clear history run behind confirm()', () => {
    const src = read('app/saved/page.tsx');
    const confirms = src.match(/\bconfirm\(/g) ?? [];
    expect(confirms.length).toBeGreaterThanOrEqual(2);
    // The saved-tab handler specifically must be guarded.
    const handler = src.slice(src.indexOf('const handleClearAll'), src.indexOf('const handleClearApplied'));
    expect(handler).toContain('confirm(');
  });
});
