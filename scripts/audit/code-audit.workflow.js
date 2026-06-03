export const meta = {
  name: 'pmhnp-deep-audit',
  description: 'Exhaustive multi-agent audit of the PMHNP job board: security, bugs, SEO, DB, tests, payments, email/cron, a11y, perf, privacy',
  phases: [
    { title: 'Analyze', detail: 'one specialist finder per dimension reads the codebase' },
    { title: 'Verify', detail: 'adversarial verification of each dimension’s findings' },
  ],
}

// ── Shared production/runtime observations (seed agents with ground truth) ──
const RUNTIME = `

=== GROUND-TRUTH OBSERVATIONS (already collected by the orchestrator; use these to hunt ROOT CAUSES in code) ===
Stack: Next.js 16 (App Router, React 19), Prisma 7 + Postgres (Supabase), Supabase auth, Stripe, OpenAI, Upstash Redis rate-limit, Resend email, Inngest, web-push. Live site: https://pmhnphiring.com. ~160 API routes under app/api. Prisma schema is snake_case via @map (prisma/schema.prisma, ~70 models). middleware.ts is 967 lines.

PROD DB FACTS (read-only queried just now):
- jobs: 36,521 total rows; 1,557 published; 34,964 unpublished; 204 archived. Of published: 1,547 source_type='external' (aggregated) vs only 10 'employer'.
- AI layer DORMANT in prod: job_embeddings table = 0 rows; candidate_recommendations = 0 rows; BUT candidate_embeddings = 187 rows. So job vectors were never written to prod → semantic job search + candidate->job recs cannot use stored vectors.
- Monetization: employer_jobs all 24 are payment_status='free' / pricing_tier='pro'; job_charges = 0; processed_stripe_events = 0. ZERO paid transactions ever.
- gsc_snapshots = 0 rows (GSC health monitoring dormant). Only 4 cron names ever appear in cron_runs (ingest, enrich-jobs, ingest-wave-summary, freshness-decay) despite ~40 cron endpoints defined in vercel.json — the rest either never run or never record a CronRun.
- Dead links: ~145 published jobs have health_consecutive_missing>0; some at 52/51/36 consecutive misses yet still is_published=true. 12 user job_reports of 'expired'.
- Content quality: 508 of 1,557 published jobs have description length < 300 chars; 235 have no salary; ~405 have quality_score <= 40; companies table 4,723 rows with 0 logos.
- Engagement: total_views 108,976 but total apply_click_count only 271 (90.7% of jobs have 0 apply clicks).
- Email: email_sends status field is single-mutable; sent 34,769 / opened 1,894 / delivered 1,183 / clicked 275 / bounced 29.

RUNTIME (live Playwright crawl of 104 pages just now):
- SOFT-404: GET /jobs/<nonexistent-slug> returns HTTP 200 with a "Page Not Found" body (meta robots noindex,follow) instead of HTTP 404. The dynamic app/jobs/[slug] route renders a not-found component WITHOUT calling notFound(), so status stays 200. (A different pattern /jobs/<taxonomy>/city/<bad> DOES correctly 410 via middleware.)
- HYDRATION: React error #418 (text content mismatch) throws on /jobs and on multiple pSEO listing pages (/jobs/remote, /jobs/telehealth, /jobs/new-grad, /jobs/1099, /jobs/behavioral-health, /jobs/state/illinois, /jobs/metro/chicago-il). Likely a server/client text mismatch (relative time / date / timezone / random).
- /post-job renders with H1 count = 0 and triggers a 401 resource fetch.
- Missing <link rel=canonical> on /jobs/city, /jobs/state (real indexable hub pages), /do-not-sell, /data-request.
- NOTE: the many '?_rsc=...' net::ERR_ABORTED requests are benign Next.js prefetch cancellations — DO NOT report them.
=== END OBSERVATIONS ===
`

