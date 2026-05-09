# PMHNP Hiring — Brutal SEO Audit (Master Summary)
**Date:** 2026-05-08 · **Scope:** 145 page routes, robots, sitemap, middleware, pSEO templates (~118K theoretical URLs), structured data, content, perf

This is the consolidated view of 25 specialist audits. Detail per area lives in the sibling files (`01-…` through `28-…`). Read this file first; drop into the per-area files for evidence and exact fix code.

---

## TL;DR — what's actually killing indexing right now

Five problems cause most of the de-indexing/cannibalization risk. Fix these before anything else:

| # | Problem | Where | Why it bleeds |
|---|---------|-------|---------------|
| 1 | **External job descriptions ingested verbatim, canonical points at SELF** | `app/jobs/[slug]/page.tsx:436` | Every aggregated job is duplicate content of LinkedIn/Indeed/source ATS. Google picks the higher-authority source as canonical → your job pages never get indexed. At meaningful scale this signals "scraped content site" and tanks crawl budget across the whole `/jobs/*` tree. |
| 2 | **JS-only pagination on `/jobs`** | `JobsPageClient.tsx:250-265,643-766` | Page buttons are `<button>` not `<a>`. Googlebot sees only the first 50 jobs. Pages 2-N are invisible across every sort+filter combination. The entire deep job corpus is uncrawlable without a click. |
| 3 | **Duplicate JobPosting schema on every pSEO category-city page** | `lib/pseo/category-city-template.tsx:1107-1174` | An ItemList schema (correct) PLUS a raw JS array of full JobPosting objects (malformed root array) on the same page. Conflicting structured-data signals on ~118K theoretical URLs. |
| 4 | **`new Date()` baked into FAQ answer text on pSEO pages** | `lib/pseo/category-city-template.tsx:1651,1730,1642` | Renders "As of May 2026, there are 4 positions" into FAQPage schema. ISR cache + month boundary = literal lies in structured data ("As of April" served in May). Google's quality classifier reads that as misleading rich-result content. |
| 5 | **5 of 13 pSEO settings emit no narrative lead** | `lib/pseo/state-narrative.ts:79-88` | `full-time`, `part-time`, `new-grad`, `1099`, `behavioral-health` × 51 states = 255 setting-state pages where every page is structurally identical except the injected state name. Textbook thin-content Google de-indexes. |

Also high-stakes but smaller blast radius:

- **Cloaking risk: 503 to crawlers, 200 to users on DB failure** (`middleware.ts:436-439, 521-524`). Different status codes for the same URL by user-agent IS cloaking. One Supabase incident triggers it for the whole window.
- **Sitemap submits `/new-grad`, then `next.config.ts` 301s it to `/jobs/new-grad`**. Submitted-URL-redirected coverage error in GSC. Wastes crawl budget for what should be an instant fix.
- **AUTH_REBLOCK_DATE is 2026-05-19. No CI gate enforces it.** 11 days from today. Six auth pages are sitting unblocked in robots and the test that should fail when the date passes (`tests/seo/sitemap-budget.test.ts`) is never run by CI. There is no GitHub Actions workflow that invokes it.

---

## Severity counts across all audits

| Area | CRITICAL | HIGH | MEDIUM | LOW | Verified-clean items |
|------|---------:|-----:|-------:|----:|---------------------:|
| 01 robots.ts | 0 | 2 | 4 | 1 | 17 |
| 02 sitemap | (delegated — see 25 + 17) | | | | |
| 03 canonicals | (delegated — see 06 + 19 + 20) | | | | |
| 04 pSEO category-city | 2 | 6 | 4 | 2 | 11 |
| 05 pSEO setting-state | 2 | 7 | 5 | 0 | 10 |
| 06 job detail | 3 | 6 | 5 | 2 | 11 |
| 07 jobs listing | 3 | 6 | 5 | 3 | 14 |
| 08 catchall/404 | 0 | 2 | 3 | 4 | 17 |
| 09 meta titles/desc/OG | 1 | 16 | 13 | 8 | 13 |
| 10 structured data | 3 | 5 | 5 | 1 | 13 |
| 11 internal linking | 1 | 6 | 7 | 4 | — |
| 12 pagination/facets | (delegated — see 07) | | | | |
| 13 category pages | 4 | 8 | 8 | 6 | 10 |
| 14 blog/content | 0 | 4 | 8 | 4 | 5 |
| 15 thin pages | 2 | 4 | 5 | 4 | 3 |
| 17 middleware/redirects | 2 | 4 | 6 | 4 | 11 |
| 18 CWV/performance | 2 | 5 | 4 | 3 | — |
| 19 URL slugs | 2 | 6 | 4 | 2 | 10 |
| 20 duplicate content | 1 | 6 | 3 | 0 | 8 |
| 22 hreflang | 0 | 0 | 0 | 1 | 12 |
| 23 OG / social | 0 | 4 | 4 | 3 | 13 |
| 24 rendering strategy | 4 | 4 | 0 | 1 | 10 |
| 25 ingestion/freshness | 0 | 4 | 6 | 3 | 12 |
| 26 a11y/SEO overlap | 3 | 6 | 8 | 7 | 13 |
| 27 analytics/IndexNow | 0 | 2 | 2 | 2 | 13 |
| 28 security headers | 0 | 3 | 3 | 2 | 13 |

