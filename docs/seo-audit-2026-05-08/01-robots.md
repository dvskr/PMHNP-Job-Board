01 - robots.ts audit
Audited: 2026-05-08. Files: app/robots.ts, middleware.ts, app/sitemap.ts, tests/seo/sitemap-budget.test.ts

CRITICAL: None. P2.3 fix is correctly in place. No crawl blockers on indexed content.

HIGH 1 - AUTH_REBLOCK_DATE deadline 2026-05-19 has no CI enforcement
Location: app/robots.ts:9, tests/seo/sitemap-budget.test.ts:138-166
Issue: sitemap-budget.test.ts deadline test (lines 138-166) is designed to fail once today
is at or after 2026-05-19, forcing re-add of auth paths to FULL_DISALLOW.
autofill-tests.yml triggers only on pmhnp-autofill-extension/** (runs extension tests, not main).
ai-gates.yml runs only tests/lib/ai. vitest.config.ts glob tests/**/*.test.ts covers the file
but no CI job invokes it. Deadline will silently pass.
Fix: Add .github/workflows/seo-guard.yml running npx vitest run tests/seo on push to main/dev
and on PRs targeting main. Set NEXT_PUBLIC_BASE_URL=https://pmhnphiring.com.

HIGH 2 - Sitemap URLs not in PUBLIC_ALLOW rely on implicit allow with no test coverage
Location: app/robots.ts:13-26, app/sitemap.ts:92-98, app/sitemap.ts:120-126
Issue: /about, /contact, /terms, /privacy, /pricing, /resources, /resources/fpa-guide,
/resources/private-practice-guide, /resources/1099-vs-w2, /new-grad, /job-alerts,
/jobs/locations are in the sitemap but absent from PUBLIC_ALLOW. They are implicitly
crawlable (no FULL_DISALLOW prefix matches them) so no current blocking. The risk is
maintenance: a future FULL_DISALLOW entry that prefix-matches any of these silently
blocks them with no test to catch it.
Fix: Add the paths to PUBLIC_ALLOW in app/robots.ts after line 25. Add a
sitemap-budget.test.ts assertion that each sitemap URL pattern has a PUBLIC_ALLOW prefix.

MEDIUM 1 - Six active AI crawlers absent from AI_CRAWLERS receive no crawl delay
Location: app/robots.ts:91-108
Issue: MistralAI-User, AI2Bot, iaskspider, Kangaroo, Timpibot, img2dataset are active in
2025-2026 but absent from AI_CRAWLERS. They get catch-all * with no crawl-delay.
Fix: Add all six to AI_CRAWLERS in app/robots.ts:91.

MEDIUM 2 - SOCIAL_DISALLOW missing auth-gated surfaces
Location: app/robots.ts:87
Issue: SOCIAL_DISALLOW has only /api/, /admin/, /dashboard/. Social bots can reach /auth/,
/settings, /employer/dashboard/, /employer/candidates/, etc., generating broken preview cards.
Fix: Add /auth/, /employer/dashboard/, /employer/candidates/, /employer/settings, /settings,
/my-applications, /saved, /messages to SOCIAL_DISALLOW.

MEDIUM 3 - /api/sitemaps/ trailing-slash inconsistency
Location: app/robots.ts:24, middleware.ts:876
Issue: PUBLIC_ALLOW uses /api/sitemaps/ (trailing slash). middleware.ts:876 uses
!pathname.startsWith(/api/sitemaps) (no slash). Maintenance hazard.
Fix: Change /api/sitemaps/ to /api/sitemaps in app/robots.ts:24.

MEDIUM 4 - Disallow /api/cron/, /api/webhooks/, /api/admin/ are dead rules
Location: app/robots.ts:51-53
Issue: Disallow: /api/ already covers every API sub-route. The three entries are dead weight
repeated across all 21 named-crawler blocks.
Fix: Remove the three from FULL_DISALLOW in app/robots.ts.

LOW - console.warn for AUTH_REBLOCK_DATE not wired to alerting sink
Location: app/robots.ts:154-156
Issue: Warn fires only in Vercel logs on sitemap revalidation. Once the CI workflow is added
it becomes a redundant backstop, which is fine.
Fix: No code change required after CI workflow is added.

Verified-clean:
- middleware.ts noindex block lines 857-879: confirmed covers /login, /signup, /messages,
  /saved, /job-alerts/manage, /employer/login (via hasNoindexPrefix at line 871), /dashboard,
  /admin, /auth, /jobs/edit/, /settings, /my-applications, /unauthorized, /success,
  /post-job/checkout, /post-job/preview, /forgot-password, /reset-password,
  /email-preferences, /unsubscribe, all non-sitemap API routes.
- /api/ vs /api/sitemaps/ conflict: safe. Next.js renders Allow before Disallow per block.
  Order-first parsers grant the allow. RFC 9309 specificity parsers (Googlebot) also grant.
- /api/og allow: identical analysis -- safe under both parser models.
- 410 responses middleware.ts job-detail 411-414, company 495-499/509, pSEO 543-588:
  each inline-sets X-Robots-Tag before the main noindex block. No gap.
- AUTH_REBLOCK_DATE comparison robots.ts:154: lexicographic ISO date is correct.
  2026-05-08 < 2026-05-19 so warn does not fire. P2.3 unblock is active.
- sitemap-budget.test.ts deadline test lines 138-166: correctly skips today. Logic correct.
- Disallow /videos/: correct -- five .webm files in public/videos/ served at /videos/*.
- Sitemap has no URL within any FULL_DISALLOW prefix. No sitemap-plus-block conflict.
- SOCIAL_BOTS robots.ts:110-120: covers all major sharing-context UAs.
- Trailing slash 301 middleware.ts:642-645 and page=1 301 middleware.ts:659-662 both fire
  before the noindex block with correct 301 status.
- Paginated noindex middleware.ts:888-893: page >= 2 gets noindex,follow. Link equity flows.
- /employer/login: covered by hasNoindexPrefix at middleware.ts:871.