const OUTPUT_RULES = `
Rules for findings:
- Investigate the ACTUAL code with Grep/Glob/Read/Bash. Cite concrete file paths and line numbers as evidence. Do NOT speculate without reading.
- Only report REAL issues you verified in the code. Prefer fewer, high-confidence findings over a long speculative list. Max ~12 findings.
- Severity: CRITICAL (security/data-loss/revenue/legal), HIGH (real bug or major SEO/UX harm), MEDIUM (maintainability/perf), LOW (polish).
- For each finding set confidence 0-1. Be specific about impact and a concrete fix.
- Your returned text is consumed by a program; return ONLY the structured object.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['dimension', 'summary', 'findings'],
  additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    summary: { type: 'string', description: '2-4 sentence brutal-honest state of this dimension' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'severity', 'confidence', 'files', 'evidence', 'impact', 'recommendation'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          confidence: { type: 'number' },
          files: { type: 'array', items: { type: 'string' }, description: 'file:line references' },
          evidence: { type: 'string' },
          impact: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['dimension', 'verdicts'],
  additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'verdict', 'severity', 'note'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'partially-confirmed', 'refuted', 'uncertain'] },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          note: { type: 'string', description: 'why confirmed/refuted; correct any overstatement' },
        },
      },
    },
  },
}

const DIMS = [
  {
    key: 'security-authz', agentType: 'security-reviewer',
    prompt: `You are auditing ACCESS CONTROL / AUTH on this Next.js job board. Focus: broken auth, IDOR, missing authorization, privilege escalation, admin route protection, token handling.
Investigate: middleware.ts (auth gating + matcher), lib/auth/**, lib/supabase/** (server/middleware/client), and especially the API routes that read/write per-user data:
  - app/api/employer/** (can employer A read employer B's applicants/candidates/messages/jobs? is ownership checked or only role?)
  - app/api/profile/**, app/api/candidate-profile/**, app/api/documents/resume (can a user fetch another user's resume/PII? check authz on the id/param)
  - app/api/conversations/[id], app/api/messages, app/api/candidate/messages (conversation membership enforced?)
  - app/api/jobs/edit, app/api/jobs/update, app/jobs/edit/[token] (edit-token entropy/guessability, server-side validation)
  - app/api/admin/** and app/admin/** (is admin role enforced server-side on every route, or only hidden in UI?)
  - app/api/cron/** (is CRON_SECRET verified on EVERY cron route? any route missing the check is publicly triggerable)
  - app/api/auth/extension-token, app/api/auth/delete-account, app/api/auth/restore-account
Check: does authorization rely solely on Supabase RLS, or on app-level checks? Are there routes that trust a client-supplied userId/email instead of the session? Service-role key (bypasses RLS) used in any path reachable by unauthenticated input?`,
  },
  {
    key: 'security-injection', agentType: 'security-reviewer',
    prompt: `You are auditing INJECTION / SSRF / SECRETS / UNTRUSTED-INPUT on this Next.js job board.
Investigate:
  - Raw SQL: grep for $queryRaw/$executeRaw/queryRawUnsafe and pg pool .query with string interpolation — any user input concatenated into SQL?
  - SSRF: the ingestion/enrichment/health-check code fetches arbitrary employer/source URLs (lib/aggregators/**, lib/health/**, app/api/cron/check-dead-links, resume/url parsing). Can a user cause server-side fetch of an attacker URL (internal metadata endpoints)? Logo/url upload (app/api/upload/**).
  - File upload: resume parsing (app/api/resume/parse, app/api/profile/resume, mammoth/pdf-parse), company-logo, message-attachment — type/size/content validation, path traversal, storage ACLs.
  - Webhooks: app/api/webhooks/stripe and app/api/webhooks/resend — signature verification correct and mandatory? raw-body handling correct?
  - XSS: job descriptions are HTML (react-quill / sanitize-html). Is sanitize-html applied on render AND on write? dangerouslySetInnerHTML usages — sanitized? blog content?
  - Secrets: grep NEXT_PUBLIC_ for anything sensitive shipped to the client; any service-role key / API key referenced in client components; hardcoded secrets.
  - Prompt injection: app/api/autofill/**, app/api/employer/ai-jd, AI cover-letter/answer generation — untrusted JD/resume text into LLM prompts that then take actions or leak.
  - Rate limiting: which mutating/expensive endpoints have NO rateLimit() (auth, contact, apply, AI, upload, search)?`,
  },
  {
    key: 'silent-failures', agentType: 'silent-failure-hunter',
    prompt: `Hunt SILENT FAILURES, swallowed errors, and dangerous fallbacks across lib/** and app/api/**.
Look for: empty catch blocks, catch(() => {}) / .catch(() => null) that hide errors, try/catch that returns a success-looking default on failure, fire-and-forget promises (no await, unhandled rejection) for emails/indexing/webhooks, fallbacks that make a broken feature look like it worked (the env.example warns: indexing crons "return 200 OK with zero submissions" when keys missing — verify), JSON.parse without try, missing null checks that throw, Number()/parseInt producing NaN silently.
Especially trace WHY these prod facts happen (root cause in code): job_embeddings never written to prod; candidate_recommendations never produced; gsc_snapshots never populated; most crons never record a CronRun. Find the code paths that should populate them and the silent-failure/guard that skips them.`,
  },
  {
    key: 'seo-technical', agentType: 'seo-specialist',
    prompt: `Technical SEO audit. Investigate app/robots.ts, app/sitemap.ts, app/api/sitemaps/**, app/feed.xml, image/video sitemaps, components/seo/**, components/JobStructuredData.tsx, BreadcrumbSchema, and generateMetadata across app/**/page.tsx.
