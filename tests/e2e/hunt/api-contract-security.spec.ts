import fs from 'fs';
import path from 'path';
import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
} from '@playwright/test';
import { attachErrorCollectors, assertClean } from './_helpers';
import {
  loginAtPath,
  getSeekerCreds,
  getEmployerCreds,
  getAdminCreds,
  type AuthCreds,
} from '../fixtures/auth';

/**
 * Bug hunt slice: API contract + security probing (run tag h0902).
 *
 * Journey: an anonymous caller, a job seeker, an employer and an admin each
 * poke every route under app/api with the wrong auth, the wrong method,
 * malformed bodies, foreign ids, foreign origins, abusive query params and
 * hostile uploads. Every response must be a clean 4xx: never a 5xx, never
 * another user's data.
 *
 * Environment notes baked into the design:
 *   - Rate limiting keys on `x-forwarded-for` first (lib/rate-limit.ts
 *     getClientIp). All local Playwright traffic shares 127.0.0.1, so every
 *     context / sweep here sends its own fake private IP to keep the limiters
 *     deterministic and to avoid tripping the limits for other suites. On
 *     Vercel that header is overwritten by the platform, so this is a local
 *     testing convenience, not a bypass that exists in production.
 *   - `maxRedirects: 0` everywhere: some routes 302 to NEXT_PUBLIC_BASE_URL,
 *     which in a local .env can point at a different port / product.
 *   - /api/cron/* is probed ONLY with a method the handlers never export.
 *     lib/auth/verify-cron-or-admin.ts skips auth entirely when
 *     NODE_ENV=development, so a GET against the dev server would actually
 *     run the cron (ingest, purge, email sends). Never do that from a test.
 *   - lib/origins.ts builds FIRST_PARTY_ORIGINS from NEXT_PUBLIC_BASE_URL plus
 *     hard-coded localhost:3000/3001. When the dev server runs on any other
 *     port the six verifyCsrf-gated routes reject the app's OWN browser
 *     requests, so the CSRF tests here drive them through APIRequestContext
 *     (no Origin header) and assert only on the foreign-Origin case.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const AGAINST_PROD = !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const REQUEST_TIMEOUT_MS = 90_000;
const SWEEP_TEST_TIMEOUT_MS = 25 * 60_000;
const SWEEP_CONCURRENCY = 4;
const EVIL_ORIGIN = 'https://evil.example';
const GARBAGE_ID = 'nonexistent-id-e2e-h0902';
const GARBAGE_TOKEN = 'garbage-token-e2e-h0902';

type Role = 'seeker' | 'employer' | 'admin';
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ── Route catalog ───────────────────────────────────────────────────────────
// Every app/api/**/route.ts with the HTTP methods it exports (enumerated from
// the repo on 2026-09-02). Dynamic segments are kept in [brackets] and
// substituted with garbage values at request time.
const ROUTE_CATALOG = `
/api/admin/ai/flags|GET,POST
/api/admin/ai/stats|GET
/api/admin/analytics|GET
/api/admin/blog/[id]|DELETE,GET,PUT
/api/admin/blog|GET,POST
/api/admin/cron-list|GET
/api/admin/email/audience|GET
/api/admin/email/history|GET
/api/admin/email/preview|POST
/api/admin/email/send|POST
/api/admin/email/templates|DELETE,GET,POST
/api/admin/email/test|GET,POST
/api/admin/employers|GET
/api/admin/health|GET
/api/admin/jobs/[id]|DELETE,GET,PATCH
/api/admin/jobs/bulk|POST
/api/admin/jobs|GET,POST
/api/admin/lifecycle-test|GET,POST
/api/admin/match-digest-test|GET,POST
/api/admin/pd-campaign|PATCH
/api/admin/pipeline-flow|GET
/api/admin/system-message-test|GET,POST
/api/admin/testimonials|GET,PATCH
/api/admin/users/[id]|DELETE,GET,PATCH
/api/admin/users|GET
/api/analytics/clicks|GET
/api/analytics/sources|GET,POST
/api/applications/apply-direct|POST
/api/applications/check|GET
/api/applications|DELETE,GET,POST
/api/applications/withdraw|DELETE
/api/auth/delete-account|DELETE
/api/auth/extension-token|GET
/api/auth/forgot-password|POST
/api/auth/me|GET
/api/auth/profile|GET,PATCH,POST
/api/auth/restore-account|POST
/api/auth/send-confirmation|POST
/api/auth/welcome|POST
/api/autofill/classify-fields|POST
/api/autofill/extract-resume-sections|POST
/api/autofill/generate-answer|POST
/api/autofill/generate-bulk|POST
/api/autofill/generate-cover-letter|POST
/api/autofill/telemetry|POST
/api/autofill/track|POST
/api/autofill/usage|GET
/api/blog|PATCH,POST
/api/candidate-profile|POST
/api/candidate/messages|GET,POST
/api/companies|GET,POST
/api/consent|DELETE,GET,POST
/api/contact|POST
/api/conversations/[id]/messages/[messageId]/edit|PATCH
/api/conversations/[id]/messages/[messageId]|DELETE
/api/conversations/[id]|DELETE,GET,POST
/api/conversations|GET
/api/create-checkout|POST
/api/create-renewal-checkout|POST
/api/cron/aggregate-pseo|GET
/api/cron/candidate-alerts|GET
/api/cron/check-dead-links|GET
/api/cron/cleanup-expired|GET
/api/cron/cleanup-rejected-jobs|GET
/api/cron/cleanup-unpublished-aggregator-jobs|GET
/api/cron/daily-report|GET
/api/cron/deindex-expired|GET
/api/cron/dsar-overdue|GET
/api/cron/embedding-drift-check|GET
/api/cron/employer-match-digest|GET
/api/cron/employer-report|GET
/api/cron/engagement-anomaly|GET
/api/cron/enrich-jobs|GET
/api/cron/enrich-thin-jds|GET
/api/cron/expiry-warnings|GET
/api/cron/freshness-decay|GET
/api/cron/gsc-health-check|GET
/api/cron/health-anomaly-check|GET
/api/cron/historical-deindex|GET
/api/cron/index-pseo|GET
/api/cron/index-urls|GET
/api/cron/ingest-wave-summary|GET
/api/cron/ingest|GET,POST
/api/cron/instagram-post|GET,POST
/api/cron/lifecycle-emails|GET
/api/cron/purge-inactive-users|GET
/api/cron/purge-soft-deleted|GET
/api/cron/push-notifications|GET
/api/cron/recommendation-deadman|GET
/api/cron/refresh-site-stats|GET
/api/cron/saved-job-reminder|GET
/api/cron/send-alerts|GET
/api/cron/social-post|GET,POST
/api/cron/source-presence-unpublish|GET
/api/cron/system-messages|GET
/api/cron/weekly-newsletter|GET
/api/dashboard|GET
/api/data-request|POST
/api/documents/resume/me/url|GET
/api/email-job|POST
/api/email-preview|GET
/api/email/preferences|GET,POST
/api/email/unsubscribe|GET,POST
/api/employer/ai-jd|POST
/api/employer/ai-jd/usage|GET
/api/employer/analytics/benchmarks|GET
/api/employer/analytics/csv|GET
/api/employer/analytics|GET
/api/employer/applicants|GET,PATCH
/api/employer/billing|GET
/api/employer/candidate-alerts|DELETE,GET,POST
/api/employer/candidates/[id]/resume|GET
/api/employer/candidates/[id]|GET
/api/employer/candidates|GET
/api/employer/post-price|GET
/api/employer/invoice|GET
/api/employer/jd-templates/[id]|DELETE,PATCH
/api/employer/jd-templates|GET,POST
/api/employer/jobs/[jobId]/archive|PATCH
/api/employer/jobs/[jobId]/toggle-publish|PATCH
/api/employer/messages|GET,POST
/api/employer/profile-snapshot|GET
/api/employer/profiles/unlock-bulk|POST
/api/employer/receipt|GET
/api/employer/saved-candidates/note|PATCH
/api/employer/saved-candidates|DELETE,GET,POST
/api/employer/settings/notifications|GET,PATCH
/api/employer/settings|GET,PATCH
/api/employer/tags|DELETE,GET,POST
/api/employer/talent/search|POST
/api/employer/testimonials|POST
/api/employer/usage|GET
/api/feedback|POST
/api/health|GET
/api/job-alerts/[token]|PATCH
/api/job-alerts/by-email|GET
/api/job-alerts/confirm|GET
/api/job-alerts|DELETE,GET,POST
/api/job-draft|DELETE,GET,POST
/api/jobs/[id]|GET
/api/jobs/[id]/screening-questions|GET
/api/jobs/[id]/track-apply|POST
/api/jobs/edit/[token]|GET
/api/jobs/featured|GET
/api/jobs/filter-counts|POST
/api/jobs/post-free|POST
/api/jobs/report|POST
/api/jobs|GET
/api/jobs/search/semantic|GET
/api/jobs/similar|GET
/api/jobs/update|DELETE,POST
/api/messages|GET,PATCH
/api/newsletter|POST
/api/newsletter/status|GET
/api/one-click-unsubscribe|GET,POST
/api/outreach|GET,POST
/api/profile/address|PUT
/api/profile/certifications/[id]|DELETE,PUT
/api/profile/certifications|GET,POST
/api/profile/clear|POST
/api/profile/education/[id]|DELETE,PUT
/api/profile/education|GET,POST
/api/profile/eeo|PUT
/api/profile/export|GET
/api/profile/federal-registrations|PUT
/api/profile/licenses/[id]|DELETE,PUT
/api/profile/licenses|GET,POST
/api/profile/open-ended-responses/[questionKey]|PUT
/api/profile/open-ended-responses|GET
/api/profile/references/[id]|DELETE,PUT
/api/profile/references|GET,POST
/api/profile/resume|DELETE
/api/profile/screening-answers|GET,PUT
/api/profile/work-experience/[id]|DELETE,PUT
/api/profile/work-experience|GET,POST
/api/pseo/health|GET
/api/push-subscribe|DELETE,POST
/api/resume-studio/analyses|GET
/api/resume-studio/cover-letter|POST
/api/resume-studio/documents/[id]/duplicate|POST
/api/resume-studio/documents/[id]/pdf|GET
/api/resume-studio/documents/[id]|DELETE,GET,PATCH
/api/resume-studio/documents|GET,POST
/api/resume-studio/review|POST
/api/resume-studio/score-upload|POST
/api/resume-studio/score|POST
/api/resume-studio/tailor|POST
/api/resume-studio/usage|GET
/api/resume/parse|POST
/api/salary-guide|POST
/api/saved-jobs|DELETE,GET,POST
/api/sitemaps/cities/[batch]|GET
/api/sitemaps/index|GET
/api/sitemaps/jobs/[batch]|GET
/api/track/email-click|GET
/api/upload/company-logo|POST
/api/upload/message-attachment|POST
/api/upload|POST
/api/user/email-preferences/ai-digest|GET,POST
/api/verify-checkout-session|GET
/api/verify-renewal-session|GET
/api/webhooks/resend|POST
/api/webhooks/stripe|POST
`;

interface CatalogRoute {
  pattern: string;
  methods: Method[];
}

const ROUTES: CatalogRoute[] = ROUTE_CATALOG.trim()
  .split('\n')
  .map((line) => {
    const [pattern, methods] = line.split('|');
    return { pattern, methods: methods.split(',') as Method[] };
  });

const ALL_METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Substitute dynamic segments with values that cannot belong to anyone. */
function concretePath(pattern: string): string {
  return pattern
    .replace('[messageId]', GARBAGE_ID)
    .replace('[jobId]', GARBAGE_ID)
    .replace('[id]', GARBAGE_ID)
    .replace('[token]', GARBAGE_TOKEN)
    .replace('[questionKey]', 'garbage_question_e2e')
    .replace('[batch]', '999999');
}

const isCron = (p: string) => p.startsWith('/api/cron/');
const isInngest = (p: string) => p === '/api/inngest';

// Route families that must never answer an anonymous caller with data.
const PROTECTED_PREFIXES = [
  '/api/admin/',
  '/api/employer/',
  '/api/profile/',
  '/api/resume-studio/',
  '/api/conversations',
  '/api/messages',
  '/api/saved-jobs',
  '/api/applications',
  '/api/dashboard',
  '/api/candidate-profile',
  '/api/autofill/',
  '/api/auth/extension-token',
  '/api/auth/delete-account',
  '/api/auth/restore-account',
  '/api/documents/',
  '/api/analytics/',
  '/api/outreach',
  '/api/email-preview',
  '/api/job-draft',
  '/api/push-subscribe',
  '/api/resume/parse',
  '/api/upload',
  '/api/data-request',
  '/api/jobs/report',
  '/api/job-alerts/by-email',
  '/api/user/',
];
const isProtected = (p: string) => PROTECTED_PREFIXES.some((prefix) => p.startsWith(prefix));

// ── Small request helpers ───────────────────────────────────────────────────

function fakeIp(): string {
  const octet = () => 1 + Math.floor(Math.random() * 253);
  return `10.${octet()}.${octet()}.${octet()}`;
}

interface CallOptions {
  headers?: Record<string, string>;
  data?: unknown;
  rawBody?: string;
  multipart?: Record<string, unknown>;
  ip?: string;
  timeout?: number;
}

interface CallResult {
  status: number;
  text: string;
  headers: Record<string, string>;
  json: () => unknown;
}

async function call(
  req: APIRequestContext,
  method: Method,
  urlPath: string,
  opts: CallOptions = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip ?? fakeIp(),
    ...(opts.headers ?? {}),
  };
  const fetchOptions: Parameters<APIRequestContext['fetch']>[1] = {
    method,
    headers,
    maxRedirects: 0,
    timeout: opts.timeout ?? REQUEST_TIMEOUT_MS,
    failOnStatusCode: false,
  };
  if (opts.multipart) {
    fetchOptions.multipart = opts.multipart as never;
  } else if (opts.rawBody !== undefined) {
    fetchOptions.data = opts.rawBody;
  } else if (opts.data !== undefined) {
    fetchOptions.data = opts.data;
  }
  const res: APIResponse = await req.fetch(urlPath, fetchOptions);
  const text = await res.text().catch(() => '');
  return {
    status: res.status(),
    text,
    headers: res.headers(),
    json: () => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
  };
}

