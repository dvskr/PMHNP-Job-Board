/**
 * Static regression guards for audit fixes that are config/wiring/UI and not
 * practical to unit-test behaviorally. Each reads the real source so a future
 * edit can't silently revert the fix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

describe('payments wiring', () => {
  it('create-renewal-checkout blocks refunded postings', () => {
    const src = read('app/api/create-renewal-checkout/route.ts');
    expect(src).toMatch(/paymentStatus === 'refunded'/);
  });
  it('stripe webhook resets expiryWarningSentAt on renewal', () => {
    const src = read('app/api/webhooks/stripe/route.ts');
    expect(src).toMatch(/expiryWarningSentAt:\s*null/);
  });
  it('stripe webhook only unpublishes on a full refund', () => {
    const src = read('app/api/webhooks/stripe/route.ts');
    expect(src).toMatch(/if \(isFullRefund\)/);
  });
  it('stripe webhook has a dispute handler', () => {
    const src = read('app/api/webhooks/stripe/route.ts');
    expect(src).toContain("charge.dispute.created");
    expect(src).toMatch(/paymentStatus:\s*'disputed'/);
  });
});

describe('dashboard stats', () => {
  it('counts unread/profileViews by profile.id and profileViews is not hardcoded 0', () => {
    const src = read('app/api/dashboard/route.ts');
    expect(src).not.toMatch(/profileViews:\s*0/);
    expect(src).toMatch(/recipientId:\s*profile\.id/);
    expect(src).toMatch(/candidateId:\s*profile\.id/);
  });
});

describe('FeaturedJobs hydration guard', () => {
  it('mount-guards the relative time render', () => {
    const src = read('components/FeaturedJobs.tsx');
    expect(src).toMatch(/mounted\s*\?\s*relativeTime/);
  });
});

describe('job-alert email URL uses params the /jobs page reads', () => {
  it('buildFilteredJobsUrl uses workMode/jobType/salaryMin', () => {
    const src = read('lib/job-alerts-service.ts');
    expect(src).toContain("'workMode'");
    expect(src).toContain("'jobType'");
    expect(src).toContain("'salaryMin'");
    expect(src).not.toMatch(/params\.set\('mode'/);
  });
});

describe('recs:run script', () => {
  it('no longer passes the removed quota option', () => {
    const src = read('scripts/run-recommendations.ts');
    expect(src).not.toMatch(/quota:\s*RECOMMENDATION_QUOTA/);
  });
});

describe('enrich-jobs stamps thin jobs', () => {
  it('marks too-thin jobs as skippedThin instead of errors', () => {
    const src = read('app/api/cron/enrich-jobs/route.ts');
    expect(src).toContain('skippedThin');
    expect(src).toContain('tooThin');
  });
});

describe('freshness-decay uses id-cursor pagination', () => {
  it('orders by id asc and pages with id gt cursor (no skip-offset)', () => {
    const src = read('lib/freshness-decay.ts');
    expect(src).toMatch(/orderBy:\s*\{\s*id:\s*'asc'\s*\}/);
    expect(src).toMatch(/id:\s*\{\s*gt:\s*cursor\s*\}/);
  });
});

describe('.env.example documents the previously-missing vars', () => {
  it('includes DIRECT_URL, OPENAI/ANTHROPIC, UPSTASH, RAPIDAPI, VAPID, Sentry public DSN', () => {
    const src = read('.env.example');
    for (const v of ['DIRECT_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'UPSTASH_REDIS_REST_URL', 'RAPIDAPI_KEY', 'VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_SENTRY_DSN', 'EXTENSION_JWT_SECRET']) {
      expect(src, `missing ${v}`).toContain(v);
    }
    expect(src).not.toMatch(/All vars are validated on startup/);
  });
});

describe('restore-account wired into login', () => {
  it('LoginContent POSTs /api/auth/restore-account', () => {
    const src = read('components/auth/LoginContent.tsx');
    expect(src).toContain('/api/auth/restore-account');
    expect(src).toContain('safeInternalPath');
  });
});

describe('Sentry is wired at runtime', () => {
  it('per-runtime config files exist with Sentry.init', () => {
    for (const f of ['sentry.server.config.ts', 'sentry.edge.config.ts', 'instrumentation-client.ts']) {
      expect(exists(f), `${f} missing`).toBe(true);
      expect(read(f)).toContain('Sentry.init');
    }
  });
  it('instrumentation loads per-runtime config + exports onRequestError', () => {
    const src = read('instrumentation.ts');
    expect(src).toContain('sentry.server.config');
    expect(src).toContain('sentry.edge.config');
    expect(src).toMatch(/onRequestError/);
  });
  it('lib/sentry delegates to the real SDK', () => {
    const src = read('lib/sentry.ts');
    expect(src).toContain("from '@sentry/nextjs'");
    expect(src).toContain('Sentry.captureException');
  });
});

describe('widget UTM attribution survives the strip', () => {
  it('middleware sets pmhnp_attribution cookie before the utm 301', () => {
    const src = read('middleware.ts');
    expect(src).toContain('pmhnp_attribution');
  });
});

describe('pSEO crawler edge-caching', () => {
  it('middleware edge-caches public /jobs listing pages for crawlers and skips the consent cookie for them', () => {
    const src = read('middleware.ts');
    // Consent cookie skipped for crawlers (so the response is CDN-cacheable).
    expect(src).toMatch(/if \(!isCrawler\)\s*\{\s*response\.cookies\.set\('pmhnp_consent_region'/);
    // Edge cache directive set for crawler GETs on listing paths.
    expect(src).toContain("response.headers.set('CDN-Cache-Control'");
    expect(src).toMatch(/isCrawler &&[\s\S]*isJobDetailUrl/);
  });
});

describe('OG routes are not SSRF proxies', () => {
  for (const f of ['app/api/og/route.tsx', 'app/api/og/city/route.tsx']) {
    it(`${f} fetches the logo from a fixed origin`, () => {
      const src = read(f);
      expect(src).toContain("fetch('https://pmhnphiring.com/pmhnp_logo.png')");
      expect(src).not.toMatch(/fetch\(`\$\{protocol\}:\/\/\$\{host\}/);
    });
  }
});

describe('manifest + deps hygiene', () => {
  it('ai-plugin.json dropped the invalid openapi api block', () => {
    const json = JSON.parse(read('public/.well-known/ai-plugin.json'));
    expect(json.api).toBeUndefined();
  });
  it('package.json removed @vercel/og and moved playwright to devDependencies', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['@vercel/og']).toBeUndefined();
    expect(pkg.dependencies['playwright']).toBeUndefined();
    expect(pkg.devDependencies['playwright']).toBeDefined();
  });
});

describe('SiteStat is wired (not dropped)', () => {
  it('homepage reads cached counters via getSiteStats, not live job.count', () => {
    const src = read('app/page.tsx');
    expect(src).toContain('getSiteStats');
    expect(src).not.toMatch(/prisma\.job\.count/);
  });
  it('a refresh-site-stats cron exists and is scheduled', () => {
    expect(exists('app/api/cron/refresh-site-stats/route.ts')).toBe(true);
    expect(exists('lib/site-stats.ts')).toBe(true);
    const vercel = JSON.parse(read('vercel.json'));
    expect(vercel.crons.some((c: { path: string }) => c.path === '/api/cron/refresh-site-stats')).toBe(true);
  });
});

describe('job-listing orderBy is centralized (no inlined arrays can re-diverge)', () => {
  // The SSR /jobs page once carried its own orderBy that dropped the
  // employer-first lead, so employer jobs appeared mid-list until the client
  // re-fetched. Every listing query now builds its order through
  // lib/utils/job-sort (buildJobsOrderBy / BEST_SORT_ORDER_BY). This guard
  // fails CI if any listing surface re-inlines `{ isFeatured: 'desc' }` — the
  // tell-tale lead of the old hand-rolled array. (Selects use
  // `isFeatured: true`, not `'desc'`, so this can't false-positive on them.)
  function walk(dir: string, acc: string[] = []): string[] {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return acc;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(rel);
    }
    return acc;
  }

  it('no file under app/jobs or lib/pseo inlines a `{ isFeatured: \'desc\' }` listing order', () => {
    const offenders = [...walk('app/jobs'), ...walk('lib/pseo')]
      .filter((f) => /isFeatured:\s*'desc'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(offenders, `Inlined listing orderBy found in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('SSR /jobs page and the /api/jobs route both build order via buildJobsOrderBy(sort)', () => {
    // Parity by construction: both call the same helper with the same sort, so
    // the initial server render and the client re-fetch can never disagree.
    for (const f of ['app/jobs/page.tsx', 'app/api/jobs/route.ts']) {
      expect(read(f), `${f} must route through buildJobsOrderBy`).toMatch(/buildJobsOrderBy\(\s*sort/);
    }
  });
});

describe('dead routes and files are gone', () => {
  const deletedRoutes = [
    'app/api/ingest', 'app/api/stats', 'app/api/admin/stats', 'app/api/admin/trigger-ingestion',
    'app/api/admin/employer-outreach', 'app/api/admin/shortlinks/stats', 'app/api/jobs/categories',
    'app/api/jobs/parse-locations', 'app/api/candidates/search', 'app/api/employer/dashboard',
    'app/api/preview-social',
  ];
  for (const r of deletedRoutes) {
    it(`${r} is deleted`, () => expect(exists(`${r}/route.ts`)).toBe(false));
  }
  const deletedFiles = [
    'public/resume/satish-daggula-pmhnp-resume.html',
    'app/for-job-seekers/create-profile/page.tsx',
    'components/ai/ForYouRecommendations.tsx',
    'app/api/recommendations/route.ts',
    'app/api/recommendations/click/route.ts',
    'pmhnp-autofill-extension/src/content/ai.ts',
    'pmhnp-autofill-extension/src/content/ai-classifier.ts',
    'pmhnp-autofill-extension/src/shared/usage.ts',
    'pmhnp-autofill-extension/src/shared/analytics.ts',
    'lib/expiry-checker.ts',
    'lib/url-resolver.ts',
    'lib/utils/resolve-url.ts',
    'components/ShareButton.tsx',
    'components/ShareModal.tsx',
  ];
  for (const f of deletedFiles) {
    it(`${f} is deleted`, () => expect(exists(f)).toBe(false));
  }
});