Confirm and locate root cause for the observed runtime issues:
  - SOFT-404: app/jobs/[slug]/page.tsx returns 200 for nonexistent slugs instead of calling notFound(). Find the not-found rendering path and the missing notFound()/status. (gsc_snapshots schema even has a soft_404 column.)
  - Missing canonical on /jobs/city and /jobs/state hub pages and /do-not-sell, /data-request.
  - robots.ts AUTH_REBLOCK_DATE='2026-05-19' has passed (today 2026-05-31) but /login,/signup,/messages,/saved,/job-alerts/manage,/employer/login are still NOT in FULL_DISALLOW — tests/seo/sitemap-budget.test.ts already FAILS on this. Confirm and assess index-bloat risk.
Also check: JobPosting structured data validity (required fields: title, datePosted, validThrough, hiringOrganization, jobLocation, baseSalary), duplicate/missing canonicals across the category x state x city pSEO matrix, sitemap size/budget limits and whether 36k unpublished jobs leak into sitemaps, noindex on thin pages, hreflang, trailing-slash/redirect consistency.`,
  },
  {
    key: 'pseo-content', agentType: 'general-purpose',
    prompt: `Deep-dive the programmatic-SEO (pSEO) system for THIN/DUPLICATE CONTENT and gating correctness. Investigate lib/pseo/** (aggregator, city-data, state config, narratives, category-faq-data, snippets), app/jobs/**/page.tsx (category, [state], city/[slug], metro), and middleware.ts taxonomy allowlists + 410 logic.