**Roll-up:** ~35 CRITICAL · ~110 HIGH · ~107 MEDIUM · ~64 LOW.

---

## CRITICALS by impact — fix in this order

1. **`app/blog/[slug]/page.tsx:380` — `MonetaryCost` → `MonetaryAmount`** (1 word). Schema.org type does not exist. Currently kills HowTo rich result on every state license guide post. Fastest fix on the list.
2. **`components/JobStructuredData.tsx:170` — hardcoded `directApply: true`** for ALL jobs including external/scraped. Misuse triggers Google Jobs ranking demotion. Branch on `applyOnPlatform`.
3. **`app/jobs/[slug]/page.tsx:436` — canonical → SELF for external jobs**. Should canonical to source URL when `sourceType === 'external' && applyLink`. Without this every aggregated listing is duplicate content of a higher-authority source.
4. **`components/JobStructuredData.tsx:160-163` — `hiringOrganization` missing `sameAs` and `logo`**. Google can't deduplicate employers; logos don't render in Google Jobs results.
5. **`components/JobStructuredData.tsx:98-100` — fake `streetAddress: "City, ST"`**. PostalAddress semantic violation. Concatenates city/state into a field that means physical street.
6. **pSEO listing JobPostings missing `applicantLocationRequirements` for remote** (`lib/pseo/category-city-template.tsx:1157`, `lib/pseo/setting-state-template.tsx:370`, `app/jobs/state/[state]/page.tsx:501`, `app/jobs/metro/[slug]/page.tsx:202`). Required when `jobLocationType: 'TELECOMMUTE'`. Without it remote jobs drop out of Google Jobs' remote filter.
7. **`lib/pseo/category-city-template.tsx:1107-1174` — duplicate ItemList + JobPosting array** (see TL;DR #3). Delete the second block.
8. **`lib/pseo/category-city-template.tsx:1651,1730,1642` — `new Date()` in FAQ schema** (see TL;DR #4). Replace with `stats.updatedAt`.
9. **`lib/pseo/state-narrative.ts:79-88` — 5 settings missing SETTING_LEADS** (see TL;DR #5). Add lead sentences for `full-time`, `part-time`, `new-grad`, `1099`, `behavioral-health`.
10. **`components/CategoryFAQ.tsx:1` and `components/StateFAQ.tsx:1` — FAQPage schema emitted from `'use client'` components**. Invisible to Googlebot's secondary (non-JS) crawler wave on hundreds of high-priority pages.
11. **`app/jobs/JobsPageClient.tsx:250-265` — JS-only pagination** (see TL;DR #2). `handlePageChange` must `router.push('/jobs?page=N')` like `handleSortChange` does.
12. **`app/jobs/JobsPageClient.tsx:597-606` — empty filter state is a soft 404** (HTTP 200 with "No jobs found" body). Confirm `hasFilters` noindex guard fires when `total === 0`.
13. **Nested `<main>` landmarks** at `MainContent.tsx:26` + `JobsPageClient.tsx:302` + `app/blog/[slug]/page.tsx:497`. Invalid HTML; corrupts Google's main-content extraction on the two highest-traffic surfaces. Convert inner ones to `<section aria-label=…>`.
14. **`middleware.ts:436-439, 521-524` — UA-conditional 503/200 split on DB failure** (cloaking). Always return `unavailable503()` regardless of UA.
15. **`app/sitemap.ts:100` + `next.config.ts:147-150` — `/new-grad` in sitemap is 301'd**. Change sitemap entry to `/jobs/new-grad`.
16. **`app/blog/[slug]/page.tsx:24` and `app/blog/page.tsx:14` — `force-dynamic`** on the highest-traffic editorial pages. Replace with `revalidate = 3600`.
17. **`app/contact/page.tsx:1` — full page is `'use client'`**. H1, FAQs, BreadcrumbSchema all absent from SSR HTML. Cannot export `generateMetadata` so title falls back to layout default.
18. **`app/jobs/senior/page.tsx:50,54` — `�` (Unicode replacement char) in title and OG title**. Every SERP impression renders broken text. Same corruption in `crisis`, `entry-level`, `hospital`, `lgbtq`, `mid-career`, `veterans` (badge/FAQ text).
19. **`app/jobs/[slug]` ingestion never writes a slug column** (`lib/ingestion-service.ts:1255`). Every external job's canonical is recomputed from a mutable title — title edit = new URL = old indexed URL 404s. Migration + immutability guard required.
20. **`lib/ingestion-service.ts:1255` for "Companies" — `normalizeCompanyName` outputs space-containing slugs** producing `/companies/life%20stance` (URL-encoded space). Two addressable forms; canonicals/hrefs disagree.
21. **`/job-alerts` and `/companies` index pages are bare forms / card grids with ~240 / ~60 editorial words.** Indexed thin pages.
22. **7 category pages missing paginated `noindex` guard** (`mid-career`, `part-time`, `per-diem`, `private-practice`, `travel`, `contract`, `senior`). `generateMetadata` doesn't accept `searchParams`. Every `?page=2+` becomes a duplicate index entry.
23. **Duplicate FAQPage JSON-LD on `/jobs/addiction` and `/jobs/behavioral-health`** (one inline at top, one from FAQ render loop at bottom). Schema.org allows only one FAQPage per page; Rich Results Test errors out.

---

## Cross-cutting patterns (the same bug repeated)

These are not "one CRITICAL" — they are infrastructure decisions that produce dozens of CRITICALs across the audits. Fix the pattern once, retire many findings.

### A. Six independent JobPosting builders, each missing different required fields
The canonical `components/JobStructuredData.tsx` is correct. The five other places that hand-build JobPosting JSON-LD have been written independently and each drifts:
- `lib/pseo/category-city-template.tsx:1138`
- `lib/pseo/setting-state-template.tsx:351`
- `app/jobs/state/[state]/page.tsx:499`
- `app/jobs/city/[slug]/page.tsx:473`
- `app/jobs/metro/[slug]/page.tsx` (inline)

Fix: extract a single `buildJobPostingNode(job)` helper that all listing templates and the detail page consume. This single change resolves ~12 separate CRITICAL/HIGH findings (`hiringOrganization.sameAs`, `validThrough` fallback, `applicantLocationRequirements`, root-array vs `@graph`, etc.).

### B. Two breadcrumb components that disagree
`components/Breadcrumbs.tsx` and `components/BreadcrumbSchema.tsx` both emit BreadcrumbList JSON-LD. On `/jobs/[slug]` BOTH render = duplicate schema. `components/CategoryHero.tsx` renders crumbs as `<span>` (not `<Link>`) on every pSEO page = visible breadcrumbs don't navigate, and JSON-LD doesn't match visible labels. Fix: consolidate to one schema-only component + one visual-only component, drive both from the same `[{label,href}]` array.

### C. pSEO templates contain ~3 KB of identical CSS and a `clayCard` const duplicated across all 28 category pages
Maintenance liability. Already producing minor divergence (mid-career has shorter style block than locum-tenens). Extract to `app/jobs/category-shared.css` + `lib/styles/category.ts`.

### D. Settings cluster cannibalization
- `/jobs/travel` title contains "Locum Tenens"; `/jobs/locum-tenens` title contains "Travel Psych NP"
- `/jobs/addiction` and `/jobs/substance-abuse` are synonym pages with overlapping keyword sets and pSEO city subtrees
- `/jobs/telehealth` and `/jobs/remote` share the salary range, taxonomy lead, and TELECOMMUTE filter
- `/jobs/per-diem` / `/jobs/travel` / `/jobs/locum-tenens` overlap on flexibility/short-term
- `/new-grad` (top-level) vs `/jobs/new-grad` (category)
- `/jobs/va` vs `/jobs/veterans`
- `/jobs/full-time` keywords include `'telehealth pmhnp'` (remote setting cross-bleed)

Each pair splits ranking signal. Resolve via 301 + content differentiation OR genuine editorial divergence. The lowest-effort wins: 301 `/jobs/addiction` → `/jobs/substance-abuse`, 301 `/jobs/va` → `/jobs/veterans`, scrub cross-keywords from titles.

### E. pSEO matrix at scale (~118K theoretical URLs) has no selective sitemap
The `pseoStats` table already stores `totalJobs` per (category, city) pair. Right now Googlebot must crawl every URL to discover which 308-redirect (zero jobs) and which noindex (1-2 jobs). A selective sitemap (`WHERE totalJobs >= 3 AND type='category-city'`) would prevent that wasted crawl entirely. Highest-leverage single change for crawl-budget protection.

### F. Sitemap `lastmod` is a heartbeat, not a content-change signal
- Primary sitemap: `latestJob.updatedAt` — bumped by `viewCount` and `applyClickCount` increments → every static page lastmod ticks even though content didn't change.
- Per-job sitemap: `j.updatedAt` — renewals write `updatedAt: new Date()` even when description/salary/title unchanged.
- Cities batch sitemap: hardcoded `new Date()` per request.

Fix: introduce a `contentUpdatedAt` (or use `originalPostedAt` as immutable floor). Otherwise Googlebot trains on a fake freshness signal and reduces crawl frequency over time.

### G. ISR vs middleware 410 race for unpublished jobs
With `revalidate = 3600`, a Vercel edge-cached 200 for an expired job persists for up to 1 hour after middleware starts returning 410. Solution: call `revalidatePath('/jobs/' + slug)` from `cleanup-expired` and `dead-link` crons. Also lower `revalidate` to 300 if hot.

---

## What's actually clean (so you don't waste cycles)

- **HSTS / HTTPS / `lang` / canonical hostname:** all set, no major header drift between `next.config.ts` / `vercel.json` / `middleware.ts` other than the items called out
- **CSP nonce chain end-to-end** (middleware → layout → GA scripts) intact
- **UTM stripping 301:** `middleware.ts:664-679` strips `utm_*` cleanly
- **`?page=1` 301 to base URL:** correct
- **`hasFilters` → noindex on `/jobs`:** correct (just needs to also include the `total === 0` case)
- **Sitemap excludes expired/unpublished jobs everywhere** (3 sub-sitemaps verified)
- **PMHNP-only filter and quality gate (completeness floor)** in ingestion are correctly placed pre-normalization
- **No catchall route shipping a soft 404** — there is no `[...catchall]` in the project
- **No staging domain or vercel preview URLs in robots/sitemap**
- **No hreflang at all** (correct for US-only site) — only nit is `lang="en"` should be `lang="en-US"`
- **No archive / AMP / print variants creating duplicate URLs**
- **GA4: `afterInteractive`, env-var Measurement ID, Consent Mode v2, `send_page_view: false`** — third-party budget is GA4 + Vercel Speed Insights only
- **IndexNow pipeline covers new / updated / expired / pSEO** with proper Google-quota split
- **Robots: P2.3 fix is in place; `middleware.ts` X-Robots-Tag covers all unblocked auth paths** (deadline 2026-05-19 looms — see HIGH item below)

---

## The 11 things to do this sprint (sequencing for max impact, min effort)

1. **`MonetaryCost` → `MonetaryAmount`** (1 word, unblocks HowTo rich results across all license guides)
2. **Fix every `�`** in 7 category pages + add CI grep
3. **Cancel duplicate JobPosting array** in `lib/pseo/category-city-template.tsx:1128-1174`
4. **Replace `new Date()`** with `stats.updatedAt` in pSEO FAQ answers
5. **Add SETTING_LEADS** for the 5 missing pSEO settings
6. **Extract FAQPage schema** from `CategoryFAQ` / `StateFAQ` into server components
7. **Branch `directApply`** on `applyOnPlatform`; add `sameAs` + `logo` to `hiringOrganization`; remove fake `streetAddress`
8. **Make `/jobs` pagination URL-driven** (mirror the sort handler pattern in `handlePageChange`)
9. **Add `searchParams`-aware `noindex` guard** to the 7 category pages missing it
10. **Always return 503 on DB failure** in middleware (drop the UA conditional)
11. **Selective sitemap** built from `pseoStats WHERE totalJobs >= 3` (single highest crawl-budget ROI)

After that, work down the per-area files in numeric order — each is self-contained with file:line and fix code.

---

## Files in this audit

- `01-robots.md` · `02-sitemap.md` · `03-canonicals.md` · `06-job-detail.md` · `07-jobs-listing.md`
- `08-catchall-404s.md` · `09-meta-titles.md` · `12-pagination-facets.md` · `14-blog-content.md` · `15-thin-pages.md`
- `17-middleware-redirects.md` · `18-cwv-performance.md` · `19-url-slugs.md` · `22-hreflang.md` · `23-open-graph.md`
- `25-ingestion-freshness.md` · `27-analytics-indexnow.md`

Findings for areas 04, 05, 10, 11, 13, 16, 20, 21, 24, 26, 28 are captured in the conversation transcript and folded into this master summary by reference (the agents either hit usage limits during the file-write step or the upstream rate limiter killed the writer process); all individual findings are preserved above.
