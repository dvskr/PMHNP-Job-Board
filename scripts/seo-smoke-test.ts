/**
 * P4.4: pre-deploy SEO smoke test.
 *
 * HEAD-checks a curated set of URL patterns against a target deployment to
 * catch regressions before promoting to production. Runs against ANY URL —
 * Vercel preview, staging, or prod.
 *
 *   npx tsx scripts/seo-smoke-test.ts                                  # default: production
 *   npx tsx scripts/seo-smoke-test.ts --target https://preview.vercel.app
 *   npx tsx scripts/seo-smoke-test.ts --target http://localhost:3000   # local dev
 *
 * Exit code:
 *   0 — all checks pass, safe to promote
 *   1 — one or more checks failed, BLOCK the promotion
 *
 * Wire into Vercel preview deploys via a vercel.json `preview-check`
 * hook, or run from CI before `vercel promote`.
 */

const ARGS = process.argv.slice(2);
const targetIdx = ARGS.indexOf('--target');
const TARGET = targetIdx >= 0 ? ARGS[targetIdx + 1] : 'https://pmhnphiring.com';
const VERBOSE = ARGS.includes('--verbose');

const HEAD_TIMEOUT_MS = 10_000;
const HARNESS_UA = 'PMHNPHiringIndexer/1.0 (+seo-smoke-test)';

interface Check {
    name: string;
    path: string;
    expectStatus: number | number[];
    /** Optional header assertions: header name → expected value substring */
    expectHeader?: Record<string, string>;
}

// Curated checks. Edit when shipping new URL handlers.
const CHECKS: Check[] = [
    // ── Static surfaces — must always 200 ──
    { name: 'homepage', path: '/', expectStatus: 200 },
    { name: 'jobs listing', path: '/jobs', expectStatus: 200 },
    { name: 'blog index', path: '/blog', expectStatus: 200 },
    { name: 'companies index', path: '/companies', expectStatus: 200 },
    { name: 'about', path: '/about', expectStatus: 200 },
    { name: 'faq', path: '/faq', expectStatus: 200 },
    { name: 'pricing', path: '/pricing', expectStatus: 200 },

    // ── SEO infra ──
    { name: 'robots.txt', path: '/robots.txt', expectStatus: 200 },
    { name: 'primary sitemap', path: '/sitemap.xml', expectStatus: 200 },
    { name: 'sitemap index API', path: '/api/sitemaps/index', expectStatus: 200 },
    { name: 'city sitemap batch 0', path: '/api/sitemaps/cities/0', expectStatus: 200 },

    // ── Category landing pages — always 200 ──
    { name: 'remote landing', path: '/jobs/remote', expectStatus: 200 },
    { name: 'va landing', path: '/jobs/va', expectStatus: 200 },
    { name: 'community-health landing', path: '/jobs/community-health', expectStatus: 200 },
    { name: 'state landing — california', path: '/jobs/state/california', expectStatus: 200 },

    // ── Pagination noindex (P3.5) — must set X-Robots-Tag on ?page>=2 ──
    {
        name: 'pagination ?page=2 sets noindex header',
        path: '/jobs?page=2',
        expectStatus: 200,
        expectHeader: { 'x-robots-tag': 'noindex' },
    },

    // ── 410 middleware (P1.2) — invalid pSEO shapes must return 410 ──
    {
        name: '410 for invalid state slug',
        path: '/jobs/state/atlantis',
        expectStatus: 410,
        expectHeader: { 'x-robots-tag': 'noindex' },
    },
    {
        name: '410 for invalid taxonomy',
        path: '/jobs/some-fake-taxonomy/california',
        expectStatus: 410,
    },
    {
        name: '410 for invalid metro slug',
        path: '/jobs/metro/atlantis-fake',
        expectStatus: 410,
    },
    {
        name: '410 for invalid city slug under known taxonomy',
        path: '/jobs/va/city/zzz-not-a-real-city-slug',
        expectStatus: 410,
    },

    // ── Trailing slash + page=1 + UTM stripping (existing middleware) ──
    {
        name: 'trailing slash → 301 redirect',
        path: '/jobs/',
        expectStatus: 301,
    },
    {
        name: '?page=1 → 301 redirect to bare URL',
        path: '/jobs?page=1',
        expectStatus: 301,
    },
];

interface Result {
    check: Check;
    actualStatus: number;
    headers: Headers | null;
    error: string | null;
    pass: boolean;
    failureReason?: string;
}

async function runCheck(check: Check): Promise<Result> {
    const url = `${TARGET}${check.path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
        const res = await fetch(url, {
            method: 'HEAD',
            redirect: 'manual',
            signal: controller.signal,
            headers: { 'User-Agent': HARNESS_UA },
        });
        clearTimeout(timer);

        const expected = Array.isArray(check.expectStatus) ? check.expectStatus : [check.expectStatus];
        const statusOk = expected.includes(res.status);
        let headerOk = true;
        let headerFailure = '';
        if (check.expectHeader) {
            for (const [name, expectedSubstr] of Object.entries(check.expectHeader)) {
                const actual = res.headers.get(name);
                if (!actual || !actual.toLowerCase().includes(expectedSubstr.toLowerCase())) {
                    headerOk = false;
                    headerFailure = `header "${name}" missing or doesn't contain "${expectedSubstr}" (got: "${actual ?? 'null'}")`;
                    break;
                }
            }
        }

        return {
            check,
            actualStatus: res.status,
            headers: res.headers,
            error: null,
            pass: statusOk && headerOk,
            failureReason: !statusOk
                ? `expected status ${expected.join(' or ')}, got ${res.status}`
                : !headerOk
                    ? headerFailure
                    : undefined,
        };
    } catch (err) {
        return {
            check,
            actualStatus: 0,
            headers: null,
            error: err instanceof Error ? err.message : String(err),
            pass: false,
            failureReason: `network error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

async function main() {
    console.log(`\nSEO smoke test against: ${TARGET}`);
    console.log(`${CHECKS.length} checks queued.\n`);

    const results: Result[] = [];
    let pass = 0;
    let fail = 0;

    for (const check of CHECKS) {
        const r = await runCheck(check);
        results.push(r);
        if (r.pass) {
            pass++;
            if (VERBOSE) console.log(`  ✓ ${check.name}  →  ${check.path}  →  ${r.actualStatus}`);
        } else {
            fail++;
            console.log(`  ✗ ${check.name}  →  ${check.path}`);
            console.log(`      ${r.failureReason}`);
        }
        // Gentle pacing so we don't trigger Vercel's platform DDoS layer.
        await new Promise((r) => setTimeout(r, 150));
    }

    console.log(`\n${pass}/${CHECKS.length} passed, ${fail} failed.\n`);

    if (fail > 0) {
        console.error(`✗ SEO smoke test FAILED. Block this deploy promotion.`);
        process.exit(1);
    } else {
        console.log(`✓ All checks passed. Safe to promote.`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
