/**
 * Static regression guards for medium audit fixes that are config/wiring rather
 * than unit-testable behavior. Each reads the real source and asserts the fix
 * is still present so a future edit can't silently undo it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('classify-fields no longer logs PII', () => {
  it('does not log the profileContext preview (name/email/phone/address)', () => {
    const src = read('app/api/autofill/classify-fields/route.ts');
    expect(src).not.toMatch(/profileContext\.substring\(\s*0\s*,\s*300\s*\)/);
  });
});

describe('email-job sanitizes user input', () => {
  it('escapes the title and constrains the CTA URL to same-origin', () => {
    const src = read('app/api/email-job/route.ts');
    expect(src).toContain('escapeHtml');
    expect(src).toContain('safeJobUrl');
    expect(src).not.toMatch(/\$\{jobTitle\}/); // raw interpolation removed
  });
});

describe('trace scripts read credentials from env', () => {
  for (const f of ['scripts/trace-bulk-unlock.ts', 'scripts/trace-analytics.ts', 'scripts/trace-pagination-nav.ts']) {
    it(`${f} has no hardcoded password`, () => {
      const src = read(f);
      expect(src).not.toContain('1729@Akari');
      expect(src).toContain('process.env.TEST_LOGIN_PASSWORD');
    });
  }
});

describe('RUNS_PER_DAY matches vercel.json cron cadence', () => {
  it('has the corrected per-source run counts', () => {
    const src = read('lib/health/source-presence.ts');
    expect(src).toMatch(/usajobs:\s*1/);
    expect(src).toMatch(/ashby:\s*2/);
    expect(src).toMatch(/jazzhr:\s*2/);
    expect(src).toMatch(/bamboohr:\s*2/);
    expect(src).toMatch(/workable:\s*2/);
    expect(src).toMatch(/doccafe:\s*2/);
    expect(src).toMatch(/healthcareercenter:\s*2/);
  });
});

describe('LLM-enriched salaries are stored as annual', () => {
  it("ingestion-service sets salaryPeriod 'year', not the original unit", () => {
    const src = read('lib/ingestion-service.ts');
    expect(src).toMatch(/salaryPeriod\s*=\s*'year'/);
    expect(src).not.toMatch(/next\.salaryPeriod\s*=\s*llm\.salary_period/);
  });
  it("enrich-jobs cron sets salaryPeriod 'year'", () => {
    const src = read('app/api/cron/enrich-jobs/route.ts');
    expect(src).toMatch(/salaryPeriod\s*=\s*'year'/);
    expect(src).not.toMatch(/salaryPeriod\s*=\s*extracted\.salary_period/);
  });
});

describe('salary-guide uses a declared crypto API, not the phantom uuid dep', () => {
  it('imports randomUUID from crypto and drops uuid', () => {
    const src = read('app/api/salary-guide/route.ts');
    expect(src).toContain("from 'crypto'");
    expect(src).not.toMatch(/from ['"]uuid['"]/);
  });
});

describe('tailwind tokens revived for v4', () => {
  it('globals.css defines the primary scale and fade-in-up animation', () => {
    const src = read('app/globals.css');
    expect(src).toContain('--color-primary-100');
    expect(src).toContain('--animate-fade-in-up');
    expect(src).toContain('@keyframes fadeInUp');
  });
});

describe('employer ownership fallback is always guarded with userId: null', () => {
  // Repo-wide guard: an OR-branch like `{ contactEmail: user.email }` (in any
  // form — `user.email!`, `user.email || ''`, `user.email ?? ''`) lets a user
  // whose email equals another account's job contactEmail act on that account's
  // rows (P5.A impersonation). The guarded form is `{ userId: null, contactEmail: ... }`.
  // This walks all of app/api so a reintroduction in ANY route fails CI.
  function walk(dir: string, acc: string[] = []): string[] {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return acc;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel, acc);
      else if (e.name.endsWith('.ts')) acc.push(rel);
    }
    return acc;
  }

  it('no unguarded `{ contactEmail: user.email...` OR-branch exists in app/api', () => {
    const offenders: string[] = [];
    // An OR-branch object that opens with contactEmail (not preceded by userId:null).
    const bad = /\{\s*contactEmail:\s*user\.email/;
    for (const f of walk('app/api')) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const line of src.split('\n')) {
        if (bad.test(line)) offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(offenders, `Unguarded contactEmail OR-branches:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the known guarded routes still carry the userId: null guard', () => {
    for (const f of [
      'app/api/employer/invoice/route.ts',
      'app/api/employer/billing/route.ts',
      'app/api/employer/analytics/route.ts',
      'app/api/employer/analytics/csv/route.ts',
      'app/api/employer/analytics/benchmarks/route.ts',
      'app/api/employer/settings/route.ts',
      'app/api/employer/messages/route.ts',
      'app/api/employer/jobs/[jobId]/archive/route.ts',
      'app/api/employer/candidates/[id]/route.ts',
      'app/api/employer/profiles/unlock-bulk/route.ts',
      'app/api/employer/testimonials/route.ts',
      'app/api/employer/profile-snapshot/route.ts',
    ]) {
      expect(read(f), `${f} missing userId: null guard`).toMatch(/userId:\s*null,\s*contactEmail:\s*user\.email/);
    }
  });
});