Key questions:
  - There are ~28 categories x 51 states x hundreds of cities = thousands of generated URLs. PROD shows 666 of 787 city+state combos have <3 published jobs. What is the MIN_JOBS gate (memory says 3) and is it ENFORCED before a page is served/indexed, or do thin/empty city/category pages still render 200 + appear in sitemaps? Trace the exact gating.
  - Content uniqueness: are category/state/city narratives templated with token substitution such that pages are near-duplicates (Google thin-content/doorway risk)? Look at CitySnippet/CategoryCitySnippet usage and how much is AI-generated vs boilerplate.
  - Middleware allowlists (STATE_ELIGIBLE_TAXONOMIES / CITY_ELIGIBLE_TAXONOMIES) vs the actual app/jobs directory routes — any mismatch where a real route 410s, or an invalid combo renders 200?
  - Internal linking & crawl budget across the matrix.`,
  },
  {
    key: 'db-prisma', agentType: 'database-reviewer',
    prompt: `Database & data-layer audit. Investigate prisma/schema.prisma, the Prisma client setup (grep for new PrismaClient / @prisma/adapter-pg / pg Pool), query patterns across lib/** and app/api/**.
Focus:
  - Indexes: hot query paths (jobs listing filters by is_published + original_posted_at + state_code + category_tags + is_remote; search; sitemaps over 36k rows). Are there @@index/@@unique covering these, or seq scans at 36k rows?
  - N+1 patterns (loops issuing per-row queries; missing include/select; per-job company/health lookups).
  - Connection management with pgbouncer transaction pooler (port 6543) + Prisma 7 adapter-pg — prepared-statement/pooler pitfalls, connection exhaustion, missing pool limits in serverless.
  - The embeddings pipeline: lib/ai/** + scripts/backfill-embeddings.ts — what writes job_embeddings, is it ever invoked by a prod cron, and why is the table empty? Same for candidate_recommendations.
  - 34,964 unpublished job rows retained — bloat, and do listing/sitemap queries correctly filter them out everywhere?
  - Unbounded queries / missing pagination/LIMIT. Transaction correctness for multi-write ops (apply, checkout, dedup upsert).`,
  },
  {
    key: 'tests-quality', agentType: 'pr-test-analyzer',
    prompt: `Audit TEST COVERAGE and quality. Investigate tests/** (vitest unit + tests/e2e Playwright), vitest.config.ts, playwright.config.ts, and compare against the ~160 app/api routes and critical flows.
Assess:
  - The suite currently has a FAILING test: tests/seo/sitemap-budget.test.ts (AUTH_REBLOCK_DATE passed). Confirm and find any other currently-failing or skipped tests (.skip/.todo/xit). Is there CI that gates on tests (.github/workflows)? If a known test fails, is CI red or are tests not gating deploys?
  - Critical-path coverage gaps: payment/Stripe webhook idempotency, auth/authorization (IDOR), the apply flow, job ingestion dedup, rate limiting, the soft-404/notFound behavior, hydration. Which high-risk areas have ZERO tests?
  - Test quality: assertions that can't fail, over-mocking that tests mocks not behavior, snapshot-only tests, e2e that don't assert. The many mobile-audit specs — are they real regression guards or throwaway?
  - Is the claimed 80% coverage real? Check coverage config and whether it's enforced.`,
  },
  {
    key: 'payments-stripe', agentType: 'general-purpose',
    prompt: `Audit the PAYMENTS / monetization flow (Stripe). Investigate app/api/create-checkout, app/api/create-renewal-checkout, app/api/verify-checkout-session, app/api/verify-renewal-session, app/api/webhooks/stripe, app/api/employer/billing, app/api/employer/invoice, app/api/employer/receipt, app/api/jobs/post-free, app/api/employer/free-quota-status, lib billing/pricing/tier-limits, and the ENABLE_PAID_POSTING flag.
Key questions:
  - PROD has 0 job_charges and 0 processed_stripe_events ever. Is paid posting actually reachable/enabled in prod (ENABLE_PAID_POSTING), or is the whole checkout path dead code? Trace post-job -> checkout -> webhook -> job publish. Where does it break or get bypassed (everyone gets 'free'/'pro')?
  - Webhook idempotency: is ProcessedStripeEvent used to dedupe? Signature verification mandatory? Does a failed/duplicate webhook double-publish or mis-grant entitlement?
  - Free-quota logic (quota_domain): can it be gamed (multiple free posts via email/domain variation)? Is the quota enforced server-side?
  - Money correctness: amounts/currency, tax, refund/cancel handling, renewal expiry, race between checkout-success redirect and webhook.`,
  },
  {
    key: 'email-cron', agentType: 'general-purpose',
    prompt: `Audit the EMAIL + CRON/background-job pipeline. Investigate app/api/cron/** (all ~40), vercel.json crons, lib/cron/**, lib/inngest/** , lib/email-service.ts, app/api/webhooks/resend, app/api/email/**, unsubscribe/suppression, lib/search-indexing.ts.
Key questions (root-cause the dormancy):
  - vercel.json defines many crons but only 4 names ever recorded a CronRun in prod (ingest, enrich-jobs, ingest-wave-summary, freshness-decay). For each of: gsc-health-check, index-pseo, index-urls, deindex-expired, candidate-alerts, send-alerts, push-notifications, saved-job-reminder, daily-report, employer-report, social-post, instagram-post, purge-inactive-users, cleanup-* — is it (a) registered in vercel.json, (b) actually doing work or guarded-out (missing env key -> early return 200), (c) recording a CronRun? Find which are silently no-ops in prod.
  - gsc_snapshots empty -> gsc-health-check not persisting. job_embeddings empty -> embedding backfill cron missing/disabled. candidate_recommendations empty -> recommendation cron not running. Pin the exact reason in code.
  - Email: deliverability config (SPF/DKIM senders), suppression on bounce/complaint via Resend webhook, unsubscribe/CAN-SPAM compliance (one-click, honored), the sent-vs-delivered tracking gap, idempotency of alert sends (double-send risk), PII in logs.`,
  },
  {
    key: 'code-quality', agentType: 'typescript-reviewer',
    prompt: `Audit CODE QUALITY / MAINTAINABILITY / TYPE-SAFETY.
Investigate the worst offenders: middleware.ts (967 lines — far over the 800 cap; assess cohesion, duplication, the 21 near-identical robots rule blocks, the inline styled-410 HTML), and find other oversized files (grep for files > 600 lines under app/lib/components).
Check: TypeScript escape hatches (grep ': any', '@ts-ignore', '@ts-expect-error', 'as any', non-null '!' overuse, 'eslint-disable'), 'console.log' left in production code, dead/duplicate code, copy-paste drift across the 28 pSEO category page.tsx files and the many cron routes, inconsistent error envelopes across API routes, and tsconfig strictness (is strict on?). Quantify (counts) where useful.`,
  },
  {
    key: 'accessibility', agentType: 'a11y-architect',
    prompt: `Accessibility audit (WCAG 2.2). Runtime crawl found /post-job has H1 count = 0 and several pages have hydration errors. Investigate components/** and app/**/page.tsx.
