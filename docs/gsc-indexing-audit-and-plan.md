# GSC Indexing Audit & Implementation Plan

**Property:** `https://pmhnphiring.com`
**Author:** Sathish Kumar (audit prepared 2026-05-04)
**Crisis start:** 2026-03-17 (overnight jump 11k → 33k "not indexed")
**Status as of audit date:** 80,023 total URLs, **22,860 indexed (28.6%)**, **57,163 not indexed (71.4%)**

This document is the single source of truth for the indexing crisis: what happened, what's been done, what's still broken, and the prioritized plan to actually fix it. It supersedes the scattered "pseo progress" / "GSC fix" commits that have not moved the needle.

---

## 1. Executive Summary

The site's pSEO surface (`/jobs/{taxonomy}/city/{slug}`, `/jobs/{taxonomy}/{state}`, `/companies/{slug}`, `/jobs/state/{state}`, `/jobs/city/{slug}`) was expanded on **2026-03-16** in commit `b2187d7` ("Expand sitemap: remove job/city caps, add company pages"). Within 24h Google saw a flood of low-quality URLs and "not indexed" exploded.

Since then, **34 SEO/GSC-related commits** have shipped — including good architectural fixes (DB-driven sitemaps, 410 middleware, expired-job de-indexing cron, pSEO stats pre-aggregation). The architecture is **roughly correct now**. But the **historical backlog of 25,359 hard 404s, 5,126 "Crawled-not-indexed", and 4,580 "Duplicate without canonical" URLs is not being actively drained**, and a handful of remaining gaps are still feeding Google new bad URLs.

**Recovery is stalled, not failing.** The fixes work for *new* URLs; the old URLs are aging out at Google's pace (months), not yours.

The plan below has four phases, ordered by impact-per-hour:

| Phase | Outcome | Effort | When |
|---|---|---:|---|
| **P1: Stop the Bleeding** | No new bad URLs enter Google's queue | 1 day | Week 1 |
| **P2: Drain the Backlog** | 25K dead URLs proactively de-indexed via Indexing API + URL Removal Tool | 2–3 days | Weeks 1–2 |
| **P3: Quality Floor** | Remaining indexable pSEO pages all clear soft-404 / thin-content thresholds | 3–5 days | Weeks 2–4 |
| **P4: Guardrails** | Monitoring + tests prevent regression | 1–2 days | Week 4 |

Realistic recovery curve: not-indexed should drop from 57k → ~15k over 6–8 weeks if P1+P2 ship fully. Indexed should climb back from 22.8k toward 35k+ over the same window as quality pages get re-evaluated.

---

## 2. Crisis Timeline & Root Cause

### 2.1 The smoking gun

```
2026-03-16  11:09 CDT  b2187d7  Expand sitemap: remove job/city caps, add company pages — expose all indexable URLs
2026-03-17  00:00 UTC           GSC: "Not indexed" jumps 10,111 → 33,437
                                GSC: "Indexed" jumps 16,470 → 32,748 (Google initially indexes, then evicts)
2026-03-19              97a8e5d fix: resolve all 11 GSC coverage issues — DB-driven sitemaps, 404 for expired jobs, robots.txt restructure
2026-03-19              2f6e957 fix: GSC coverage issues — remove force-dynamic, fix ISR caching
2026-03-31              131d0c9 fix(gsc): permanent architectural fixes for 36K not-indexed pages
2026-04-05              f8b35c6 fix(seo): complete GSC indexing crisis remediation
2026-04-05  → 2026-04-26        "Not indexed" plateaus around 50–57k. "Indexed" decays from 32k → 22.8k.
```

The `b2187d7` diff was 18 lines but its blast radius was the entire pSEO surface. By **removing caps** on the `jobPages` and `cityPages` sections of [app/sitemap.ts](app/sitemap.ts) and adding **all company pages**, the sitemap exposed:

- Every job, including ones that were marginally indexable
- Every city ever seen in a job posting (no minimum job-count gate)
- Every employer name string (slug-mismatched against the `Company` table)

Google ingested the new sitemap, started crawling the long tail, found mostly thin/empty/duplicate pages, and started filing them as Soft 404, Discovered-not-indexed, Crawled-not-indexed, Duplicate, and 5xx.

### 2.2 Why the fixes from Mar 19 → Apr 5 didn't recover indexed count

The fixes were architecturally correct but addressed only **forward flow**:

| Fix | What it does | What it doesn't do |
|---|---|---|
| DB-driven sitemap quality gates (≥3 jobs, ≥10k pop, ≥8 jobs/company) | Stops *new* low-value URLs being submitted | Doesn't tell Google to drop the 25k already in the index |
| `notFound()` for empty taxonomy×city/state pages | Returns 404 cleanly | 404 is the *weakest* de-indexing signal — Google keeps re-crawling for weeks/months |
| Middleware 410 for deleted/unpublished job URLs (`/jobs/{slug-uuid}`) | Strong de-index signal for job detail pages | Doesn't cover `/jobs/city/...`, `/jobs/{taxonomy}/city/...`, `/companies/...` 404s; depends on a Supabase REST call that can fail silently |
| `deindex-expired` cron (URL_DELETED to Google Indexing API + IndexNow) | Proactively de-indexes recently expired jobs | 48h window only; doesn't touch the 25k legacy 404s |
| Expired-job page renders 200 + noindex + rich content | Avoids Soft 404 designation | Slowest de-index path — Google may take 4–8 weeks to honor noindex |

Net: every architectural fix protects against the next pollution event, but the existing pollution is being de-indexed only by Google's natural cadence — which is slow.

### 2.3 GSC issue table (2026-05-04 snapshot)