function describeResult(method: string, urlPath: string, r: CallResult): string {
  return `${method} ${urlPath} -> ${r.status} ${r.text.slice(0, 200).replace(/\s+/g, ' ')}`;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Authenticated sessions ──────────────────────────────────────────────────
//
// Playwright closes every context created through the `browser` fixture when
// the test that created it ends, so a context cached across tests turns into
// "Target page, context or browser has been closed" on the next test. Log in
// ONCE per role, keep the cookies as a storageState, and hand every test a
// fresh context seeded from it: no repeated logins (slow and flaky on a loaded
// dev server) and no reuse of a closed context.

interface Session {
  ctx: BrowserContext;
  req: APIRequestContext;
  ip: string;
  email: string;
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

// Supabase access tokens live an hour and nothing refreshes the cached copy,
// so re-login well inside that window rather than letting the tail of a long
// run turn into unexplained 401s.
const STORAGE_STATE_TTL_MS = 25 * 60_000;
const storageStates: Partial<Record<Role, { state: StorageState; capturedAt: number }>> = {};
let perTest: Partial<Record<Role, Session>> = {};

test.beforeEach(() => {
  perTest = {};
});

function credsFor(role: Role): AuthCreds | null {
  if (role === 'seeker') return getSeekerCreds();
  if (role === 'employer') return getEmployerCreds();
  return getAdminCreds();
}

/** Log in through the UI and capture the resulting cookies. Retries once: a
 *  loaded dev server can take longer than the fixture's 45s to hydrate. */
async function captureStorageState(browser: Browser, role: Role, creds: AuthCreds): Promise<StorageState> {
  const loginPath = role === 'employer' ? '/employer/login' : '/login';
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      const collected = attachErrorCollectors(page);
      await loginAtPath(page, loginPath, creds);
      // Login is this slice's setup, not its subject (the seeker/employer
      // journey slices own it), and a shared dev server under parallel load
      // produces transient 5xx here. Record what the login page reported as an
      // annotation instead of failing fifteen API tests on it.
      const loginNoise = [...collected.pageErrors, ...collected.serverErrors];
      if (loginNoise.length) {
        test.info().annotations.push({ type: 'login-noise', description: `${role}: ${loginNoise.join(' | ')}` });
      }
      const state = await ctx.storageState();
      await ctx.close();
      return state;
    } catch (err) {
      lastError = err;
      await ctx.close().catch(() => undefined);
    }
  }
  throw lastError;
}

async function session(browser: Browser, role: Role): Promise<Session> {
  const cached = perTest[role];
  if (cached) return cached;
  const creds = credsFor(role);
  if (!creds) throw new Error(`E2E credentials for ${role} are not set`);
  const cachedState = storageStates[role];
  if (!cachedState || Date.now() - cachedState.capturedAt > STORAGE_STATE_TTL_MS) {
    storageStates[role] = {
      state: await captureStorageState(browser, role, creds),
      capturedAt: Date.now(),
    };
  }
  const ip = fakeIp();
  const ctx = await browser.newContext({
    storageState: storageStates[role]!.state,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });
  const created: Session = { ctx, req: ctx.request, ip, email: creds.email };
  perTest[role] = created;
  return created;
}

test.afterEach(async () => {
  for (const role of Object.keys(perTest) as Role[]) {
    await perTest[role]?.ctx.close().catch(() => undefined);
  }
  perTest = {};
});

const HAS_ALL_CREDS = !!getSeekerCreds() && !!getEmployerCreds() && !!getAdminCreds();

// ── Fixture bytes for upload probes ─────────────────────────────────────────

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF\n',
);
const EXE_AS_PDF = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), Buffer.alloc(512, 0)]);
const EMPTY = Buffer.alloc(0);
const THIRTY_MB = () => Buffer.alloc(30 * 1024 * 1024, 0x25);

function sampleResumeBuffer(): Buffer | null {
  const candidates = [
    process.env.E2E_TEST_RESUME_PATH,
    path.resolve(__dirname, '../fixtures/sample-resume.pdf'),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return fs.readFileSync(resolved);
  }
  return null;
}

