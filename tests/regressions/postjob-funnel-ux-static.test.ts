/**
 * Static regression guards for the 2026-07 post-job funnel UX fixes.
 * The auth wall STAYS (operator decision) — these pin the fixes that make
 * it convert: offer copy on the wall, a validated return path through
 * signup/confirm, price transparency at the money moment, actionable
 * errors, and draft recovery. Each reads the real source and asserts the
 * fix is still present so a future edit can't silently undo it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('post-job wall carries the offer and a return path', () => {
  const src = read('app/post-job/page.tsx');

  it('headline leads with the free first post, not just the login demand', () => {
    expect(src).toContain('Your first job post is free');
    expect(src).not.toContain('You must be logged in as an employer to post jobs.');
  });

  it('signup CTA returns the user to /post-job after signup', () => {
    expect(src).toContain('/signup?role=employer&redirectTo=/post-job');
  });

  it('login CTA still exists — the wall was not removed', () => {
    expect(src).toContain('/login?next=/post-job');
  });

  it('empty Plan step is gone; pricingTier still submits from defaultValues', () => {
    expect(src).not.toMatch(/label:\s*'Plan'/);
    expect(src).not.toMatch(/currentStep\s*<\s*5/);
    expect(src).not.toMatch(/currentStep\s*===\s*5/);
    expect(src).toMatch(/pricingTier:\s*'pro'/); // defaultValues untouched
  });
});

describe('signup return path is validated, never an open redirect', () => {
  it('SignUpForm reads redirectTo through safeInternalPath and threads it into emailRedirectTo', () => {
    const src = read('components/auth/SignUpForm.tsx');
    expect(src).toContain("safeInternalPath(searchParams.get('redirectTo')");
    expect(src).toMatch(/emailRedirectTo:[\s\S]*auth\/confirm[\s\S]*redirectTo/);
    // Post-auth route honors the validated target
    expect(src).toContain('router.push(redirectTo ??');
  });

  it('auth/confirm honors redirectTo via safeInternalPath instead of hardcoding /dashboard', () => {
    const src = read('app/auth/confirm/page.tsx');
    expect(src).toContain("safeInternalPath(urlParams.get('redirectTo'), '/dashboard')");
    expect(src).toContain('router.push(nextPath)');
    expect(src).not.toMatch(/setTimeout\(\(\) => router\.push\('\/dashboard'\)/);
  });
});

describe('preview page is honest at the money moment', () => {
  const src = read('app/post-job/preview/page.tsx');

  it('paid posts skip the doomed free call and label the CTA with the price', () => {
    expect(src).toContain('goesToCheckout');
    expect(src).toContain('Continue to Payment');
    expect(src).toContain('has used its free post');
  });

  it('errors surface the server message field, not just the terse error code', () => {
    expect(src).toContain('result.message || result.error');
  });

  it('known quota reasons get an up-front card with a fix path', () => {
    expect(src).toContain("quotaStatus.reason === 'free-email-provider'");
    expect(src).toContain("quotaStatus.reason === 'unauthenticated'");
    expect(src).toContain('/login?next=/post-job/preview');
  });

  it('success redirect carries the jobId for the P7 conversion event', () => {
    expect(src).toMatch(/\/success\?free=true&jobId=/);
  });
});

describe('checkout page', () => {
  const src = read('app/post-job/checkout/page.tsx');

  it('renders the Application URL row only for external-apply jobs', () => {
    expect(src).toContain('hasExternalApply');
    expect(src).toMatch(/hasExternalApply\s*\?/);
  });

  it('explains why the post is paid (free-post context line)', () => {
    expect(src).toContain('Your free post is used');
  });

  it('uses the clay design tokens, not default Tailwind grays', () => {
    expect(src).toContain('const cardBase');
    expect(src).not.toContain('bg-white rounded-lg shadow-md');
  });
});

describe('signup side panel uses real content, not invented personas', () => {
  const src = read('app/signup/page.tsx');

  it('the fabricated James R. quote is gone', () => {
    expect(src).not.toContain('James R.');
  });

  it('employer variant renders live platform numbers', () => {
    expect(src).toContain('getEmployerStats');
    expect(src).toMatch(/Join \$\{stats\.totalCompanies/);
  });
});

describe('for-employers page honesty', () => {
  const src = read('app/for-employers/page.tsx');

  it('stats pills are gated so "0+" never renders on DB failure', () => {
    expect(src).toMatch(/stats\.totalJobs > 0 &&/);
  });

  it('listing-duration card discloses the 30-day free window', () => {
    expect(src).toContain('free first post runs {config.freeDurationDays} days');
  });
});

describe('employer dashboard surfaces the unfinished draft', () => {
  const src = read('components/employer/EmployerDashboardClient.tsx');

  it('fetches GET /api/job-draft and renders the continue card', () => {
    expect(src).toContain("fetch('/api/job-draft'");
    expect(src).toContain('Continue your unfinished post');
  });
});
