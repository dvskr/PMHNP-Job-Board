/**
 * CSRF is enforced once for the whole /api namespace, not route by route.
 *
 * lib/csrf.ts existed for a long time and was wired into a handful of
 * handlers. An audit in 2026-09 counted 83 mutating handlers that never
 * called it, including every admin write, and the pattern of each audit
 * closing only the routes it happened to inspect is what made the gap
 * permanent. Middleware now runs the check for every mutating /api request.
 *
 * Two things this has to get right, and both are load-bearing:
 *
 *  1. The exemptions. A webhook, a cron and an RFC 8058 one-click unsubscribe
 *     are all POSTs from a server or a mail provider, not a browser. Blocking
 *     them would break payment reconciliation and the one opt-out control
 *     Gmail operates on the recipient's behalf.
 *  2. Same-origin. A Vercel preview deployment serves its own UI from a host
 *     that is not in FIRST_PARTY_ORIGINS, so an allowlist alone would 403
 *     every mutation made from a preview. An Origin equal to the host being
 *     called cannot be forged by another site.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { enforceApiCsrf, isCsrfExemptPath } from '@/lib/csrf';

const HOST = 'pmhnphiring.com';
const FIRST_PARTY = `https://${HOST}`;
const EVIL = 'https://evil.example';
const PREVIEW_HOST = 'pmhnp-git-somebranch-fic.vercel.app';

function req(
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  host = HOST,
): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, {
    method,
    headers: { host, ...headers },
  });
}

const MUTATIONS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

describe('a foreign origin cannot drive an API mutation', () => {
  it.each(MUTATIONS)('%s from another site is refused', (method) => {
    const res = enforceApiCsrf(req(method, '/api/employer/settings', { origin: EVIL }), '/api/employer/settings');
    expect(res?.status).toBe(403);
  });

  it('a foreign referer with no origin is refused too', () => {
    const res = enforceApiCsrf(
      req('POST', '/api/applications', { referer: `${EVIL}/attack` }),
      '/api/applications',
    );
    expect(res?.status).toBe(403);
  });

  it('a malformed referer is refused rather than waved through', () => {
    const res = enforceApiCsrf(
      req('POST', '/api/applications', { referer: 'not a url' }),
      '/api/applications',
    );
    expect(res?.status).toBe(403);
  });

  it('covers the admin namespace, which route-by-route wiring never reached', () => {
    for (const path of [
      '/api/admin/users/user-fic-1',
      '/api/admin/jobs/bulk',
      '/api/admin/email/send',
      '/api/admin/blog/post-fic-1',
      '/api/admin/ai/flags',
    ]) {
      expect(enforceApiCsrf(req('POST', path, { origin: EVIL }), path)?.status, path).toBe(403);
    }
  });
});

describe('first-party and same-origin callers are untouched', () => {
  it.each(MUTATIONS)('%s from the site itself is allowed', (method) => {
    expect(enforceApiCsrf(req(method, '/api/saved-jobs', { origin: FIRST_PARTY }), '/api/saved-jobs')).toBeNull();
  });

  it('a preview deployment calling its own API is allowed', () => {
    // The whole point of the same-origin rule: this host is in no allowlist.
    const res = enforceApiCsrf(
      req('POST', '/api/saved-jobs', { origin: `https://${PREVIEW_HOST}` }, PREVIEW_HOST),
      '/api/saved-jobs',
    );
    expect(res).toBeNull();
  });

  it('a preview deployment is still not a licence for a foreign origin', () => {
    const res = enforceApiCsrf(
      req('POST', '/api/saved-jobs', { origin: EVIL }, PREVIEW_HOST),
      '/api/saved-jobs',
    );
    expect(res?.status).toBe(403);
  });

  it('a non-browser caller that sends no origin or referer is allowed', () => {
    expect(enforceApiCsrf(req('POST', '/api/applications'), '/api/applications')).toBeNull();
  });

  it('a Bearer-authenticated caller is allowed', () => {
    const res = enforceApiCsrf(
      req('POST', '/api/applications', { origin: EVIL, authorization: 'Bearer fictional-token' }),
      '/api/applications',
    );
    expect(res).toBeNull();
  });
});

describe('reads and non-API paths are never touched', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('%s is not a mutation', (method) => {
    expect(enforceApiCsrf(req(method, '/api/jobs', { origin: EVIL }), '/api/jobs')).toBeNull();
  });

  it('a page route is out of scope', () => {
    expect(enforceApiCsrf(req('POST', '/jobs', { origin: EVIL }), '/jobs')).toBeNull();
  });
});

describe('the exemptions keep working, because breaking them is worse', () => {
  const EXEMPT = [
    ['a Stripe webhook', '/api/webhooks/stripe'],
    ['a Resend webhook', '/api/webhooks/resend'],
    ['a cron run', '/api/cron/ingest'],
    ['the RFC 8058 one-click POST', '/api/one-click-unsubscribe'],
    ['the unsubscribe endpoint', '/api/email/unsubscribe'],
    ['the preferences endpoint', '/api/email/preferences'],
    ['a token-authenticated alert write', '/api/job-alerts/tok-fic-1'],
  ] as const;

  it.each(EXEMPT)('%s is exempt even with a foreign origin', (_label, path) => {
    expect(isCsrfExemptPath(path), path).toBe(true);
    expect(enforceApiCsrf(req('POST', path, { origin: EVIL }), path), path).toBeNull();
  });

  it('the exemption is a prefix match, not a substring match', () => {
    // /api/cron-admin must not inherit /api/cron's exemption.
    expect(isCsrfExemptPath('/api/cron-admin/run')).toBe(false);
    expect(isCsrfExemptPath('/api/webhooks-internal/x')).toBe(false);
    expect(isCsrfExemptPath('/api/job-alertsomething')).toBe(false);
  });

  it('nothing session-authenticated is exempt', () => {
    for (const path of [
      '/api/employer/profiles/unlock-bulk',
      '/api/admin/users/user-fic-1',
      '/api/applications',
      '/api/auth/profile',
      '/api/resume-studio/documents',
    ]) {
      expect(isCsrfExemptPath(path), path).toBe(false);
    }
  });
});

describe('middleware is where the check runs', () => {
  it('calls enforceApiCsrf before anything else can act on the request', async () => {
    const { readCode } = await import('../helpers/source');
    const src = readCode('middleware.ts');
    expect(src).toContain('enforceApiCsrf');
    // Ahead of the redirect rules, so a mutation is never 301'd instead of
    // being refused.
    const guard = src.indexOf('enforceApiCsrf(request');
    const firstRedirect = src.indexOf('NextResponse.redirect');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstRedirect);
  });
});