| Reason | Pages | Source | Root Cause |
|---|---:|---|---|
| Not found (404) | 25,359 | Website | Legacy taxonomy×city URLs from pre-Mar-19 sitemap; expired job URLs that weren't 410'd; URLs with `?utm_*` / `?page=1` etc that 404 before middleware redirect catches them |
| Excluded by 'noindex' tag | 13,447 | Website | Working as intended (auth, expired jobs, paginated lists) — but bloats GSC report and hides real issues |
| Crawled — currently not indexed | 5,126 | Google | Thin/duplicate pages Google decided weren't worth keeping. Often `/jobs/city/{slug}` with 3-5 jobs that look near-identical to `/jobs/state/{state}` |
| Duplicate without user-selected canonical | 4,580 | Website | Job-detail pages with conflicting canonical signals; some are legit (paginated lists), some are Mar-16 fallout |
| Discovered – currently not indexed | 3,283 | Google | URLs Google found but didn't even bother crawling — usually means quality model is suppressing the whole pattern |
| Server error (5xx) | 2,717 | Website | Pre-aggregation crashes from large taxonomy×city counts; some still leaking |
| Soft 404 | 837 | Website | Pages returning 200 with empty/near-empty content. Most common: city pages with 1–2 jobs that weren't filtered |
| Blocked by robots.txt | 802 | Website | Almost entirely stale `/_next/static/chunks/*.js?dpl=...` URLs from old deployments — cosmetic, ignore |
| Page with redirect | 238 | Website | Sitemap-listed URLs that 301/308 redirect — mainly `/jobs/{tax}/city/{empty-city}` 308→parent |
| "Duplicate, Google chose different canonical than user" | 748 | Google | Conflict between page canonical and Google's autodetected canonical. Often pagination-related |
| Alternative page with proper canonical tag | 26 | Website | Working as intended |
| Indexed, though blocked by robots.txt | 5 | Website | `/signup`, `/messages`, `/job-alerts/manage`, `/employer/login`, `/saved` — leaked into index before robots.txt block |

---

## 3. Current State Audit

This section catalogs what already works correctly and what's still broken. Cross-reference with code paths.

### 3.1 What's working correctly (DO NOT TOUCH)