Check: heading hierarchy (single h1, logical order), form labels (login/signup/post-job/apply/contact/job-alerts forms — are inputs labeled, errors announced?), button vs div/onClick, focus management in modals/drawers (MobileFilterDrawer, ExitIntentPopup, ShareModal, CookieConsent), keyboard operability, alt text on images (StateImage, company logos, hero), color-contrast tokens in tailwind.config/globals.css, aria on interactive widgets (FAQAccordion, tabs, custom selects, react-quill), skip-to-content link, reduced-motion handling for framer-motion, and the salary calculator/licensure checker widgets. Prioritize blockers that fail real keyboard/screen-reader users.`,
  },
  {
    key: 'performance', agentType: 'performance-optimizer',
    prompt: `Performance audit. Investigate next.config.ts, vercel.json (caching/s-maxage headers, function config), image usage (next/image vs raw img, dimensions, formats), the jobs listing + pSEO data fetching, and React rendering.
Check: the React #418 hydration errors on /jobs + pSEO listings — find the server/client mismatch root cause (relative-time/date/timezone formatting computed differently SSR vs client, Math.random, or non-deterministic ordering) and the perf cost (SSR discarded + re-render). Over-fetching at 36k rows without LIMIT/index; sitemap generation cost; client bundle bloat (framer-motion, react-quill, react-pdf, satori, openai all in deps — are heavy libs dynamically imported or shipped to every page?); missing ISR/revalidate on pSEO pages causing per-request DB hits; N+1 in listing; unbounded 'use client' trees; LCP image not prioritized. Tie findings to Core Web Vitals.`,
  },
  {
    key: 'frontend-ux', agentType: 'general-purpose',
    prompt: `Audit FRONTEND CORRECTNESS / UX for real user-facing breakage. Investigate components/** and the key flows: apply (ApplyButton, InPlatformApplyForm), save job, job alerts/create-alert, search + filters (MobileFilterDrawer, semantic search bar on /jobs), post-job multi-step form, employer dashboard, messaging, settings/profile.
Key questions:
  - Root-cause the React #418 hydration mismatch on listing pages (likely a time/date/"posted X ago" rendered with client locale/timezone, or Date.now() during render). Find the component.
  - The /post-job page renders no H1 and fires a 401 — is the post-job form broken for logged-out users, or rendering an error/blank? Trace it.
  - Apply CTR in prod is ~0.25% (271 clicks / 108,976 views). Inspect the apply CTA / job card / job detail for friction or breakage (broken apply links, gated apply, confusing UX). 235 jobs show no salary, 508 thin descriptions — how does the JD page render missing data (empty sections, "undefined", broken layout)?
  - Empty/error/loading states (skeletons), broken images (0 company logos -> placeholder?), mobile layout (many mobile-audit tests exist — why? what was fragile?), form validation + error messaging, optimistic update rollback. Report concrete broken or confusing behaviors.`,
  },
  {
    key: 'privacy-legal', agentType: 'general-purpose',
    prompt: `Audit PRIVACY / LEGAL / COMPLIANCE for a site handling candidate PII (resumes, EEO data, licenses, work history) and email marketing.
Investigate: app/api/auth/delete-account + restore-account (true deletion vs soft-delete; does delete remove resumes/PII from storage + embeddings + email lists?), app/api/data-request + app/data-request (DSAR/GDPR/CCPA fulfillment — automated or stub?), app/do-not-sell + app/api/consent (CCPA "Do Not Sell"), CookieConsent + ConsentGatedTelemetry (is analytics actually gated on consent, or fired regardless?), app/api/profile/eeo + resume-parser EEO handling (EEO data segregated, voluntary, not used in matching/ranking?), DocumentAccessLog (is resume access actually logged + access-controlled?), lib PII scanners (tests/lib/ai/pii-scanner — is PII stripped before sending to OpenAI?), email unsubscribe/CAN-SPAM, data retention (34k old jobs, inactive-user purge cron — does it run?), privacy policy vs actual data flows (sub-processors: OpenAI, Supabase, Resend, Stripe, Upstash, Sentry, Vercel — all disclosed?). Flag anything that is a legal/regulatory exposure.`,
  },
]