function file(name: string, mimeType: string, buffer: Buffer) {
  return { name, mimeType, buffer };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Unauthenticated contract sweep
// ═══════════════════════════════════════════════════════════════════════════

test.describe('unauthenticated contract sweep', () => {
  test('every exported method answers an anonymous caller without 5xx or data', async ({ request }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const targets: Array<{ method: Method; path: string }> = [];
    for (const route of ROUTES) {
      if (isCron(route.pattern) || isInngest(route.pattern)) continue;
      for (const method of route.methods) {
        targets.push({ method, path: concretePath(route.pattern) });
      }
    }

    const problems: string[] = [];
    const observed: string[] = [];
    await mapLimit(targets, SWEEP_CONCURRENCY, async ({ method, path: urlPath }) => {
      const body = method === 'GET' ? undefined : {};
      const r = await call(request, method, urlPath, {
        data: body,
        headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
      });
      const line = describeResult(method, urlPath, r);
      observed.push(line);
      if (r.status >= 500) problems.push(`5xx: ${line}`);
      if (isProtected(urlPath) && r.status === 200) problems.push(`200 for protected route anonymously: ${line}`);
    });

    test.info().attach('anonymous-sweep.txt', { body: observed.sort().join('\n'), contentType: 'text/plain' });
    expect(problems, `anonymous sweep problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('a method the route does not export returns 405, never 5xx', async ({ request }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const targets: Array<{ method: Method; path: string }> = [];
    for (const route of ROUTES) {
      if (isInngest(route.pattern)) continue;
      // Cron handlers only ever export GET/POST; PATCH is never handled so
      // Next answers 405 without invoking the (dev-bypassed) handler.
      const preferred: Method[] = isCron(route.pattern) ? ['PATCH'] : ['PUT', 'PATCH', 'DELETE', 'POST', 'GET'];
      const wrong = preferred.find((m) => !route.methods.includes(m));
      if (!wrong) continue;
      targets.push({ method: wrong, path: concretePath(route.pattern) });
    }

    const problems: string[] = [];
    await mapLimit(targets, SWEEP_CONCURRENCY, async ({ method, path: urlPath }) => {
      const r = await call(request, method, urlPath, { data: method === 'GET' ? undefined : {} });
      if (r.status >= 500) problems.push(`5xx: ${describeResult(method, urlPath, r)}`);
      else if (r.status !== 405 && r.status !== 404) problems.push(`expected 405: ${describeResult(method, urlPath, r)}`);
    });
    expect(problems, `wrong-method problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('malformed JSON and wrong content-type on public write routes return 400, not 5xx', async ({ request }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    // Public (no-auth-before-parse) routes that read a JSON body. A body that
    // never parses cannot reach business logic, so these are side-effect free.
    const targets: Array<{ method: Method; path: string }> = [
      { method: 'POST', path: '/api/contact' },
      { method: 'POST', path: '/api/newsletter' },
      { method: 'POST', path: '/api/job-alerts' },
      { method: 'PATCH', path: `/api/job-alerts/${GARBAGE_TOKEN}` },
      { method: 'POST', path: '/api/feedback' },
      { method: 'POST', path: '/api/email-job' },
      { method: 'POST', path: '/api/salary-guide' },
      { method: 'POST', path: '/api/jobs/filter-counts' },
      { method: 'POST', path: '/api/jobs/update' },
      { method: 'POST', path: '/api/auth/forgot-password' },
      { method: 'POST', path: '/api/auth/send-confirmation' },
      { method: 'POST', path: '/api/auth/welcome' },
      { method: 'POST', path: '/api/consent' },
      { method: 'POST', path: '/api/email/unsubscribe' },
      { method: 'POST', path: '/api/email/preferences' },
      { method: 'POST', path: '/api/create-checkout' },
      { method: 'POST', path: '/api/analytics/sources' },
      { method: 'POST', path: '/api/autofill/track' },
      { method: 'POST', path: '/api/autofill/telemetry' },
      { method: 'POST', path: '/api/push-subscribe' },
      { method: 'POST', path: '/api/user/email-preferences/ai-digest' },
    ];

    const problems: string[] = [];
    await mapLimit(targets, SWEEP_CONCURRENCY, async ({ method, path: urlPath }) => {
      const malformed = await call(request, method, urlPath, {
        rawBody: '{bad',
        headers: { 'content-type': 'application/json' },
      });
      if (malformed.status >= 500) problems.push(`malformed JSON -> 5xx: ${describeResult(method, urlPath, malformed)}`);

      const wrongType = await call(request, method, urlPath, {
        rawBody: 'email=not-json',
        headers: { 'content-type': 'text/plain' },
      });
      if (wrongType.status >= 500) problems.push(`text/plain body -> 5xx: ${describeResult(method, urlPath, wrongType)}`);
    });
    expect(problems, `malformed-body problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('cron routes only accept their exported methods and are never reachable via PATCH', async ({ request }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const cronRoutes = ROUTES.filter((r) => isCron(r.pattern));
    expect(cronRoutes.length).toBeGreaterThan(30);
    const problems: string[] = [];
    await mapLimit(cronRoutes, SWEEP_CONCURRENCY, async (route) => {
      const r = await call(request, 'PATCH', route.pattern, { data: {} });
      if (r.status !== 405) problems.push(describeResult('PATCH', route.pattern, r));
    });
    expect(problems, `cron PATCH did not 405:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Cross-role access
// ═══════════════════════════════════════════════════════════════════════════

test.describe('cross-role access', () => {
  test.skip(!HAS_ALL_CREDS, 'E2E_*_EMAIL / E2E_*_PASS not set for all three roles');

  const adminGetRoutes = () =>
    ROUTES.filter((r) => r.pattern.startsWith('/api/admin/') && r.methods.includes('GET')).map((r) => concretePath(r.pattern));

  test('seeker cookies are rejected by every /api/admin/* GET route', async ({ browser }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const seeker = await session(browser, 'seeker');
    const problems: string[] = [];
    await mapLimit(adminGetRoutes(), SWEEP_CONCURRENCY, async (urlPath) => {
      // Per-request fake IP: requireApiAdmin rate-limits at 20/min per IP and
      // would otherwise turn the tail of this sweep into 429s.
      const r = await call(seeker.req, 'GET', urlPath);
      if (r.status !== 403 && r.status !== 401) problems.push(describeResult('GET', urlPath, r));
    });
    expect(problems, `seeker reached admin routes:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('employer cookies are rejected by every /api/admin/* GET route', async ({ browser }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const employer = await session(browser, 'employer');
    const problems: string[] = [];
    await mapLimit(adminGetRoutes(), SWEEP_CONCURRENCY, async (urlPath) => {
      const r = await call(employer.req, 'GET', urlPath);
      if (r.status !== 403 && r.status !== 401) problems.push(describeResult('GET', urlPath, r));
    });
    expect(problems, `employer reached admin routes:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('seeker cookies are rejected by /api/employer/* routes', async ({ browser }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const seeker = await session(browser, 'seeker');
    const targets: Array<{ method: Method; path: string }> = [];
    for (const route of ROUTES) {
      if (!route.pattern.startsWith('/api/employer/')) continue;
      for (const method of route.methods) targets.push({ method, path: concretePath(route.pattern) });
    }
    const problems: string[] = [];
    await mapLimit(targets, SWEEP_CONCURRENCY, async ({ method, path: urlPath }) => {
      const r = await call(seeker.req, method, urlPath, { data: method === 'GET' ? undefined : {} });
      if (r.status >= 500) problems.push(`5xx: ${describeResult(method, urlPath, r)}`);
      else if (r.status === 200) {
        // /api/employer/post-price deliberately answers 200 with
        // `{eligible:false, reason:'not-employer'}` because the post-job
        // preview renders that refusal inline. Any OTHER 200 means the route
        // never checked the caller's role.
        const body = r.json() as { eligible?: unknown; reason?: unknown } | null;
        const isDeliberateRefusal = body?.eligible === false && typeof body?.reason === 'string';
        if (!isDeliberateRefusal) problems.push(`200: ${describeResult(method, urlPath, r)}`);
      } else if (r.status !== 403 && r.status !== 401 && r.status !== 400) problems.push(`unexpected: ${describeResult(method, urlPath, r)}`);
    });
    expect(problems, `seeker vs employer routes:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('employer cookies against seeker-only routes never expose seeker data', async ({ browser }) => {
    test.setTimeout(SWEEP_TEST_TIMEOUT_MS);
    const employer = await session(browser, 'employer');
    const targets: Array<{ method: Method; path: string; data?: unknown }> = [
      { method: 'POST', path: '/api/candidate-profile', data: {} },
      { method: 'GET', path: '/api/saved-jobs' },
      { method: 'GET', path: '/api/applications' },
      { method: 'GET', path: '/api/applications/check?jobId=' + GARBAGE_ID },
      { method: 'GET', path: '/api/profile/education' },
      { method: 'GET', path: '/api/profile/licenses' },
      { method: 'GET', path: '/api/profile/certifications' },
      { method: 'GET', path: '/api/profile/references' },
      { method: 'GET', path: '/api/profile/work-experience' },
      { method: 'GET', path: '/api/profile/screening-answers' },
      { method: 'GET', path: '/api/profile/open-ended-responses' },
      { method: 'GET', path: '/api/profile/export' },
      { method: 'GET', path: '/api/documents/resume/me/url' },
      { method: 'GET', path: '/api/resume-studio/documents' },
      { method: 'GET', path: '/api/candidate/messages?jobId=' + GARBAGE_ID },
    ];
    const problems: string[] = [];
    const observed: string[] = [];
    await mapLimit(targets, SWEEP_CONCURRENCY, async ({ method, path: urlPath, data }) => {
      const r = await call(employer.req, method, urlPath, { data });
      observed.push(describeResult(method, urlPath, r));
      if (r.status >= 500) problems.push(`5xx: ${describeResult(method, urlPath, r)}`);
      // A 200 is acceptable when the route scopes to the CALLER's own record
      // (e.g. /api/profile/export returns the employer's own profile). What
      // must never happen is the seeker's identity appearing in the body.
      if (r.status === 200) {
        const seekerEmail = getSeekerCreds()?.email;
        if (seekerEmail && r.text.toLowerCase().includes(seekerEmail.toLowerCase())) {
          problems.push(`200 containing the seeker's email: ${describeResult(method, urlPath, r)}`);
        }
      }
    });
    test.info().attach('employer-vs-seeker-routes.txt', { body: observed.join('\n'), contentType: 'text/plain' });
    expect(problems, `employer vs seeker routes:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. IDOR probes
// ═══════════════════════════════════════════════════════════════════════════

test.describe('IDOR (local only, creates and removes its own fixtures)', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ALL_CREDS, 'E2E_*_EMAIL / E2E_*_PASS not set for all three roles');

  async function seekerSupabaseId(seeker: Session): Promise<string> {
    const me = await call(seeker.req, 'GET', '/api/auth/me');
    expect(me.status, describeResult('GET', '/api/auth/me', me)).toBe(200);
    const id = (me.json() as { id?: string })?.id;
    expect(id, 'seeker /api/auth/me id').toBeTruthy();
    return id as string;
  }

  interface ConversationFixture {
    conversationId: string;
    messageId: string | null;
    participantReq: APIRequestContext;
  }

  /**
   * Find (or create) a conversation the admin account is NOT part of. Tries
   * the employer -> seeker message first; when the test employer has no active
   * featured post that route answers 403, so fall back to any existing
   * conversation on either account.
   */
  async function conversationFixture(browser: Browser): Promise<ConversationFixture | null> {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const admin = await session(browser, 'admin');

    const adminConvs = await call(admin.req, 'GET', '/api/conversations');
    const adminIds = new Set(
      (((adminConvs.json() as { conversations?: Array<{ id: string }> })?.conversations) ?? []).map((c) => c.id),
    );

    const pickFrom = async (participant: Session): Promise<ConversationFixture | null> => {
      const list = await call(participant.req, 'GET', '/api/conversations');
      if (list.status !== 200) return null;
      const convs = ((list.json() as { conversations?: Array<{ id: string }> })?.conversations) ?? [];
      const foreign = convs.find((c) => !adminIds.has(c.id));
      if (!foreign) return null;
      const thread = await call(participant.req, 'GET', `/api/conversations/${foreign.id}`);
      const messages = ((thread.json() as { messages?: Array<{ id: string }> })?.messages) ?? [];
      return { conversationId: foreign.id, messageId: messages[0]?.id ?? null, participantReq: participant.req };
    };

    const existing = (await pickFrom(employer)) ?? (await pickFrom(seeker));
    if (existing) return existing;

    const recipientId = await seekerSupabaseId(seeker);
    const created = await call(employer.req, 'POST', '/api/employer/messages', {
      data: {
        recipientId,
        subject: 'E2E h0902 IDOR fixture',
        body: 'Automated fixture message from the API contract hunt. Safe to ignore.',
      },
    });
    if (created.status !== 200) {
      test.info().annotations.push({ type: 'note', description: `could not create conversation: ${describeResult('POST', '/api/employer/messages', created)}` });
      return null;
    }
    const conversationId = (created.json() as { conversationId?: string })?.conversationId ?? null;
    const messageId = (created.json() as { message?: { id?: string } })?.message?.id ?? null;
    if (!conversationId) return null;
    return { conversationId, messageId, participantReq: employer.req };
  }

  test('conversations: a third account cannot read, reply to, delete, or edit someone else\'s thread', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const fixture = await conversationFixture(browser);
    test.skip(!fixture, 'no conversation between the test employer and seeker exists and one could not be created (employer has no active featured post)');
    const { conversationId, messageId } = fixture as ConversationFixture;
    const admin = await session(browser, 'admin');
    const problems: string[] = [];

    const read = await call(admin.req, 'GET', `/api/conversations/${conversationId}`);
    if (read.status !== 403) problems.push(describeResult('GET', `/api/conversations/${conversationId}`, read));
    if (read.status === 200) problems.push('third party received message bodies: ' + read.text.slice(0, 300));

    const reply = await call(admin.req, 'POST', `/api/conversations/${conversationId}`, { data: { body: 'intruder reply h0902' } });
    if (reply.status !== 403) problems.push(describeResult('POST', `/api/conversations/${conversationId}`, reply));

    const del = await call(admin.req, 'DELETE', `/api/conversations/${conversationId}`);
    if (del.status !== 403) problems.push(describeResult('DELETE', `/api/conversations/${conversationId}`, del));

    if (messageId) {
      const edit = await call(admin.req, 'PATCH', `/api/conversations/${conversationId}/messages/${messageId}/edit`, {
        data: { body: 'tampered by intruder h0902' },
      });
      if (edit.status !== 403) problems.push(describeResult('PATCH', `.../messages/${messageId}/edit`, edit));

      const delMsg = await call(admin.req, 'DELETE', `/api/conversations/${conversationId}/messages/${messageId}`);
      if (delMsg.status !== 403) problems.push(describeResult('DELETE', `.../messages/${messageId}`, delMsg));
    }

    // Garbage ids are 404, never 5xx.
    const garbage = await call(admin.req, 'GET', `/api/conversations/${GARBAGE_ID}`);
    if (garbage.status !== 404) problems.push(describeResult('GET', `/api/conversations/${GARBAGE_ID}`, garbage));
    const garbageEdit = await call(admin.req, 'PATCH', `/api/conversations/${GARBAGE_ID}/messages/${GARBAGE_ID}/edit`, { data: { body: 'x' } });
    if (garbageEdit.status !== 404) problems.push(describeResult('PATCH', `/api/conversations/${GARBAGE_ID}/messages/${GARBAGE_ID}/edit`, garbageEdit));

    expect(problems, `conversation IDOR problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('employer candidate detail: seekers are refused, non-unlocked candidates never leak contact fields', async ({ browser }) => {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const candidateId = await seekerSupabaseId(seeker);
    const problems: string[] = [];

    const asSeeker = await call(seeker.req, 'GET', `/api/employer/candidates/${candidateId}`);
    if (asSeeker.status !== 403) problems.push(describeResult('GET (seeker)', `/api/employer/candidates/${candidateId}`, asSeeker));

    const asEmployer = await call(employer.req, 'GET', `/api/employer/candidates/${candidateId}`);
    if (asEmployer.status >= 500) problems.push(describeResult('GET (employer)', `/api/employer/candidates/${candidateId}`, asEmployer));
    if (asEmployer.status === 200) {
      const body = asEmployer.json() as Record<string, unknown>;
      if (body.hasFullAccess !== true) {
        for (const key of ['contactEmail', 'resumeUrl', 'linkedinUrl']) {
          if (body[key]) problems.push(`non-unlocked candidate leaked ${key}: ${String(body[key]).slice(0, 80)}`);
        }
        if (Array.isArray(body.licenseStates) || body.availableDate || body.salaryRange) {
          problems.push('non-unlocked candidate leaked unlock-gated fields: ' + JSON.stringify(body).slice(0, 300));
        }
      }
    }
    test.info().annotations.push({ type: 'observed', description: describeResult('GET (employer)', `/api/employer/candidates/${candidateId}`, asEmployer) });

    const garbage = await call(employer.req, 'GET', `/api/employer/candidates/${GARBAGE_ID}`);
    if (garbage.status !== 404 && garbage.status !== 403) problems.push(describeResult('GET', `/api/employer/candidates/${GARBAGE_ID}`, garbage));

    const resume = await call(seeker.req, 'GET', `/api/employer/candidates/${candidateId}/resume?json=1`);
    if (resume.status !== 403) problems.push(describeResult('GET (seeker)', `/api/employer/candidates/${candidateId}/resume`, resume));

    expect(problems, `candidate detail problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('job edit tokens: fake tokens are rejected on read, update and unpublish', async ({ request }) => {
    const problems: string[] = [];

    const read = await call(request, 'GET', `/api/jobs/edit/${GARBAGE_TOKEN}`);
    if (read.status !== 401) problems.push(describeResult('GET', `/api/jobs/edit/${GARBAGE_TOKEN}`, read));

    const update = await call(request, 'POST', '/api/jobs/update', {
      data: {
        token: GARBAGE_TOKEN,
        jobData: { title: 'h0902', location: 'Austin, TX', mode: 'Remote', jobType: 'Full-time', description: 'x', applyLink: null },
      },
    });
    if (update.status !== 401) problems.push(describeResult('POST', '/api/jobs/update (fake token)', update));

    const unpublish = await call(request, 'DELETE', `/api/jobs/update?token=${GARBAGE_TOKEN}`);
    if (unpublish.status !== 401) problems.push(describeResult('DELETE', `/api/jobs/update?token=${GARBAGE_TOKEN}`, unpublish));

    expect(problems, `edit-token problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('POST /api/jobs/update without jobData is a 400, not a crash', async ({ request }) => {
    // The handler sanitizes `rawJobData.description` before it checks the
    // token, so a body with no jobData throws a TypeError inside the try.
    const noJobData = await call(request, 'POST', '/api/jobs/update', { data: { token: GARBAGE_TOKEN } });
    expect(noJobData.status, describeResult('POST', '/api/jobs/update {token}', noJobData)).toBeLessThan(500);
    const empty = await call(request, 'POST', '/api/jobs/update', { data: {} });
    expect(empty.status, describeResult('POST', '/api/jobs/update {}', empty)).toBeLessThan(500);
  });

  test('job alerts: garbage tokens 404 and by-email refuses other people\'s addresses', async ({ browser, request }) => {
    const seeker = await session(browser, 'seeker');
    const problems: string[] = [];

    const patch = await call(request, 'PATCH', `/api/job-alerts/${GARBAGE_TOKEN}`, { data: { frequency: 'daily' } });
    if (patch.status !== 404) problems.push(describeResult('PATCH', `/api/job-alerts/${GARBAGE_TOKEN}`, patch));

    const get = await call(request, 'GET', `/api/job-alerts?token=${GARBAGE_TOKEN}`);
    if (get.status !== 404) problems.push(describeResult('GET', `/api/job-alerts?token=${GARBAGE_TOKEN}`, get));

    const del = await call(request, 'DELETE', `/api/job-alerts?token=${GARBAGE_TOKEN}`);
    if (del.status !== 404) problems.push(describeResult('DELETE', `/api/job-alerts?token=${GARBAGE_TOKEN}`, del));

    const anon = await call(request, 'GET', `/api/job-alerts/by-email?email=${encodeURIComponent(seeker.email)}`);
    if (anon.status !== 401) problems.push(describeResult('GET (anon)', '/api/job-alerts/by-email', anon));

    const foreign = await call(seeker.req, 'GET', '/api/job-alerts/by-email?email=someone-else%40pmhnptest.com');
    if (foreign.status !== 403) problems.push(describeResult('GET (seeker, foreign email)', '/api/job-alerts/by-email', foreign));
    if (foreign.text.includes('"token"')) problems.push('by-email leaked alert tokens for a foreign email');

    const own = await call(seeker.req, 'GET', `/api/job-alerts/by-email?email=${encodeURIComponent(seeker.email.toUpperCase())}`);
    if (own.status !== 200) problems.push(describeResult('GET (seeker, own email, mixed case)', '/api/job-alerts/by-email', own));

    expect(problems, `job-alert problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('applications: another user cannot withdraw my application', async ({ browser }) => {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const problems: string[] = [];

    const mine = await call(seeker.req, 'GET', '/api/applications');
    expect(mine.status, describeResult('GET', '/api/applications', mine)).toBe(200);
    const apps = (mine.json() as Array<{ id: string }>) ?? [];

    const garbage = await call(employer.req, 'DELETE', '/api/applications/withdraw', { data: { applicationId: GARBAGE_ID } });
    if (garbage.status !== 404) problems.push(describeResult('DELETE', '/api/applications/withdraw (garbage id)', garbage));

    const noBody = await call(employer.req, 'DELETE', '/api/applications/withdraw', { data: {} });
    if (noBody.status !== 400) problems.push(describeResult('DELETE', '/api/applications/withdraw {}', noBody));

    if (apps.length > 0) {
      const foreign = await call(employer.req, 'DELETE', '/api/applications/withdraw', { data: { applicationId: apps[0].id } });
      if (foreign.status !== 403) problems.push(describeResult('DELETE', `/api/applications/withdraw (seeker's ${apps[0].id})`, foreign));
      // The seeker's application must still be there, unwithdrawn.
      const after = await call(seeker.req, 'GET', '/api/applications');
      const still = ((after.json() as Array<{ id: string; status?: string }>) ?? []).find((a) => a.id === apps[0].id);
      if (!still) problems.push('application disappeared after foreign withdraw attempt');
      else if (still.status === 'withdrawn' && apps[0] && (apps[0] as { status?: string }).status !== 'withdrawn') problems.push('application was withdrawn by a foreign account');
    } else {
      test.info().annotations.push({ type: 'note', description: 'seeker has no applications; foreign-withdraw path not exercised' });
    }

    expect(problems, `withdraw problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('resume studio: documents are invisible to other accounts', async ({ browser }) => {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const problems: string[] = [];

    let docId: string | null = null;
    let createdHere = false;
    const created = await call(seeker.req, 'POST', '/api/resume-studio/documents', {
      data: { title: 'E2E h0902 IDOR probe', seedFromProfile: false },
    });
    if (created.status === 200 || created.status === 201) {
      docId = (created.json() as { document?: { id?: string } })?.document?.id ?? null;
      createdHere = !!docId;
    }
    if (!docId) {
      const list = await call(seeker.req, 'GET', '/api/resume-studio/documents');
      docId = ((list.json() as { documents?: Array<{ id: string }> })?.documents ?? [])[0]?.id ?? null;
    }
    test.skip(!docId, `could not obtain a seeker resume document: ${describeResult('POST', '/api/resume-studio/documents', created)}`);

    try {
      const read = await call(employer.req, 'GET', `/api/resume-studio/documents/${docId}`);
      if (read.status !== 404) problems.push(describeResult('GET (employer)', `/api/resume-studio/documents/${docId}`, read));
      const patch = await call(employer.req, 'PATCH', `/api/resume-studio/documents/${docId}`, { data: { title: 'hijacked' } });
      if (patch.status !== 404) problems.push(describeResult('PATCH (employer)', `/api/resume-studio/documents/${docId}`, patch));
      const pdf = await call(employer.req, 'GET', `/api/resume-studio/documents/${docId}/pdf`);
      if (pdf.status !== 404 && pdf.status !== 403) problems.push(describeResult('GET (employer)', `/api/resume-studio/documents/${docId}/pdf`, pdf));
      const dup = await call(employer.req, 'POST', `/api/resume-studio/documents/${docId}/duplicate`, { data: {} });
      if (dup.status !== 404) problems.push(describeResult('POST (employer)', `/api/resume-studio/documents/${docId}/duplicate`, dup));
      const del = await call(employer.req, 'DELETE', `/api/resume-studio/documents/${docId}`);
      if (del.status !== 404) problems.push(describeResult('DELETE (employer)', `/api/resume-studio/documents/${docId}`, del));

      // Owner still sees it, with the original title.
      const own = await call(seeker.req, 'GET', `/api/resume-studio/documents/${docId}`);
      if (own.status !== 200) problems.push(describeResult('GET (owner after probes)', `/api/resume-studio/documents/${docId}`, own));
      else if ((own.json() as { document?: { title?: string } })?.document?.title === 'hijacked') problems.push('foreign PATCH changed the owner\'s document title');
    } finally {
      if (createdHere && docId) await call(seeker.req, 'DELETE', `/api/resume-studio/documents/${docId}`);
    }

    expect(problems, `resume-studio IDOR problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('employer job controls: cannot toggle-publish or archive a job you do not own', async ({ browser, request }) => {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const problems: string[] = [];

    const list = await call(request, 'GET', '/api/jobs?limit=50');
    expect(list.status, describeResult('GET', '/api/jobs?limit=50', list)).toBe(200);
    const jobs = ((list.json() as { jobs?: Array<{ id: string; employer: string; sourceType?: string }> })?.jobs) ?? [];
    expect(jobs.length, 'public job list should not be empty').toBeGreaterThan(0);
    const foreignEmployerJob = jobs.find((j) => j.sourceType === 'employer' && !/test corp/i.test(j.employer || ''));
    const aggregatedJob = jobs.find((j) => j.sourceType !== 'employer');
    const target = foreignEmployerJob ?? aggregatedJob ?? jobs[0];

    for (const action of ['toggle-publish', 'archive'] as const) {
      const urlPath = `/api/employer/jobs/${target.id}/${action}`;
      const asSeeker = await call(seeker.req, 'PATCH', urlPath, { data: {} });
      if (asSeeker.status !== 403) problems.push(describeResult('PATCH (seeker)', urlPath, asSeeker));

      const asEmployer = await call(employer.req, 'PATCH', urlPath, { data: {} });
      if (asEmployer.status === 200) {
        // Only possible if the test employer actually owns it. Revert and
        // treat the ownership assumption (not the route) as wrong.
        await call(employer.req, 'PATCH', urlPath, { data: {} });
        problems.push(`employer toggled ${target.employer} job ${target.id} via ${action}: ${asEmployer.text.slice(0, 120)}`);
      } else if (asEmployer.status !== 404) {
        problems.push(describeResult('PATCH (employer)', urlPath, asEmployer));
      }

      const garbage = await call(employer.req, 'PATCH', `/api/employer/jobs/${GARBAGE_ID}/${action}`, { data: {} });
      if (garbage.status !== 404) problems.push(describeResult('PATCH (employer)', `/api/employer/jobs/${GARBAGE_ID}/${action}`, garbage));
    }

    // Billing artifacts for a job you do not own, with and without a token.
    const invoice = await call(employer.req, 'GET', `/api/employer/invoice?jobId=${target.id}`);
    if (invoice.status !== 404 && invoice.status !== 403) problems.push(describeResult('GET (employer)', '/api/employer/invoice?jobId=<foreign>', invoice));
    const invoiceToken = await call(request, 'GET', `/api/employer/invoice?jobId=${target.id}&token=${GARBAGE_TOKEN}`);
    if (invoiceToken.status !== 404 && invoiceToken.status !== 403) problems.push(describeResult('GET (anon)', '/api/employer/invoice?token=garbage', invoiceToken));
    const receipt = await call(request, 'GET', `/api/employer/receipt?jobId=${target.id}&token=${GARBAGE_TOKEN}`);
    if (receipt.status !== 404 && receipt.status !== 403) problems.push(describeResult('GET (anon)', '/api/employer/receipt?token=garbage', receipt));

    expect(problems, `job control problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('admin user management is refused for seekers and employers', async ({ browser }) => {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const problems: string[] = [];
    const urlPath = `/api/admin/users/${GARBAGE_ID}`;
    for (const [label, s] of [['seeker', seeker], ['employer', employer]] as const) {
      const get = await call(s.req, 'GET', urlPath);
      if (get.status !== 403) problems.push(describeResult(`GET (${label})`, urlPath, get));
      const patch = await call(s.req, 'PATCH', urlPath, { data: { role: 'admin' } });
      if (patch.status !== 403) problems.push(describeResult(`PATCH (${label})`, urlPath, patch));
      const del = await call(s.req, 'DELETE', `${urlPath}?hard=true`);
      if (del.status !== 403) problems.push(describeResult(`DELETE (${label})`, `${urlPath}?hard=true`, del));
    }
    expect(problems, `admin user route problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Rate limiting
// ═══════════════════════════════════════════════════════════════════════════

test.describe('rate limiting on public write endpoints', () => {
  // Each hammer uses an INVALID body so nothing is persisted or emailed; the
  // limiter runs before validation, so the 429 still surfaces.
  const cases: Array<{ path: string; limit: number; data: unknown }> = [
    { path: '/api/contact', limit: 5, data: { name: '', email: 'not-an-email', subject: '', message: '' } },
    { path: '/api/auth/forgot-password', limit: 3, data: { email: 'not-an-email' } },
    { path: '/api/newsletter', limit: 10, data: { email: 'not-an-email' } },
    { path: '/api/job-alerts', limit: 10, data: { email: 'not-an-email' } },
    { path: '/api/feedback', limit: 5, data: { rating: 'not-a-number' } },
    { path: '/api/jobs/report', limit: 5, data: { jobId: GARBAGE_ID, reason: 'bogus' } },
  ];

  for (const c of cases) {
    test(`POST ${c.path} returns 429 with rate-limit headers after ${c.limit} requests`, async ({ request }) => {
      test.setTimeout(4 * 60_000);
      const ip = fakeIp();
      const statuses: number[] = [];
      let limited: CallResult | null = null;
      for (let i = 0; i < c.limit + 3; i++) {
        const r = await call(request, 'POST', c.path, { data: c.data, ip });
        statuses.push(r.status);
        expect(r.status, describeResult('POST', c.path, r)).toBeLessThan(500);
        if (r.status === 429) {
          limited = r;
          break;
        }
      }
      expect(limited, `${c.path} never returned 429; statuses: ${statuses.join(',')}`).not.toBeNull();
      const headers = (limited as CallResult).headers;
      expect(headers['retry-after'], `Retry-After missing on 429 for ${c.path}: ${JSON.stringify(headers)}`).toBeTruthy();
      expect(headers['x-ratelimit-remaining'], `X-RateLimit-Remaining missing on 429 for ${c.path}`).toBe('0');
      expect(statuses.filter((s) => s !== 429).length, `${c.path} allowed more than ${c.limit} requests: ${statuses.join(',')}`).toBeLessThanOrEqual(c.limit);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CSRF
// ═══════════════════════════════════════════════════════════════════════════

test.describe('CSRF origin gating (local only)', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ALL_CREDS, 'E2E_*_EMAIL / E2E_*_PASS not set for all three roles');

  test('routes wired to verifyCsrf reject a foreign Origin while authenticated', async ({ browser }) => {
    const seeker = await session(browser, 'seeker');
    const employer = await session(browser, 'employer');
    const evil = { origin: EVIL_ORIGIN, referer: `${EVIL_ORIGIN}/attack` };
    const problems: string[] = [];

    const restore = await call(seeker.req, 'POST', '/api/auth/restore-account', { headers: evil, data: {} });
    if (restore.status !== 403) problems.push(describeResult('POST', '/api/auth/restore-account', restore));

    const logo = await call(employer.req, 'POST', '/api/upload/company-logo', {
      headers: evil,
      multipart: { file: file('logo.png', 'image/png', TINY_PNG) },
    });
    if (logo.status !== 403) problems.push(describeResult('POST', '/api/upload/company-logo', logo));

    const attach = await call(seeker.req, 'POST', '/api/upload/message-attachment', {
      headers: evil,
      multipart: { file: file('a.pdf', 'application/pdf', TINY_PDF) },
    });
    if (attach.status !== 403) problems.push(describeResult('POST', '/api/upload/message-attachment', attach));

    const reply = await call(seeker.req, 'POST', `/api/conversations/${GARBAGE_ID}`, { headers: evil, data: { body: 'x' } });
    if (reply.status !== 403) problems.push(describeResult('POST', `/api/conversations/${GARBAGE_ID}`, reply));

    const profile = await call(seeker.req, 'PATCH', '/api/auth/profile', { headers: evil, data: {} });
    if (profile.status !== 403) problems.push(describeResult('PATCH', '/api/auth/profile', profile));

    // Referer-only variant (no Origin header) must also be caught.
    const refererOnly = await call(seeker.req, 'POST', '/api/auth/restore-account', { headers: { referer: `${EVIL_ORIGIN}/x` }, data: {} });
    if (refererOnly.status !== 403) problems.push(describeResult('POST (referer only)', '/api/auth/restore-account', refererOnly));

    expect(problems, `CSRF-gated routes accepted a foreign origin:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('state-changing routes without verifyCsrf accept a foreign Origin (known gap)', async ({ browser, request }) => {
    // Only lib/csrf.ts callers gate on Origin. Every other mutation relies
    // solely on SameSite=Lax cookies. This test documents the surface; it is
    // expected to FAIL until those routes call verifyCsrf.
    test.fail(true, 'saved-jobs, message edit, job-alerts PATCH and friends do not call verifyCsrf (lib/csrf.ts)');
    const seeker = await session(browser, 'seeker');
    const evil = { origin: EVIL_ORIGIN, referer: `${EVIL_ORIGIN}/attack` };
    const accepted: string[] = [];

    const list = await call(request, 'GET', '/api/jobs?limit=1');
    const jobId = ((list.json() as { jobs?: Array<{ id: string }> })?.jobs ?? [])[0]?.id;
    expect(jobId, 'need one public job id').toBeTruthy();

    const save = await call(seeker.req, 'POST', '/api/saved-jobs', { headers: evil, data: { jobId } });
    if (save.status === 200) {
      accepted.push(describeResult('POST', '/api/saved-jobs', save));
      const unsave = await call(seeker.req, 'DELETE', '/api/saved-jobs', { headers: evil, data: { jobId } });
      if (unsave.status === 200) accepted.push(describeResult('DELETE', '/api/saved-jobs', unsave));
    }

    // These target garbage ids so nothing is mutated; anything other than 403
    // proves the Origin was not consulted before the handler ran.
    const probes: Array<{ method: Method; path: string; data: unknown }> = [
      { method: 'PATCH', path: `/api/conversations/${GARBAGE_ID}/messages/${GARBAGE_ID}/edit`, data: { body: 'x' } },
      { method: 'DELETE', path: `/api/conversations/${GARBAGE_ID}/messages/${GARBAGE_ID}`, data: {} },
      { method: 'DELETE', path: '/api/applications/withdraw', data: { applicationId: GARBAGE_ID } },
      { method: 'PATCH', path: `/api/job-alerts/${GARBAGE_TOKEN}`, data: { frequency: 'daily' } },
      { method: 'PATCH', path: `/api/employer/jobs/${GARBAGE_ID}/toggle-publish`, data: {} },
      { method: 'PUT', path: `/api/profile/education/${GARBAGE_ID}`, data: {} },
    ];
    for (const p of probes) {
      const r = await call(seeker.req, p.method, p.path, { headers: evil, data: p.data });
      if (r.status !== 403) accepted.push(describeResult(p.method, p.path, r));
    }

    expect(accepted, `mutations accepted with Origin ${EVIL_ORIGIN}:\n  ${accepted.join('\n  ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Open redirects
// ═══════════════════════════════════════════════════════════════════════════

test.describe('open redirect guards', () => {
  const sameOrigin = (location: string | undefined) => {
    if (!location) return false;
    if (location.startsWith('/') && !location.startsWith('//') && !location.startsWith('/\\')) return true;
    try {
      return new URL(location).origin === new URL(BASE_URL).origin;
    } catch {
      return false;
    }
  };

  test('/auth/callback never bounces to a foreign host', async ({ request }) => {
    const problems: string[] = [];
    const attempts = [
      '/auth/callback?next=https://evil.example',
      '/auth/callback?next=//evil.example',
      '/auth/callback?next=/\\evil.example',
      '/auth/callback?next=%2F%2Fevil.example',
      '/auth/callback?code=bogus-code-h0902&next=https://evil.example',
      '/auth/callback?code=bogus-code-h0902&next=//evil.example',
      '/auth/callback?code=bogus-code-h0902&next=@evil.example',
    ];
    for (const urlPath of attempts) {
      const r = await call(request, 'GET', urlPath);
      const location = r.headers['location'];
      if (r.status >= 500) problems.push(describeResult('GET', urlPath, r));
      else if (r.status >= 300 && r.status < 400 && !sameOrigin(location)) problems.push(`${urlPath} -> ${r.status} Location: ${location}`);
      else if (r.status >= 300 && r.status < 400 && /evil\.example/.test(location ?? '') && !/\/auth\/confirm\?/.test(location ?? '')) {
        problems.push(`${urlPath} -> ${r.status} Location carries evil host: ${location}`);
      }
    }
    expect(problems, `auth callback redirect problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/login?redirectTo= for an authenticated user only lands on same-origin paths', async ({ browser }) => {
    test.skip(!getSeekerCreds(), 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');
    const seeker = await session(browser, 'seeker');
    const problems: string[] = [];
    const attempts = [
      '/login?redirectTo=//evil.example',
      '/login?redirectTo=https://evil.example',
      '/login?redirectTo=/\\evil.example',
      '/login?next=//evil.example/%0d%0aSet-Cookie:x=y',
      '/login?redirectTo=%2F%2Fevil.example',
    ];
    for (const urlPath of attempts) {
      const r = await call(seeker.req, 'GET', urlPath);
      const location = r.headers['location'];
      if (r.status >= 500) problems.push(describeResult('GET', urlPath, r));
      else if (r.status >= 300 && r.status < 400 && !sameOrigin(location)) problems.push(`${urlPath} -> ${r.status} Location: ${location}`);
      else if (r.status === 200 && /evil\.example/.test(r.text)) {
        // Client-side: LoginContent uses safeInternalPath, so a 200 that still
        // embeds the evil target verbatim would mean a bypass path exists.
        problems.push(`${urlPath} rendered 200 and echoed evil.example into the page`);
      }
    }
    expect(problems, `login redirect problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('forgot-password rejects malformed redirectTo values without 5xx', async ({ request }) => {
    // Note: the server silently drops disallowed hosts, so a 200 is the
    // expected answer for both allowed and disallowed targets; what this pins
    // is the contract (400 on bad shapes, never 5xx). See finding on the
    // `*.vercel.app` allowlist in the hunt report.
    const bad = await call(request, 'POST', '/api/auth/forgot-password', { data: { email: 'nobody-h0902@pmhnptest.com', redirectTo: 'not a url' } });
    expect(bad.status, describeResult('POST', '/api/auth/forgot-password (bad redirectTo)', bad)).toBe(400);
    const badEmail = await call(request, 'POST', '/api/auth/forgot-password', { data: { email: 'nope', redirectTo: 'https://evil.example' } });
    expect(badEmail.status, describeResult('POST', '/api/auth/forgot-password (bad email)', badEmail)).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Uploads
// ═══════════════════════════════════════════════════════════════════════════

test.describe('upload validation (local only)', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ALL_CREDS, 'E2E_*_EMAIL / E2E_*_PASS not set for all three roles');

  test('anonymous uploads are refused everywhere', async ({ request }) => {
    const problems: string[] = [];
    const targets: Array<{ path: string; extra?: Record<string, unknown> }> = [
      { path: '/api/upload', extra: { type: 'resume' } },
      { path: '/api/upload/company-logo' },
      { path: '/api/upload/message-attachment' },
      { path: '/api/resume-studio/score-upload' },
      { path: '/api/resume/parse' },
    ];
    for (const t of targets) {
      const r = await call(request, 'POST', t.path, { multipart: { file: file('a.pdf', 'application/pdf', TINY_PDF), ...(t.extra ?? {}) } });
      if (r.status !== 401) problems.push(describeResult('POST (anon)', t.path, r));
    }
    const del = await call(request, 'DELETE', '/api/profile/resume');
    if (del.status !== 401) problems.push(describeResult('DELETE (anon)', '/api/profile/resume', del));
    expect(problems, `anonymous upload problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/upload rejects spoofed, empty, oversized and wrong-type files with 4xx', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const seeker = await session(browser, 'seeker');
    const problems: string[] = [];
    const ip = fakeIp();
    const attempts: Array<{ label: string; multipart: Record<string, unknown>; okStatuses: number[] }> = [
      { label: 'exe renamed .pdf as resume', multipart: { type: 'resume', file: file('evil.pdf', 'application/pdf', EXE_AS_PDF) }, okStatuses: [400] },
      { label: '0-byte pdf as resume', multipart: { type: 'resume', file: file('empty.pdf', 'application/pdf', EMPTY) }, okStatuses: [400] },
      { label: 'png as resume', multipart: { type: 'resume', file: file('pic.png', 'image/png', TINY_PNG) }, okStatuses: [400] },
      { label: 'exe renamed .png as avatar', multipart: { type: 'avatar', file: file('evil.png', 'image/png', EXE_AS_PDF) }, okStatuses: [400] },
      { label: 'missing file', multipart: { type: 'resume' }, okStatuses: [400] },
      { label: 'bad type', multipart: { type: 'weird', file: file('a.pdf', 'application/pdf', TINY_PDF) }, okStatuses: [400] },
      { label: '30MB pdf as resume', multipart: { type: 'resume', file: file('huge.pdf', 'application/pdf', THIRTY_MB()) }, okStatuses: [400, 413] },
    ];
    for (const a of attempts) {
      const r = await call(seeker.req, 'POST', '/api/upload', { multipart: a.multipart, ip });
      if (!a.okStatuses.includes(r.status)) problems.push(`${a.label}: ${describeResult('POST', '/api/upload', r)}`);
    }
    expect(problems, `/api/upload validation problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/upload/company-logo accepts a real PNG and rejects spoofed or empty files', async ({ browser }) => {
    const employer = await session(browser, 'employer');
    const problems: string[] = [];
    const ip = fakeIp();

    const spoof = await call(employer.req, 'POST', '/api/upload/company-logo', { ip, multipart: { file: file('evil.png', 'image/png', EXE_AS_PDF) } });
    if (spoof.status !== 400) problems.push(`exe as png: ${describeResult('POST', '/api/upload/company-logo', spoof)}`);
    const empty = await call(employer.req, 'POST', '/api/upload/company-logo', { ip, multipart: { file: file('empty.png', 'image/png', EMPTY) } });
    if (empty.status !== 400) problems.push(`0-byte png: ${describeResult('POST', '/api/upload/company-logo', empty)}`);
    const svg = await call(employer.req, 'POST', '/api/upload/company-logo', { ip, multipart: { file: file('x.svg', 'image/svg+xml', Buffer.from('<svg onload="alert(1)"/>')) } });
    if (svg.status !== 400) problems.push(`svg: ${describeResult('POST', '/api/upload/company-logo', svg)}`);
    const pdf = await call(employer.req, 'POST', '/api/upload/company-logo', { ip, multipart: { file: file('a.pdf', 'application/pdf', TINY_PDF) } });
    if (pdf.status !== 400) problems.push(`pdf: ${describeResult('POST', '/api/upload/company-logo', pdf)}`);

    const ok = await call(employer.req, 'POST', '/api/upload/company-logo', { ip, multipart: { file: file('logo.png', 'image/png', TINY_PNG) } });
    if (ok.status !== 200) problems.push(`valid png: ${describeResult('POST', '/api/upload/company-logo', ok)}`);
    else if (!/^https?:\/\//.test(String((ok.json() as { url?: string })?.url ?? ''))) problems.push(`valid png returned no url: ${ok.text.slice(0, 200)}`);

    expect(problems, `company-logo problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/upload/message-attachment enforces type, magic bytes and size', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const seeker = await session(browser, 'seeker');
    const problems: string[] = [];
    const ip = fakeIp();

    const spoof = await call(seeker.req, 'POST', '/api/upload/message-attachment', { ip, multipart: { file: file('evil.pdf', 'application/pdf', EXE_AS_PDF) } });
    if (spoof.status !== 400) problems.push(`exe as pdf: ${describeResult('POST', '/api/upload/message-attachment', spoof)}`);
    const empty = await call(seeker.req, 'POST', '/api/upload/message-attachment', { ip, multipart: { file: file('empty.pdf', 'application/pdf', EMPTY) } });
    if (empty.status !== 400) problems.push(`0-byte pdf: ${describeResult('POST', '/api/upload/message-attachment', empty)}`);
    const exe = await call(seeker.req, 'POST', '/api/upload/message-attachment', { ip, multipart: { file: file('evil.exe', 'application/x-msdownload', EXE_AS_PDF) } });
    if (exe.status !== 400) problems.push(`exe: ${describeResult('POST', '/api/upload/message-attachment', exe)}`);
    const big = await call(seeker.req, 'POST', '/api/upload/message-attachment', { ip, multipart: { file: file('big.pdf', 'application/pdf', THIRTY_MB()) } });
    if (big.status !== 400 && big.status !== 413) problems.push(`30MB pdf: ${describeResult('POST', '/api/upload/message-attachment', big)}`);

    const ok = await call(seeker.req, 'POST', '/api/upload/message-attachment', { ip, multipart: { file: file('note.pdf', 'application/pdf', TINY_PDF) } });
    if (ok.status !== 200) problems.push(`valid pdf: ${describeResult('POST', '/api/upload/message-attachment', ok)}`);
    else {
      const body = ok.json() as { path?: string; url?: string };
      if (!body.path || !body.url) problems.push(`valid pdf response missing path/url: ${ok.text.slice(0, 200)}`);
    }

    expect(problems, `message-attachment problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/resume-studio/score-upload scores the fixture resume and rejects bad files', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const seeker = await session(browser, 'seeker');
    const problems: string[] = [];
    const ip = fakeIp();

    const spoof = await call(seeker.req, 'POST', '/api/resume-studio/score-upload', { ip, multipart: { file: file('evil.pdf', 'application/pdf', EXE_AS_PDF) } });
    if (spoof.status !== 400) problems.push(`exe as pdf: ${describeResult('POST', '/api/resume-studio/score-upload', spoof)}`);
    const empty = await call(seeker.req, 'POST', '/api/resume-studio/score-upload', { ip, multipart: { file: file('empty.pdf', 'application/pdf', EMPTY) } });
    if (empty.status !== 400) problems.push(`0-byte pdf: ${describeResult('POST', '/api/resume-studio/score-upload', empty)}`);
    const thin = await call(seeker.req, 'POST', '/api/resume-studio/score-upload', { ip, multipart: { file: file('blank.pdf', 'application/pdf', TINY_PDF) } });
    if (thin.status !== 400) problems.push(`blank pdf (no text): ${describeResult('POST', '/api/resume-studio/score-upload', thin)}`);
    const big = await call(seeker.req, 'POST', '/api/resume-studio/score-upload', { ip, multipart: { file: file('big.pdf', 'application/pdf', THIRTY_MB()) } });
    if (big.status !== 400 && big.status !== 413) problems.push(`30MB pdf: ${describeResult('POST', '/api/resume-studio/score-upload', big)}`);

    const resume = sampleResumeBuffer();
    if (resume) {
      const ok = await call(seeker.req, 'POST', '/api/resume-studio/score-upload', { ip, multipart: { file: file('sample-resume.pdf', 'application/pdf', resume) } });
      if (ok.status !== 200) problems.push(`fixture resume: ${describeResult('POST', '/api/resume-studio/score-upload', ok)}`);
      else if (!(ok.json() as { score?: unknown })?.score) problems.push(`fixture resume returned no score: ${ok.text.slice(0, 200)}`);
    } else {
      test.info().annotations.push({ type: 'note', description: 'sample-resume.pdf fixture not found; happy path skipped' });
    }

    expect(problems, `score-upload problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Query parameter abuse
// ═══════════════════════════════════════════════════════════════════════════

test.describe('query parameter abuse', () => {
  test('/api/jobs clamps or rejects hostile paging, sorting and filter params without 5xx', async ({ request }) => {
    test.setTimeout(6 * 60_000);
    const longQ = 'x'.repeat(10_000);
    const attempts = [
      '/api/jobs?page=-1',
      '/api/jobs?page=0',
      '/api/jobs?page=abc',
      '/api/jobs?page=99999999999',
      '/api/jobs?limit=100000',
      '/api/jobs?limit=abc',
      '/api/jobs?limit=-5',
      '/api/jobs?sort=drop',
      '/api/jobs?sort=%27%3B%20DROP%20TABLE%20jobs%3B--',
      '/api/jobs?stateCode=XX',
      '/api/jobs?salaryMin=abc',
      '/api/jobs?salaryMin=1e400',
      '/api/jobs?salaryMin=-1',
      '/api/jobs?minYears=-1',
      '/api/jobs?postedWithin=garbage',
      '/api/jobs?workMode=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
      '/api/jobs?q=' + encodeURIComponent('психиатр 🧠 ❤ 精神科'),
      '/api/jobs?q=' + encodeURIComponent("' OR 1=1 --"),
      `/api/jobs?q=${longQ}`,
      '/api/jobs?ids=' + GARBAGE_ID + ',,,' + GARBAGE_ID,
      '/api/jobs?ids=' + encodeURIComponent("'"),
    ];
    const problems: string[] = [];
    const observed: string[] = [];
    for (const urlPath of attempts) {
      const r = await call(request, 'GET', urlPath);
      observed.push(`${urlPath.slice(0, 80)} -> ${r.status}`);
      if (r.status >= 500) {
        problems.push(describeResult('GET', urlPath.slice(0, 80), r));
        continue;
      }
      if (r.status === 200) {
        const body = r.json() as { jobs?: unknown[]; page?: number; totalPages?: number } | null;
        if (!body || !Array.isArray(body.jobs)) problems.push(`200 without jobs array: ${urlPath.slice(0, 80)} -> ${r.text.slice(0, 120)}`);
        else if (body.jobs.length > 50) problems.push(`limit not clamped (${body.jobs.length} rows): ${urlPath.slice(0, 80)}`);
        else if (typeof body.page === 'number' && (body.page < 1 || !Number.isFinite(body.page))) problems.push(`page not clamped (${body.page}): ${urlPath.slice(0, 80)}`);
      }
    }
    test.info().attach('jobs-query-abuse.txt', { body: observed.join('\n'), contentType: 'text/plain' });
    expect(problems, `/api/jobs query problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/jobs/[id] hides garbage and unpublished ids; sibling lookups tolerate garbage', async ({ browser, request }) => {
    const problems: string[] = [];

    const garbage = await call(request, 'GET', `/api/jobs/${GARBAGE_ID}`);
    if (garbage.status !== 404) problems.push(describeResult('GET', `/api/jobs/${GARBAGE_ID}`, garbage));
    const uuidish = await call(request, 'GET', '/api/jobs/00000000-0000-4000-8000-000000000000');
    if (uuidish.status !== 404) problems.push(describeResult('GET', '/api/jobs/<zero uuid>', uuidish));

    if (getAdminCreds()) {
      const admin = await session(browser, 'admin');
      const unpublishedList = await call(admin.req, 'GET', '/api/admin/jobs?published=false&limit=1');
      const parsed = unpublishedList.json() as { jobs?: Array<{ id: string }>; data?: { jobs?: Array<{ id: string }> } } | null;
      const unpublished = parsed?.jobs?.[0] ?? parsed?.data?.jobs?.[0];
      if (unpublished) {
        const r = await call(request, 'GET', `/api/jobs/${unpublished.id}`);
        if (r.status !== 404 && r.status !== 410) problems.push(`unpublished job exposed: ${describeResult('GET', `/api/jobs/${unpublished.id}`, r)}`);
      } else {
        test.info().annotations.push({ type: 'note', description: `no unpublished job found: ${describeResult('GET', '/api/admin/jobs?published=false', unpublishedList)}` });
      }
    }

    const screening = await call(request, 'GET', `/api/jobs/${GARBAGE_ID}/screening-questions`);
    if (screening.status !== 200 || !Array.isArray((screening.json() as { questions?: unknown[] })?.questions)) {
      problems.push(describeResult('GET', `/api/jobs/${GARBAGE_ID}/screening-questions`, screening));
    }
    const similar = await call(request, 'GET', `/api/jobs/similar?id=${GARBAGE_ID}&jobId=${GARBAGE_ID}`);
    if (similar.status >= 500) problems.push(describeResult('GET', '/api/jobs/similar?id=garbage', similar));
    const track = await call(request, 'POST', `/api/jobs/${GARBAGE_ID}/track-apply`, { data: {} });
    if (track.status >= 500) problems.push(describeResult('POST', `/api/jobs/${GARBAGE_ID}/track-apply`, track));

    for (const urlPath of ['/api/sitemaps/jobs/abc', '/api/sitemaps/jobs/-1', '/api/sitemaps/jobs/999999', '/api/sitemaps/cities/abc', '/api/sitemaps/cities/999999']) {
      const r = await call(request, 'GET', urlPath);
      if (r.status >= 500) problems.push(describeResult('GET', urlPath, r));
    }

    expect(problems, `job lookup problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Public information exposure and health shapes
// ═══════════════════════════════════════════════════════════════════════════

test.describe('public information exposure', () => {
  test('identity and dashboard endpoints give an anonymous caller nothing', async ({ request }) => {
    const problems: string[] = [];

    const me = await call(request, 'GET', '/api/auth/me');
    if (me.status !== 200) problems.push(describeResult('GET', '/api/auth/me', me));
    else {
      const body = me.json() as Record<string, unknown>;
      if (body.id !== null || body.email) problems.push(`anonymous /api/auth/me leaked identity: ${me.text.slice(0, 200)}`);
    }

    const snapshot = await call(request, 'GET', '/api/employer/profile-snapshot');
    if (snapshot.status !== 401) problems.push(describeResult('GET', '/api/employer/profile-snapshot', snapshot));

    const dashboard = await call(request, 'GET', '/api/dashboard');
    if (dashboard.status !== 401) problems.push(describeResult('GET', '/api/dashboard', dashboard));

    const ext = await call(request, 'GET', '/api/auth/extension-token');
    if (ext.status !== 401) problems.push(describeResult('GET', '/api/auth/extension-token', ext));

    const docUrl = await call(request, 'GET', '/api/documents/resume/me/url');
    if (docUrl.status !== 401) problems.push(describeResult('GET', '/api/documents/resume/me/url', docUrl));

    const preview = await call(request, 'GET', '/api/email-preview?all=1');
    if (preview.status !== 401) problems.push(describeResult('GET', '/api/email-preview', preview));

    const companies = await call(request, 'GET', '/api/companies?limit=5');
    if (companies.status !== 200) problems.push(describeResult('GET', '/api/companies', companies));
    else {
      const text = companies.text;
      if (/"(email|contactEmail|phone|password|token)"\s*:/.test(text)) problems.push(`/api/companies exposes contact fields: ${text.slice(0, 200)}`);
      const rows = (companies.json() as { data?: { companies?: unknown[] } })?.data?.companies ?? [];
      if (!Array.isArray(rows) || rows.length === 0) problems.push('/api/companies returned no companies');
    }

    expect(problems, `public exposure problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/health and /api/newsletter/status have stable shapes', async ({ request }) => {
    const health = await call(request, 'GET', '/api/health');
    expect([200, 503], describeResult('GET', '/api/health', health)).toContain(health.status);
    const h = health.json() as { status?: string; timestamp?: string; checks?: { database?: { status?: string } } } | null;
    expect(h?.status, health.text).toMatch(/^(healthy|degraded|unhealthy)$/);
    expect(h?.checks?.database?.status, health.text).toMatch(/^(up|down)$/);
    expect(Number.isNaN(Date.parse(h?.timestamp ?? '')), 'health timestamp must be ISO').toBe(false);

    const noEmail = await call(request, 'GET', '/api/newsletter/status');
    expect(noEmail.status, describeResult('GET', '/api/newsletter/status', noEmail)).toBe(200);
    expect((noEmail.json() as { optIn?: unknown })?.optIn, noEmail.text).toBe(false);
    const unknown = await call(request, 'GET', '/api/newsletter/status?email=nobody-h0902%40pmhnptest.com');
    expect(unknown.status, describeResult('GET', '/api/newsletter/status?email=unknown', unknown)).toBe(200);
    expect(typeof (unknown.json() as { optIn?: unknown })?.optIn, unknown.text).toBe('boolean');
    const weird = await call(request, 'GET', '/api/newsletter/status?email=' + encodeURIComponent("' OR 1=1 --"));
    expect(weird.status, describeResult('GET', '/api/newsletter/status?email=sqli', weird)).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Numeric query params on public list routes
// ═══════════════════════════════════════════════════════════════════════════

test.describe('numeric query params on public list routes', () => {
  // Both /api/jobs and /api/companies clamp with Math.min(Math.max(parseInt(x), 1), N).
  // parseInt('abc') is NaN and Math.max(1, NaN) is NaN, so the clamp passes NaN
  // straight into Prisma's `take` / `skip` and the handler answers 500.
  test('/api/companies answers a non-numeric or negative limit with 4xx or a clamped 200, never 5xx', async ({ request }) => {
    const problems: string[] = [];
    for (const urlPath of ['/api/companies?limit=abc', '/api/companies?limit=-5', '/api/companies?limit=1e400', '/api/companies?limit=']) {
      const r = await call(request, 'GET', urlPath);
      if (r.status >= 500) problems.push(describeResult('GET', urlPath, r));
    }
    const huge = await call(request, 'GET', '/api/companies?limit=100000');
    if (huge.status !== 200) problems.push(describeResult('GET', '/api/companies?limit=100000', huge));
    else {
      const rows = (huge.json() as { data?: { companies?: unknown[] } })?.data?.companies ?? [];
      if (!Array.isArray(rows) || rows.length > 100) problems.push(`/api/companies limit not capped at 100: ${Array.isArray(rows) ? rows.length : 'not an array'} rows`);
    }
    expect(problems, `/api/companies limit problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  test('/api/jobs paging params never reach Prisma as NaN or a negative skip', async ({ request }) => {
    const problems: string[] = [];
    for (const urlPath of ['/api/jobs?page=-1', '/api/jobs?page=abc', '/api/jobs?limit=abc', '/api/jobs?page=0', '/api/jobs?limit=-5']) {
      const r = await call(request, 'GET', urlPath);
      if (r.status >= 500) problems.push(describeResult('GET', urlPath, r));
    }
    expect(problems, `/api/jobs paging problems:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});
