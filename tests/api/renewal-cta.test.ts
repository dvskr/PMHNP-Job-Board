/**
 * Renewal CTA regression lock.
 *
 * The expiry-warning email is the highest-intent moment in the employer
 * funnel: "your listing got N views and M applications, it expires Thursday,
 * renew for $X". Its button pointed at /employer/dashboard/<token>, which had
 * been reduced to `redirect('/employer/login')` — a bare login screen with no
 * listing, no renew button, and no context. Every renewal pitch sent while it was
 * broken landed on a dead end.
 *
 * These tests read the real source so the funnel cannot be silently broken
 * again by a route being stubbed out from under the email.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

/** Source of a named export's body, up to the next top-level export. */
function exportSource(decl: string): string {
  const src = read('lib/email-service.ts');
  const start = src.indexOf(decl);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf('\nexport ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

/** Source of the sendExpiryWarningEmail function body. */
function expiryEmailSource(): string {
  return exportSource('export async function sendExpiryWarningEmail');
}

describe('the shared renew CTA builder', () => {
  // The deep link now lives in one place because BOTH expiry emails (the
  // 5-day warning and the expiry-date final notice) point at it.
  const builder = exportSource('export function buildRenewCtaUrl');

  it('sends the employer somewhere that can actually renew', () => {
    expect(builder).toMatch(/\/employer\/dashboard/);
    expect(builder).toMatch(/redirectTo=/);
  });

  it('deep links the specific listing so the renew modal can open itself', () => {
    expect(builder).toMatch(/renew=\$\{encodeURIComponent\(jobId\)\}/);
  });

  it('does NOT link to the token dashboard, which is a redirect-only stub', () => {
    expect(builder).not.toMatch(/\/employer\/dashboard\/\$\{/);
  });
});

describe('expiry warning email CTA', () => {
  const body = expiryEmailSource();

  it('does NOT link to the token dashboard, which is a redirect-only stub', () => {
    expect(body).not.toMatch(/\/employer\/dashboard\/\$\{\s*dashboardToken\s*\}/);
  });

  it('uses the shared deep-link builder rather than rebuilding the URL', () => {
    expect(body).toMatch(/buildRenewCtaUrl\(jobId\)/);
  });

  it('still shows the value earned (views and applies) next to the ask', () => {
    expect(body).toMatch(/viewCount/);
    expect(body).toMatch(/applyClickCount/);
    expect(body).toMatch(/config\.renewalPrice/);
  });
});

describe('expiry final notice CTA', () => {
  const body = exportSource('export async function sendExpiryFinalNoticeEmail');

  it('reuses the same deep-link builder as the 5-day warning', () => {
    expect(body).toMatch(/buildRenewCtaUrl\(jobId\)/);
  });

  it('shows the posting\'s real numbers next to the ask', () => {
    expect(body).toMatch(/stats\.viewCount/);
    expect(body).toMatch(/stats\.applyClickCount/);
    expect(body).toMatch(/stats\.applicationCount/);
    expect(body).toMatch(/config\.renewalPrice/);
  });
});

describe('the routes the CTA depends on', () => {
  it('the employer login alias forwards redirectTo instead of dropping it', () => {
    const src = read('app/employer/login/page.tsx');
    expect(src).toMatch(/redirectTo/);
    // A bare redirect with no parameter forwarding is the old bug.
    expect(src).not.toMatch(/redirect\(\s*['"]\/login\?role=employer['"]\s*\)\s*\n\}/);
  });

  it('the legacy token route carries renew intent through login', () => {
    const src = read('app/employer/dashboard/[token]/page.tsx');
    expect(src).toMatch(/redirectTo=/);
    expect(src).toMatch(/renew=/);
    // It must not dead-end on a context-free login screen again.
    expect(src).not.toMatch(/redirect\(\s*['"]\/employer\/login['"]\s*\)/);
  });

  it('the dashboard opens the renew modal when handed ?renew=<jobId>', () => {
    const src = read('components/employer/EmployerDashboardClient.tsx');
    expect(src).toMatch(/searchParams\.get\(['"]renew['"]\)/);
    expect(src).toMatch(/setShowRenewModal\(true\)/);
  });

  it('the renewal checkout endpoint the modal posts to exists', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../app/api/create-renewal-checkout/route.ts'))).toBe(true);
  });
});

describe('the cron that sends it', () => {
  const cron = read('app/api/cron/expiry-warnings/route.ts');

  it('passes the job id through so the CTA can deep link', () => {
    expect(cron).toMatch(/job\.id/);
  });

  it('only targets employer-posted listings and dedupes on expiryWarningSentAt', () => {
    expect(cron).toMatch(/sourceType:\s*['"]employer['"]/);
    expect(cron).toMatch(/expiryWarningSentAt/);
  });

  it('dedupes the expiry-date final notice on its own stamp', () => {
    expect(cron).toMatch(/expiryFinalNoticeSentAt/);
  });
});