function verifyPrompt(dim, found) {
  return `You are an adversarial verifier. A specialist produced findings for the "${dim.key}" dimension of a Next.js job board audit. Your job: independently CHECK each finding against the real code (use Grep/Read/Bash) and return a verdict. Default to skepticism — if you cannot confirm it in the code, mark 'refuted' or 'uncertain'. Correct any overstated severity or wrong file references. Confirm genuine issues with a crisp note.

FINDINGS TO VERIFY:
${JSON.stringify(found?.findings ?? [], null, 1)}

For every finding id, return a verdict (confirmed / partially-confirmed / refuted / uncertain), a corrected severity, and a one-line note citing what you found in the code.`
}

phase('Analyze')
const results = await pipeline(
  DIMS,
  (d) => agent(d.prompt + '\n' + RUNTIME + '\n' + OUTPUT_RULES, { label: `find:${d.key}`, phase: 'Analyze', schema: FINDINGS_SCHEMA, agentType: d.agentType }),
  (found, d) => found
    ? agent(verifyPrompt(d, found), { label: `verify:${d.key}`, phase: 'Verify', schema: VERIFY_SCHEMA })
        .then((v) => ({ dimension: d.key, summary: found.summary, findings: found.findings, verdicts: v?.verdicts ?? [] }))
        .catch(() => ({ dimension: d.key, summary: found.summary, findings: found.findings, verdicts: [] }))
    : { dimension: d.key, summary: 'finder failed', findings: [], verdicts: [] },
)

return results.filter(Boolean)