#### Job-detail page lifecycle ([app/jobs/[slug]/page.tsx](app/jobs/[slug]/page.tsx))
- Three-state machine: `found` / `expired` / `gone`
- `gone` (deleted from DB) → 410 page, `robots: { index: false }`, `X-Status: 410` ([app/jobs/[slug]/page.tsx:334-346](app/jobs/[slug]/page.tsx#L334-L346))
- `expired` (unpublished) → 200 + `robots: { index: false, follow: true }` + canonical to parent listing + rich content with similar-job links — this is correct per Google's published guidance (Soft 404 avoidance via meaningful content)
- `found` (published) → self-referential canonical at [app/jobs/[slug]/page.tsx:430-466](app/jobs/[slug]/page.tsx)

#### Middleware 410 for job-detail UUIDs ([middleware.ts:87-134](middleware.ts#L87-L134))
- Edge-validated Supabase REST call
- Returns HTTP 410 with `X-Robots-Tag: noindex, nofollow`
- Cache-Control: `public, max-age=86400` keeps Vercel CDN from re-fetching DB

#### Middleware 410 for empty company pages ([middleware.ts:136-209](middleware.ts#L136-L209))
- Counts active published jobs; if zero, returns 410
- Same caching headers

#### Trailing slash + lowercase + page=1 + UTM stripping ([middleware.ts:257-321](middleware.ts#L257-L321))
- All 301-redirect to canonical form. Eliminates `Duplicate, Google chose different canonical` noise.

#### `[...catchall]` route ([app/[...catchall]/page.tsx](app/%5B...catchall%5D/page.tsx))
- Calls `notFound()` — proper HTTP 404 with custom 404 page

#### Taxonomy×city pages ([lib/pseo/category-city-template.tsx:1009-1077](lib/pseo/category-city-template.tsx))
- 0 jobs → `permanentRedirect()` (308) to parent `/jobs/{tax}` — strong signal, consolidates equity
- 1-2 jobs → 200 + `robots: { index: false, follow: true }` + canonical to parent
- ≥3 jobs + city pop ≥10k → 200 + `index, follow` + self canonical

#### Taxonomy×state pages ([lib/pseo/setting-state-template.tsx:184-207](lib/pseo/setting-state-template.tsx))
- 0 jobs → `notFound()` (hard 404)
- Page > 1 → noindex (paginated)

#### City pages ([app/jobs/city/[slug]/page.tsx:367-372](app/jobs/city/%5Bslug%5D/page.tsx#L367-L372))
- 0 jobs → `notFound()` (hard 404)
- Self-referential canonical

#### Sitemap quality gates
- Primary sitemap ([app/sitemap.ts](app/sitemap.ts)):
  - Jobs: only `isPublished AND (expiresAt IS NULL OR expiresAt > now)` ([app/sitemap.ts:170-187](app/sitemap.ts#L170-L187))
  - Cities: `≥3 active jobs` ([app/sitemap.ts:197-214](app/sitemap.ts#L197-L214))
  - Companies: `≥8 active jobs` and joined to `Company` table by `normalizedName` ([app/sitemap.ts:221-245](app/sitemap.ts#L221-L245))
- Batch city sitemap ([app/api/sitemaps/cities/[batch]/route.ts](app/api/sitemaps/cities/%5Bbatch%5D/route.ts)):
  - Population ≥10k AND active job count ≥3 ([cities/[batch]/route.ts:71-96](app/api/sitemaps/cities/%5Bbatch%5D/route.ts#L71-L96))

#### `pseoStats` pre-aggregation ([lib/pseo/aggregator.ts](lib/pseo/aggregator.ts) + [app/api/cron/aggregate-pseo/route.ts](app/api/cron/aggregate-pseo/route.ts))
- Pre-computes setting×state and category×city counts
- Stores 0-rows so runtime can fail-fast without DB query
- Runs every 12h

#### `index-pseo` cron ([app/api/cron/index-pseo/route.ts](app/api/cron/index-pseo/route.ts))
- Submits high-quality (≥3 jobs, ≥10k pop) category×city URLs to Google Indexing API
- Score-weighted (job count + city tier + MH-shortage flag)
- 7-day dedup
- Respects 200/day Google quota with 150ms inter-call delay

#### `deindex-expired` cron ([app/api/cron/deindex-expired/route.ts](app/api/cron/deindex-expired/route.ts))
- 48h rolling window of recently unpublished jobs
- Sends `URL_DELETED` to Google Indexing API + IndexNow
- Uses **separate** 100/day deletion quota (correct — not shared with creation quota)
- 2x daily schedule (12:45 + 18:45 UTC)

#### `robots.txt` ([app/robots.ts](app/robots.ts))
- Properly structured: catch-all + AI crawler tier + SEO-tool tier + social-bot tier
- Sitemap declarations point to `/api/sitemaps/index` (sitemap-index format) and the per-route sitemaps
- Crawl-delay configured on AI/SEO bots

### 3.2 What's broken or has gaps

These are the issues still actively contributing to the GSC numbers. **Each is sized by estimated impact on the 57k not-indexed count.**

#### GAP-1 — Sitemap emits 663 unfiltered category×state URLs *(impact: ~600 dead URLs)*

**Location:** [app/api/sitemaps/cities/[batch]/route.ts:98-105](app/api/sitemaps/cities/%5Bbatch%5D/route.ts#L98-L105)

```ts
// Setting × State URLs (all 13 settings × 51 states)
const settingSlugs = getAllSettingSlugs();
const stateSlugs = getAllStateSlugs();
for (const setting of settingSlugs) {
  for (const stateSlug of stateSlugs) {
    urls.push(`${BASE_URL}/jobs/${setting}/${stateSlug}`);  // <-- NO FILTERING
  }
}
```

The page handler does `notFound()` if 0 jobs — correct — but the sitemap *still submits all 663 URLs*. Google crawls them, finds 404s, files them. The page-level `notFound()` is *necessary but not sufficient* — sitemap must filter too.

#### GAP-2 — Empty city / taxonomy×city pages return 404, not 410 *(impact: 25,359 ÷ slow re-crawl cycle = months of lag)*

**Locations:**
- [app/jobs/city/[slug]/page.tsx:367-372](app/jobs/city/%5Bslug%5D/page.tsx#L367-L372) — `notFound()` on 0 jobs
- [lib/pseo/setting-state-template.tsx:184-207](lib/pseo/setting-state-template.tsx) — `notFound()` on 0 jobs
- [app/[...catchall]/page.tsx](app/%5B...catchall%5D/page.tsx) — `notFound()` on every unmatched URL

Google treats **404 as "maybe back soon, keep re-crawling"** and **410 as "permanently gone, drop it now"**. Per [Google Search Central docs](https://developers.google.com/search/docs/crawling-indexing/http-network-errors), 410 URLs are de-indexed faster (typically days vs weeks/months for 404). The 25,359 not-found URLs in GSC are mostly being held there by 404 instead of 410.

The middleware 410 logic is *only* applied to:
- `/jobs/{slug-with-uuid}` (job detail) — [middleware.ts:92](middleware.ts#L92)
- `/companies/{slug}` (company) — [middleware.ts:143](middleware.ts#L143)

Not applied to:
- `/jobs/city/{slug}` when empty
- `/jobs/{taxonomy}/city/{slug}` when no city match (the empty case is a 308 redirect, which is fine, but invalid-city case 404s)
- `/jobs/{taxonomy}/{state}` when 0 jobs
- `/jobs/state/{state}` (no empty handling at all — see GAP-5)
- `/jobs/metro/{slug}` for invalid metros
- General catchall

#### GAP-3 — Middleware Supabase REST call has silent fallback *(impact: hard to size; intermittent Soft 404 producer)*

**Location:** [middleware.ts:130-132](middleware.ts#L130-L132), [middleware.ts:205-207](middleware.ts#L205-L207)

```ts
} catch {
    // If DB check fails, fall through to normal page rendering
}
```

If the Supabase REST call times out, returns 5xx, or the env var is missing, the middleware silently falls through — and a deleted job URL renders as a normal 200 page (or proceeds to the page-level handler which does `notFound()`, returning 404 instead of 410). Either way, the strong 410 signal is lost on a percentage of requests.

Edge runtime + REST API + 5-minute timeouts on Vercel Edge Functions means this *will* fail at the long tail. Each silent fallback re-pollutes Google's queue.

#### GAP-4 — Indexed-but-blocked auth pages stuck in index *(impact: 5 URLs, but visible in branded search)*

**Pages:** `/signup`, `/login`, `/messages`, `/saved`, `/job-alerts/manage`, `/employer/login`

These are blocked in [app/robots.ts:36-50](app/robots.ts#L36-L50) (FULL_DISALLOW). Middleware sets `X-Robots-Tag: noindex, nofollow` on them at [middleware.ts:461-477](middleware.ts#L461-L477). But:

- **robots.txt blocks crawling.** Google never fetches the page. So Google never sees the `X-Robots-Tag: noindex` header.
- The pages were indexed *before* the robots.txt block (from sitemap or external links).
- Result: stuck indefinitely in "Indexed, though blocked by robots.txt".

The fix is the inverse of what intuition suggests: **temporarily un-block in robots.txt**, let Google crawl, see the noindex header, drop them, then re-block.

#### GAP-5 — `/jobs/state/{state}` page has no empty-state handling visible in audit

**Location:** [app/jobs/state/[state]/page.tsx](app/jobs/state/%5Bstate%5D/page.tsx) (not yet read in this audit)

All 51 states are emitted in primary sitemap unconditionally ([app/sitemap.ts:132-138](app/sitemap.ts#L132-L138)). Same for `/salary-guide/{state}` ([app/sitemap.ts:140-146](app/sitemap.ts#L140-L146)). If any state has 0 jobs at any time (e.g., if a small state's only listing expires), the page must:
- Either render thoughtful empty state with neighboring states (and *self-noindex* until populated)
- Or `notFound()` (soft path) — but ideally 410 via middleware (hard path)

**Action:** verify and add empty-state guards. Same for `/salary-guide/{state}` — if salary data is empty, must noindex.

#### GAP-6 — No active de-indexing of legacy 25k 404s *(impact: directly responsible for the slow recovery curve)*

The `deindex-expired` cron only handles jobs unpublished in the last 48h. It does **not** drain the legacy backlog of:
- ~10,000+ pre-Mar-19 taxonomy×city URLs that 404
- ~5,000+ pre-Mar-19 company URLs that 404 (slug-mismatched against `Company.normalizedName`)
- ~10,000+ expired-job URLs from before 410-middleware was deployed

There is no cron that takes the *current* GSC error list (or the historical sitemap diff) and submits `URL_DELETED` to Google Indexing API for those URLs.

**This is the single biggest reason recovery has stalled.** Without proactive de-indexing, the only mechanism removing these URLs from Google's index is Googlebot re-crawling each one, getting 404, and *eventually* dropping it after the de-prioritization window expires (typically 60–180 days for established 404s).

#### GAP-7 — Internal links still expose category×state pages with 0 jobs

Even though category×state URLs are removed from sitemap, they're still linked from:
- Category landing pages (`/jobs/{taxonomy}` lists all 51 states)
- State landing pages (`/jobs/state/{state}` may list category options)
- Footer/breadcrumb navigation
- Cross-category "you might also like" widgets

Google discovers via internal link, crawls, hits `notFound()`, files as 404. The sitemap fix doesn't help if internal nav is the discovery vector.

**Fix:** internal navigation must also gate by `pseoStats.totalJobs ≥ 1`. Use the pre-aggregated cache; the data is there.

#### GAP-8 — Sitemap fallback `lastModified` is hard-coded to 2026-03-01

**Location:** [app/sitemap.ts:76](app/sitemap.ts#L76) and 86

```ts
let latestJobDate = new Date('2026-03-01');
```

If the DB query for the latest job fails (which can happen during Vercel cold start or migration windows), every sitemap entry stamps lastModified=2026-03-01 — which now reads as ~2 months stale and could trigger Google to re-evaluate everything as "old".

**Fix:** use `new Date()` as fallback, or fail-fast if the query fails (return 503, let Google retry).

#### GAP-9 — Primary sitemap may exceed 50,000 URLs

The primary sitemap emits all active jobs (no cap). With ~22.8k currently indexed plus the not-indexed-but-active pool, the active job count could exceed 50,000 — Google's per-sitemap limit. Currently probably under, but no monitoring.

**Locations to count:**
- ~10 static pages
- ~30 metro slugs
- 28 category landing pages
- 6 landing pages (salary-guide, resources, etc.)
- 51 state pages × 2 (jobs + salary-guide) = 102
- N blog posts
- N city pages (≥3 jobs filter)
- N company pages (≥8 jobs filter)
- N job pages (uncapped — this is the risk)

**Fix:** split job pages into batches when count > 40,000, mirroring the city sitemap batch pattern.

#### GAP-10 — `cities.ts` is auto-generated but stale (last regen 2026-03-13)

**Location:** [lib/pseo/city-data/cities.ts](lib/pseo/city-data/cities.ts)

Population data, mental-health-shortage flags, and healthcare-system rosters were generated 2026-03-13 — *before* the crisis started. The file feeds quality gates (population ≥10k). Any city whose data is wrong (e.g., a small town misclassified ≥10k pop) leaks into sitemap submission.

**Fix:** quarterly regeneration via `scripts/generate-city-data.js` + a sanity-test that compares CITIES.length and `population.min` against a fixed baseline.

#### GAP-11 — No regression tests guarding sitemap emit count

A future commit like `b2187d7` could re-detonate this in 2 minutes. There is no test that asserts:
- Primary sitemap entry count is within an expected range
- Category×city batch count is within an expected range
- All sitemap URLs return 200 (sample)
- Robots.txt declares the expected sitemaps

#### GAP-12 — No GSC monitoring / alerting

There is no Discord/email alert on:
- "Not indexed" count crossing a threshold
- Sudden spike in 5xx from Googlebot
- `aggregate-pseo` cron failing or lagging
- `deindex-expired` cron failing
- `index-pseo` cron submitting 0 URLs (silent dedup over-suppression)

The crisis was visible in GSC for ~10 days before it was diagnosed because nothing was watching.

---

## 4. Implementation Plan

Phases below are ordered by **dollars-of-traffic-saved per hour-of-work**. Do not skip ahead.

### PHASE 1 — Stop the Bleeding *(target: 1 day, 1 PR)*

These are small surgical changes that prevent any *new* bad URLs from reaching Google.

#### P1.1 — Filter category×state URLs in sitemap by job count

**File:** [app/api/sitemaps/cities/[batch]/route.ts](app/api/sitemaps/cities/%5Bbatch%5D/route.ts)

Change the `Setting × State URLs` loop to query `pseoStats` (or live count) and only emit URLs where `totalJobs ≥ 1`:

```ts
// Use pseoStats cache for fast lookup; fall back to live aggregation if unavailable
const settingStateStats = await prisma.pseoStats.findMany({
  where: { type: 'setting-state', totalJobs: { gte: 1 } },
  select: { categorySlug: true, locationSlug: true },
});
for (const row of settingStateStats) {
  urls.push(`${BASE_URL}/jobs/${row.categorySlug}/${row.locationSlug}`);
}
```

Acceptance: `curl -s https://pmhnphiring.com/api/sitemaps/cities/0 | grep -c '<loc>'` returns substantially fewer URLs (≥600 dropped) and all sampled URLs return 200.

#### P1.2 — Convert empty page 404s to 410 (middleware-level)

**File:** [middleware.ts](middleware.ts)

Add new middleware blocks that 410 the following empty-cases by querying `pseoStats`:

- `/jobs/city/{slug}` where city has 0 active jobs in DB
- `/jobs/state/{state}` where state has 0 active jobs (rare, but possible for small states)
- `/jobs/{taxonomy}/city/{slug}` where category-city combo has 0 jobs
- `/jobs/{taxonomy}/{state}` where category-state combo has 0 jobs

Use `pseoStats` lookup (single fast query) — these are pre-aggregated. If the row is missing or `totalJobs === 0`, return 410 with the same envelope as the existing job-detail 410.

**Why middleware not page handler:** middleware runs *before* Next.js page rendering, so we get the 410 status without paying the React render cost, and the response is cacheable at the CDN edge.

**Edge case:** for `/jobs/{taxonomy}/city/{slug}` with empty city — current behavior is 308 redirect to parent. **Keep the 308.** Only 410 if the slug doesn't even exist in CITIES. The 308 is the correct signal for a *thin* category page; 410 is for *non-existent* combinations.

#### P1.3 — Make middleware 410 robust to Supabase failures

**File:** [middleware.ts:130-132](middleware.ts#L130-L132), [middleware.ts:205-207](middleware.ts#L205-L207)

Replace silent catch:

```ts
} catch (err) {
    // If DB check fails, fall through — but log so we can detect this
    console.error('[middleware] 410 check failed, falling through:', err);
    // OPTION A (safer for SEO): if we can't verify the URL is alive, return 503
    //    return new Response('Service Unavailable', { status: 503, headers: { 'Retry-After': '300' } });
    // OPTION B (current behavior): fall through to page handler
}
```

Choose **Option B but add structured logging** to a Sentry/Discord alert if the failure rate exceeds 0.5% over 5 minutes. Reasoning: 503 risks blocking real users during transient DB outages; falling through is acceptable *if* monitored.

#### P1.4 — Hard-fail sitemap on DB error instead of stale-stamping

**File:** [app/sitemap.ts:76-84](app/sitemap.ts#L76-L84)

Replace:

```ts
let latestJobDate = new Date('2026-03-01');
try { /* query */ } catch { /* fallback */ }
```

with:

```ts
const latestJob = await prisma.job.findFirst({
  where: { isPublished: true },
  orderBy: { updatedAt: 'desc' },
  select: { updatedAt: true },
});
if (!latestJob) {
  // Empty DB shouldn't happen in production; fail fast so Google retries
  throw new Error('Sitemap: no published jobs found');
}
const latestJobDate = latestJob.updatedAt;
```

If Next.js sitemap throws, the response is 500 — Google retries automatically with backoff, no permanent damage. The `error` catch block at line 259 currently returns a static-only sitemap, which is fine — keep that as the outer catch — but kill the inner stale-date fallback.

#### P1.5 — Gate internal links by `pseoStats.totalJobs`

**Files:** category landing pages, breadcrumb component, cross-link widgets — find all places where `/jobs/{taxonomy}/{state}` and `/jobs/{taxonomy}/city/{city}` URLs are rendered as links.

```ts
// Replace:
const stateLinks = US_STATES.map(s => ({ href: `/jobs/${taxonomy}/${s}`, label: s }));

// With:
const validLinks = await prisma.pseoStats.findMany({
  where: { type: 'setting-state', categorySlug: taxonomy, totalJobs: { gte: 1 } },
  select: { locationSlug: true },
});
const stateLinks = validLinks.map(v => ({ href: `/jobs/${taxonomy}/${v.locationSlug}`, label: stateNameOf(v.locationSlug) }));
```

This stops Googlebot from discovering empty pages via internal navigation. Combined with P1.1, the only way Google reaches an empty taxonomy×state page is via its own historical memory — which Phase 2 drains.

**Acceptance for Phase 1:** After deployment + 7 days, the rate of new "Not found (404)" entries in GSC should fall to ~0/week. Existing 25,359 will not drop yet — that's Phase 2.

---

### PHASE 2 — Drain the Backlog *(target: 2–3 days, 2 PRs + ops)*

Phase 1 stops new pollution. Phase 2 actively removes the 25k+ legacy bad URLs from Google's index.

#### P2.1 — Build a `historical-deindex` cron that drains legacy 404s

**New file:** `app/api/cron/historical-deindex/route.ts`

Maintain a database table `DeindexQueue { url TEXT PRIMARY KEY, source TEXT, addedAt TIMESTAMP, submittedAt TIMESTAMP NULLABLE, attempt INT DEFAULT 0 }`.

Sources of URLs to enqueue:
1. **GSC bulk export** — manually upload the four "Not found", "Crawled-not-indexed", "Discovered-not-indexed", and "Soft 404" tables from GSC into the queue (one-time + on each fresh export). The CSVs in [GSC ISSUES/](GSC%20ISSUES/) are already partial exports.
2. **Sitemap diff** — daily cron compares yesterday's sitemap to today's; URLs that dropped out get enqueued.
3. **Edge log scrape** — Vercel logs of 404 responses to Googlebot UA → enqueue.

Cron logic:
- Pull next batch of N=100 URLs where `submittedAt IS NULL`
- For each: HEAD-check the URL. If it 410s or 404s → submit `URL_DELETED` to Google Indexing API (uses the **deletion** quota — separate from creation). If it 200s → it's actually live, skip and remove from queue.
- Update `submittedAt` on success
- Backoff on 429s

Schedule: **every 6 hours**. With 100/day deletion quota × ~4 invocations × dedup, drain ~300/day = ~80 days for 25k URLs. **Quota is the bottleneck** — see P2.2 for parallel paths.

#### P2.2 — Use Google's URL Removal Tool API for surgical removals

The Google Indexing API has a 100/day deletion quota and is officially "for JobPosting and BroadcastEvent only" (other URLs work but are rate-limited stricter).

The **URL Removal Tool** (search.google.com/search-console/removals) accepts:
- Single URL removal (immediate, 6-month validity)
- Path prefix removal (immediate, 6-month validity)

**Action for the team (manual, one-time):**
1. Identify the 5–10 highest-volume garbage URL prefixes from GSC. Likely candidates:
   - `/jobs/va/city/` — many small-city VA pages with 0 jobs
   - `/jobs/community-health/city/` — same
   - `/jobs/hospital/city/` — same
   - Any company slug pattern that's slug-mismatched
2. For each prefix where ≥80% of URLs return 404/410, submit a **URL prefix removal** in GSC.
3. This drops them from Google's serving index for 6 months — long enough for the 410 signal + sitemap exclusion to make removal permanent.

This is the **fastest** way to move 10–15k URLs out of "not indexed" within 24h. Indexing API takes weeks.

#### P2.3 — Submit `URL_DELETED` for the indexed-but-blocked auth pages, after un-blocking

**Sequence:**
1. Edit [app/robots.ts](app/robots.ts) to **temporarily un-block** `/signup`, `/messages`, `/job-alerts/manage`, `/employer/login`, `/saved`. Move them out of `FULL_DISALLOW`.
2. Confirm middleware sets `X-Robots-Tag: noindex, nofollow` on them ([middleware.ts:461-477](middleware.ts#L461-L477) — already does).
3. Use Indexing API `URL_DELETED` for all 5 (one-time call from a script).
4. Wait 14 days for Google to re-crawl and confirm de-indexed (verify in GSC).
5. **Re-add** to `FULL_DISALLOW` in robots.txt.

#### P2.4 — Identify and 410 the slug-mismatched company URLs

The pre-Mar-19 sitemap generated company slugs from `Job.employer` via regex; some don't match `Company.normalizedName`. These produce 404s.

**One-time script:** `scripts/find-zombie-company-urls.ts`
- Pull all unique `employer` strings from the `jobs` table that *don't* have a matching `Company.normalizedName`
- Build candidate URLs `/companies/{slug-from-employer-regex}`
- Enqueue all into `DeindexQueue`

The middleware already 410s for empty companies but only when the slug *resolves* to a Company row; mismatched slugs hit the 404 path. Add a fallback in middleware: if `/companies/{slug}` doesn't match any normalizedName at all, return 410 (it's never going to be a valid URL).

#### P2.5 — Generate a "definitive bad URLs" CSV for monthly URL Removal Tool batches

The URL Removal Tool also accepts up to 1,000 URLs/day uploaded as CSV via the GSC UI. Create a quarterly automation:

1. `scripts/gsc-coverage-dump.ts` — calls GSC API to pull current "Not found" + "Crawled-not-indexed" tables
2. Filter to URLs that *currently* return 404/410 (HEAD check)
3. Export top 1,000 by impression count
4. Submit via GSC Removal Tool

**Acceptance for Phase 2:** Within 30 days, "Not found (404)" should drop from 25,359 to <8,000. "Crawled-not-indexed" should drop from 5,126 to <2,000.

---

### PHASE 3 — Quality Floor *(target: 3–5 days, multiple PRs)*

Phase 1+2 handles the volume problem. Phase 3 raises the quality of pages that *are* meant to be indexed, so Google stops marking them as thin/duplicate.

#### P3.1 — Audit `/jobs/state/{state}` and `/salary-guide/{state}` empty handling

**Files:** [app/jobs/state/[state]/page.tsx](app/jobs/state/%5Bstate%5D/page.tsx), [app/salary-guide/[state]/page.tsx](app/salary-guide/%5Bstate%5D/page.tsx)

For each:
- Confirm `notFound()` (or 410 via middleware after P1.2) when 0 jobs / no salary data
- Confirm self-canonical
- Confirm `index, follow` on populated pages
- Confirm the page has substantively unique content per state (state-specific intro paragraph, top employers, salary stats from that state, license info — not just a templated header + identical body)

Currently many state pages probably look near-identical to Google's content-similarity model — that's why "Crawled, currently not indexed" is 5,126.

#### P3.2 — Eliminate near-duplicate content across taxonomy×city pages

**File:** [lib/pseo/category-city-template.tsx](lib/pseo/category-city-template.tsx)

Check the rendered content for `/jobs/va/city/{X}` vs `/jobs/community-health/city/{X}` for the same X. If they share 80%+ of their text content (templated intro + same job list because the same jobs match both filters), Google flags one as the canonical and the other as duplicate.

**Fix:** make the per-taxonomy intro paragraph genuinely different. E.g., for `/jobs/va/city/{city}`:
- Reference VA salary scale (GS-12 through GS-14)
- Reference Federal benefits / FERS
- Reference VA-specific licensing requirements

For `/jobs/community-health/city/{city}`:
- Reference NHSC loan repayment
- Reference 340B / FQHC context
- Reference HRSA shortage scoring

These are templated but *taxonomy-specific* and produce distinct content fingerprints.

#### P3.3 — Tighten category×city quality threshold from ≥3 jobs to ≥5 jobs

**Files:** [app/sitemap.ts:201](app/sitemap.ts#L201), [app/api/sitemaps/cities/[batch]/route.ts:71](app/api/sitemaps/cities/%5Bbatch%5D/route.ts#L71), [app/api/sitemaps/index/route.ts:28](app/api/sitemaps/index/route.ts#L28), [lib/pseo/category-city-template.tsx](lib/pseo/category-city-template.tsx) MIN_JOBS_FOR_INDEX

3 jobs is the floor where Google still flags pages as thin. Raising to 5 reduces the indexable pSEO surface from ~estimated-15k URLs to ~estimated-8k, but each one will be substantially more likely to actually rank.

This is a **business tradeoff** — if 5 is too aggressive, try 4. Run an A/B over 4 weeks and watch impressions per page.

#### P3.4 — Add per-taxonomy×city *unique* snippets

For pages above the new threshold, add 1–2 sentences of city-specific content (not just job-specific):
- "Boston has 4 academic medical centers offering PMHNP residencies..."
- "Phoenix's mental-health-professional shortage area designation makes NHSC loan repayment available for new hires..."

Source: scrape from Wikipedia + HRSA + AAMC once, store per-city in a `cityNarrative` table or extend the `cities.ts` data structure. Generate via LLM at build time, human-review before commit.

#### P3.5 — Pagination canonical fix

**Likely culprit for 4,580 "Duplicate without canonical":** paginated lists where `?page=2` is treated as a duplicate of `?page=1`.

Verify all paginated pages set:
- `<link rel="canonical" href="https://...listing">` (no `?page=N`)
- For page > 1: `<meta name="robots" content="noindex, follow">`
- For page 1: `<link rel="next" href="...?page=2">` (best-effort hint, even though Google doesn't officially honor it anymore)

Audit:
- `/jobs?page=N` listings
- `/jobs/city/{slug}?page=N`
- `/jobs/{taxonomy}/city/{slug}?page=N`
- `/jobs/{taxonomy}/{state}?page=N`
- `/companies/{slug}?page=N`

#### P3.6 — Re-aggregate `pseoStats` after every job-ingestion run

**File:** ingestion pipeline + [app/api/cron/aggregate-pseo/route.ts](app/api/cron/aggregate-pseo/route.ts)

Currently runs every 12h. If a large batch of jobs ingest at hour 11, the aggregator runs at hour 12 — minimal lag. But if ingestion runs more often than 12h (which it does), there's a window where a city has new jobs but `pseoStats.totalJobs` still reads 0 → middleware would 410 a page that should be live.

**Fix:** trigger `aggregate-pseo` immediately after each ingestion run completes, scoped to only the cities/states affected by the new jobs. Store affected (city, state) pairs in a Redis set during ingestion; aggregator drains it.

#### P3.7 — Regenerate `cities.ts` quarterly + add a sanity test

**File:** [lib/pseo/city-data/cities.ts](lib/pseo/city-data/cities.ts), `scripts/generate-city-data.js`

- Re-run script every quarter
- Add CI test:
  - `CITIES.length` is between 4,000 and 4,500
  - Every city has population ≥ 1
  - Top-10 cities by population include NYC, LA, Chicago, Houston, Phoenix
  - No duplicate slugs

#### P3.8 — Split primary sitemap if it exceeds 40k URLs

**File:** [app/sitemap.ts](app/sitemap.ts)

Add monitoring at the start of the function:

```ts
const totalEntries = staticPages.length + categoryLandingPages.length + ... + jobPages.length;
if (totalEntries > 40000) {
  logger.warn(`Primary sitemap has ${totalEntries} entries; approaching 50k limit`);
}
```

If approaching, split job pages into batched sitemaps `/api/sitemaps/jobs/{batch}` mirroring the city batch pattern. Update the sitemap index to reference them.

**Acceptance for Phase 3:** After 30 days, "Crawled, currently not indexed" should drop from 5,126 to <1,500. "Duplicate without user-selected canonical" should drop from 4,580 to <1,000.

---

### PHASE 4 — Guardrails *(target: 1–2 days)*

Lock in the gains. Prevent the next `b2187d7`-style detonation.

#### P4.1 — CI test: sitemap entry count ranges

**File:** new `tests/sitemap-budget.test.ts`

```ts
test('primary sitemap is within budget', async () => {
  const sitemap = await sitemapHandler();
  expect(sitemap.length).toBeGreaterThan(5000);
  expect(sitemap.length).toBeLessThan(45000);
});

test('city sitemap batches sum to within budget', async () => {
  // Hit /api/sitemaps/index to find batch count, then sum entries
  const total = ...;
  expect(total).toBeGreaterThan(2000);
  expect(total).toBeLessThan(80000);
});

test('every static-pattern URL in sitemap returns 200', async () => {
  // Sample 20 random URLs from each section, HEAD-check
});
```

These tests must pass in CI before any PR touching `app/sitemap.ts`, `app/api/sitemaps/**`, or `lib/pseo/**` can merge.

#### P4.2 — GSC monitoring cron

**New file:** `app/api/cron/gsc-health-check/route.ts`

- Pull current GSC coverage stats via Search Console API
- Compare to last run (stored in DB)
- Alert via Discord if:
  - "Not indexed" count rises >5% week-over-week
  - "Indexed" count falls >3% week-over-week
  - Any single new error category appears >100 URLs
  - Sitemap submission fails or returns errors

Schedule: daily at 09:00 UTC (after GSC processes overnight crawl data).

#### P4.3 — Cron health monitoring

Each cron must:
- Log start/finish times
- Alert if it doesn't run within 2× expected interval
- Alert if it returns an error
- Alert if its primary metric (URLs submitted, jobs deindexed, etc.) drops to 0 unexpectedly

**Files:** add `verifyCronOrAdmin` already exists; add a wrapper `cronHealth.beforeRun()` / `cronHealth.afterRun()` that logs to a `CronRunHistory` table. Add a daily job that scans this table and alerts on anomalies.

#### P4.4 — Pre-deploy SEO smoke test

**New file:** `tests/seo-smoke.test.ts` (run on every Vercel preview deploy)

- HEAD-check 50 random sample URLs from each section of the sitemap; expect 200/308 responses (not 404/5xx)
- HEAD-check 10 known-deleted job URLs; expect 410
- HEAD-check 5 known-empty-city URLs; expect 410 (after P1.2)
- Fetch `/robots.txt`; assert AI crawler list and Sitemap declarations are present
- Fetch `/api/sitemaps/index`; assert valid XML and sitemap count > 1

If any fail, block the deploy promotion to production.

#### P4.5 — Document the canonical-rule decision tree

**New file:** `docs/seo-decision-tree.md`

A flowchart for engineers:
```
Page exists in DB? ──no──> 410
       │ yes
       ↓
Has ≥3 active jobs? ──no──> 308 to parent (taxonomy×city) OR 410 (city/company) OR 404 (state taxonomy×0)
       │ yes
       ↓
Page > 1?  ──yes──> 200 + noindex + canonical to page=1
       │ no
       ↓
Has substantively unique content? ──no──> noindex + canonical to parent
       │ yes
       ↓
200 + index, follow + self canonical
```

Plus: when to add to sitemap (only `index, follow` cases), when to internal-link (only when `pseoStats.totalJobs ≥ 1`).

This becomes mandatory reading before touching anything in `app/jobs/**` or `app/companies/**`.

---

## 5. Validation & Recovery Forecast

### 5.1 Health metrics to track weekly

Pull from GSC + internal dashboards. Track each week's delta:

| Metric | Current (2026-05-04) | Target (2026-08-01) |
|---|---:|---:|
| Indexed | 22,860 | ≥35,000 |
| Not found (404) | 25,359 | <8,000 |
| Crawled — currently not indexed | 5,126 | <1,500 |
| Duplicate without canonical | 4,580 | <800 |
| Discovered — currently not indexed | 3,283 | <1,500 |
| Server error (5xx) | 2,717 | <100 |
| Soft 404 | 837 | <50 |
| Indexed-but-blocked auth | 5 | 0 |
| Total impressions/day | ~10,000 (declining) | >25,000 (growing) |

### 5.2 Recovery curve assumptions

- **Phase 1 ships:** Day 0–3. Effect: stops new pollution. No GSC visible change for ~7 days.
- **Phase 2 ships:** Day 3–10. Effect: 10–15k URLs removed via URL Removal Tool prefix submissions within 24h of submission. Indexing API URL_DELETED drains another ~300/day. Net: "Not found" drops to ~12k by Day 30.
- **Phase 3 ships:** Day 10–25. Effect: Crawled-not-indexed and Duplicate categories start declining as Google re-evaluates pages. Visible change Day 30–60.
- **Phase 4 ships:** Day 25–30. Effect: prevents regression; no immediate metric change.

Realistic full-recovery window: **8–12 weeks**.

### 5.3 What success looks like

By **2026-08-01**:
- Indexed/total ratio ≥ 75% (vs. current 28.6%)
- No GSC error category > 2,000 URLs
- Daily impressions trending up week-over-week for 4 consecutive weeks
- Average position improving for the top 100 ranked queries
- Zero auth pages indexed
- Sitemap entry count stable within ±5% week-over-week (signals healthy quality gates)

### 5.4 What failure looks like (escalation triggers)

If after **4 weeks** post-Phase-2:
- "Not found (404)" hasn't dropped below 18,000
- "Indexed" hasn't started recovering

Then the issue is structural, not flow. Escalate to:
- Manual review of a sample of 50 still-404-in-GSC URLs to find the new-pollution source we missed
- Check Vercel edge logs for unexpected 4xx/5xx volume on Googlebot UA
- Consider a Search Console "Request validation" on the largest error categories (forces Google to re-crawl on a faster cycle)

---

## 6. Anti-patterns to never repeat

These are the specific patterns the engineering team must reject in future PR review:

1. **"Expand sitemap" PRs without quality-gate analysis.** The Mar-16 commit was 18 lines; it triggered an 8-week recovery. Sitemap is high-leverage; treat it like a production database migration.
2. **`force-dynamic` exports on pSEO routes.** Already removed in `2f6e957`. If anyone re-adds it, ISR caching breaks and DB load spikes during crawl bursts → 5xx spike.
3. **Hard-coded fallback dates** in time-sensitive responses (sitemaps, RSS, OG metadata). Either fail-fast or use `new Date()`.
4. **`try/catch { /* swallow */ }` around DB lookups in middleware.** Always log; ideally alert if rate exceeds a threshold.
5. **404 instead of 410** for pages we know are permanently gone. 404 is the weakest signal. Use 410.
6. **Internal links without job-count gating.** Every link to a `/jobs/{taxonomy}/{state}` or similar must come from a `pseoStats` query that filters to populated pages.
7. **Programmatic taxonomies without a content differentiation strategy.** If you can't write 1–2 sentences of unique copy per cell, the page shouldn't be indexable. Use noindex/canonical-to-parent.
8. **Auth pages in sitemap or with external links pointing to them.** Verify on every PR that adds a new authenticated route.

---

## 7. Open questions / decisions for the user

Before kicking off Phase 1, confirm:

1. **Phase 3 quality threshold:** raise category×city floor from 3 → 5 jobs? (More aggressive = faster recovery, smaller surface; less aggressive = slower recovery, larger long-term surface.)
2. **Phase 2 URL Removal Tool prefix submissions:** which prefixes have your blessing? Recommended candidates listed in §P2.2.
3. **Phase 2 robots.txt unblocking of auth pages:** can we tolerate a 14-day window where `/signup` etc. are crawlable (but noindex'd)? Reasoning: this is the only way to drain the "indexed-but-blocked" 5 URLs.
4. **Cron schedule density:** can we add 2 new crons (`historical-deindex` 4×/day, `gsc-health-check` 1×/day) to the existing roster? Vercel pro plan limits — confirm headroom.
5. **CI budget:** the Phase 4 SEO smoke test adds ~30 seconds to every preview deploy. Acceptable?

---

## 8. Appendix: file inventory

### 8.1 Files implicated in the crisis or its remediation

| File | Role | Last touched (relevant SEO fix) |
|---|---|---|
| [app/sitemap.ts](app/sitemap.ts) | Primary sitemap | 97a8e5d, 131d0c9 |
| [app/api/sitemaps/index/route.ts](app/api/sitemaps/index/route.ts) | Sitemap index | f8b35c6 |
| [app/api/sitemaps/cities/[batch]/route.ts](app/api/sitemaps/cities/%5Bbatch%5D/route.ts) | Batched city sitemap | f8b35c6 |
| [app/robots.ts](app/robots.ts) | robots.txt | 9f3d94a |
| [middleware.ts](middleware.ts) | 410 logic, redirects, noindex headers | f8b35c6 |
| [app/jobs/[slug]/page.tsx](app/jobs/%5Bslug%5D/page.tsx) | Job detail (3-state) | f8b35c6 |
| [app/jobs/city/[slug]/page.tsx](app/jobs/city/%5Bslug%5D/page.tsx) | City listing | 97a8e5d |
| [app/jobs/state/[state]/page.tsx](app/jobs/state/%5Bstate%5D/page.tsx) | State listing | (audit pending — P3.1) |
| [app/companies/[slug]/page.tsx](app/companies/%5Bslug%5D/page.tsx) | Company listing | 131d0c9, middleware 410 |
| [lib/pseo/category-city-template.tsx](lib/pseo/category-city-template.tsx) | Taxonomy×city template | f8b35c6 |
| [lib/pseo/setting-state-template.tsx](lib/pseo/setting-state-template.tsx) | Taxonomy×state template | f8b35c6 |
| [lib/pseo/aggregator.ts](lib/pseo/aggregator.ts) | pseoStats pre-compute | f8b35c6 |
| [lib/pseo/city-data/cities.ts](lib/pseo/city-data/cities.ts) | 4,135 cities reference | 2026-03-13 (auto-gen) |
| [app/api/cron/aggregate-pseo/route.ts](app/api/cron/aggregate-pseo/route.ts) | pseoStats refresh cron | f8b35c6 |
| [app/api/cron/index-pseo/route.ts](app/api/cron/index-pseo/route.ts) | Indexing API submit cron | f8b35c6 |
| [app/api/cron/deindex-expired/route.ts](app/api/cron/deindex-expired/route.ts) | URL_DELETED cron | 131d0c9 |

### 8.2 New files to create per this plan

| File | Phase | Purpose |
|---|---|---|
| `app/api/cron/historical-deindex/route.ts` | P2 | Drain legacy 25k 404 backlog |
| `app/api/cron/gsc-health-check/route.ts` | P4 | Daily GSC metric monitoring |
| `scripts/find-zombie-company-urls.ts` | P2 | Identify slug-mismatched companies |
| `scripts/gsc-coverage-dump.ts` | P2 | Quarterly GSC export → URL Removal Tool |
| `tests/sitemap-budget.test.ts` | P4 | Sitemap entry count guard |
| `tests/seo-smoke.test.ts` | P4 | Pre-deploy URL smoke test |
| `docs/seo-decision-tree.md` | P4 | Engineering reference |
| `prisma/migrations/.../add_deindex_queue.sql` | P2 | `DeindexQueue` table |

### 8.3 GSC export data location

Raw exports from 2026-05-04 stored in [GSC ISSUES/](GSC%20ISSUES/) — 22 folders covering Coverage, 4 Drilldowns (Duplicate, Server error, Crawled-not-indexed, Indexed-blocked-by-robots), and 17 Validation runs. Use these as the seed data for `historical-deindex` cron's initial backlog.

---

*End of plan. Begin Phase 1 implementation when the open questions in §7 are resolved.*
