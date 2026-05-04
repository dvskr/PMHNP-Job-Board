# SEO Decision Tree — Required Reading Before Touching pSEO

This is the engineering reference for what HTTP status / canonical / index
state every URL on `pmhnphiring.com` should return. The GSC indexing
crisis of 2026-03-17 happened because someone changed sitemap emit logic
without internalizing these rules. **Read this before any PR that touches
`app/jobs/**`, `app/companies/**`, `app/sitemap.ts`, `middleware.ts`, or
`app/robots.ts`.**

---

## The decision tree

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Request comes in for /some/path                             │
  └──────────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Is the URL pattern structurally valid?                      │
  │  (taxonomy slug recognized? state slug parses? city slug     │
  │   in CITY_SLUGS? company slug exists in DB?)                 │
  └──────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼ NO                        ▼ YES
  ┌──────────────────────┐    ┌──────────────────────────────────┐
  │  HTTP 410 Gone       │    │  Does the page have content?     │
  │  X-Robots-Tag:       │    │  (≥1 active job for category-city│
  │    noindex, nofollow │    │   ≥3 for sitemap-eligible city   │
  │  Cache-Control: 1d   │    │   ≥8 for sitemap-eligible co)    │
  └──────────────────────┘    └──────────────────────────────────┘
                                            │
                              ┌─────────────┴─────────────┐
                              ▼ NO                        ▼ YES
                  ┌──────────────────────┐    ┌──────────────────────┐
                  │  308 redirect to     │    │  Is this page > 1?   │
                  │  parent listing      │    │  (?page=2 or higher) │
                  │  (taxonomy×city)     │    └──────────────────────┘
                  │  OR                  │              │
                  │  notFound() (city)   │    ┌─────────┴─────────┐
                  │  OR                  │    ▼ YES               ▼ NO
                  │  notFound() (state)  │  ┌──────────────┐  ┌──────────────┐
                  └──────────────────────┘  │  200 OK       │  │  200 OK       │
                                            │  noindex,     │  │  index, follow│
                                            │  follow       │  │  self canon   │
                                            │  canon → p=1  │  └──────────────┘
                                            └──────────────┘
```

---

## When to use each HTTP status code

### 200 OK
The page has unique, useful content. This is the default for healthy pages.

**Always include:**
- `<link rel="canonical">` — pointing to the URL itself (page 1 of paginated lists)
- `data-speakable="true"` on the primary content paragraph if it's AEO-relevant

**Set `robots: { index: false, follow: true }` when:**
- Page is paginated and `?page > 1`
- Page exists in DB but has 0 active jobs (alternative to 410 — used when the URL pattern should remain valid in case content comes back)
- Auth surfaces leaked into the index (handled at middleware level via X-Robots-Tag)

### 301 Permanent Redirect
URL has moved forever. Google forwards ~99% of SEO equity.
- Trailing slash → no trailing slash (handled in middleware)
- `?page=1` → bare URL (middleware)
- Uppercase path → lowercase (middleware)
- `?utm_*=*` → bare URL (middleware)
- Junk paths (`/$`, `/year`, `/undefined`) → `/` (middleware)

### 308 Permanent Redirect
Like 301 but preserves HTTP method. Use for:
- Empty taxonomy×city pages → parent category landing page
  (`/jobs/va/city/peoria-il` with 0 jobs → `/jobs/va`)

Rationale: a 308 consolidates SEO equity onto the parent, but the URL
remains structurally valid in case jobs return.

### 404 Not Found
Page doesn't exist *temporarily*. Google retries for weeks/months.
- Use sparingly — almost always 410 is better.
- Acceptable for: state pages with 0 jobs (rare; structure is permanent)

### 410 Gone
Page is permanently removed. **Strongest de-indexing signal Google honors.**
Use for:
- Job-detail UUIDs that don't exist or are unpublished (middleware)
- Company slugs that don't match any `Company.normalizedName` row (middleware)
- Company pages with 0 active jobs (middleware)
- Structurally invalid pSEO URLs (middleware, P1.2):
  - `/jobs/state/{invalid-state}`
  - `/jobs/{invalid-taxonomy}/...`
  - `/jobs/{state-eligible-cat}/{invalid-state}`
  - `/jobs/{city-only-cat}/{state-shaped-x}`
  - `/jobs/{cat}/city/{slug-not-in-CITY_SLUGS}`
  - `/jobs/metro/{invalid-metro}`

**Always include:**
- `X-Robots-Tag: noindex, nofollow`
- `Cache-Control: public, max-age=86400` (CDN caches the 410 for a day)
- A small HTML body with a link to `/jobs` so the user has somewhere to go

### 503 Service Unavailable
Server overloaded or in maintenance. Google retries with backoff.
- Don't use this as a fallback for "DB query failed" — fail-fast inside
  `app/sitemap.ts` so the static-only fallback path runs instead.

---

## When to add a URL to the sitemap

```
  ┌──────────────────────────────────────────────────────┐
  │  Should this URL be in the sitemap?                  │
  └──────────────────────────────────────────────────────┘
                            │
                            ▼
       Does it return 200 OK?         ─── NO ──→  Don't include
                            │
                          YES
                            │
                            ▼
       Does it set index: true?        ─── NO ──→  Don't include
                            │
                          YES
                            │
                            ▼
       Self-referential canonical?      ─── NO ──→  Don't include
                            │
                          YES
                            │
                            ▼
       Has substantive unique content?  ─── NO ──→  Don't include
                            │
                          YES
                            │
                            ▼
                    INCLUDE in sitemap
```

Quality thresholds (current values, see `lib/pseo/setting-state-config.ts`):

| Surface | Minimum | Source of truth |
|---|---|---|
| `/jobs/{slug-uuid}` (job detail) | active job in DB | `app/sitemap.ts:170-187` |
| `/jobs/city/{slug}` | ≥3 active jobs | `app/sitemap.ts:201` |
| `/companies/{slug}` | ≥8 active jobs | `app/sitemap.ts:239` |
| `/jobs/{cat}/city/{slug}` | ≥3 active jobs AND city pop ≥10k | `app/api/sitemaps/cities/[batch]/route.ts:71` |
| `/jobs/{cat}/{state}` | ≥1 active job | `app/api/sitemaps/cities/[batch]/route.ts:96-108` (uses pseoStats) |

**The threshold isn't Google's rule — it's our heuristic.** Google's actual
quality signal is "unique value per page." If pages are templated (every
city-page reads the same except for the city name), no threshold saves you.
See [lib/pseo/city-narrative.ts](../lib/pseo/city-narrative.ts) for the
content-uniqueness layer.

---

## When to add an internal link

```
  ┌──────────────────────────────────────────────────────┐
  │  Linking from page A to page B                       │
  └──────────────────────────────────────────────────────┘
                            │
                            ▼
       Will B return 200?           ─── NO ──→  Don't render the <Link>
                            │
                          YES
                            │
                            ▼
       Has B's pseoStats.totalJobs   ─── NO ──→  Don't render — even
       row been verified ≥ 1?                    populated routes can
                            │                    be empty during DB lag
                          YES
                            │
                            ▼
                    Render the link
```

This rule is enforced in:
- `lib/pseo/setting-state-template.tsx` — neighbors / other settings / top cities
- `lib/pseo/category-city-template.tsx` — other categories / nearby cities / state link
- `app/jobs/state/[state]/page.tsx` — setting pills filtered by `validSettingSlugs`
- `app/blog/[slug]/page.tsx` — license-page state CTAs

If you add a new internal link to `/jobs/{cat}/{state}` or
`/jobs/{cat}/city/{slug}` anywhere, **gate it through pseoStats** before
rendering.

---

## Anti-patterns (rejected at code review)

These are the specific patterns the engineering team must reject in PRs:

1. **"Expand sitemap" PRs without quality-gate analysis.** The 2026-03-16
   commit `b2187d7` was 18 lines and triggered an 8-week recovery. Sitemap
   is high-leverage; treat changes like a production database migration.

2. **`force-dynamic` exports on pSEO routes.** Already removed. If anyone
   re-adds it, ISR caching breaks and DB load spikes during crawl bursts.

3. **Hard-coded fallback dates** in time-sensitive responses (sitemaps,
   OG metadata). Either fail-fast or use `new Date()`. Never stamp
   `lastModified = '2026-01-01'` as a fallback.

4. **`try/catch { /* swallow */ }` around DB lookups in middleware.**
   Always log; ideally alert if rate exceeds a threshold. Silent fallbacks
   masquerade dead URLs as live ones.

5. **404 instead of 410** for pages we know are permanently gone. 404 is
   the weakest signal Google honors. Use 410.

6. **Internal links without `pseoStats.totalJobs` gating.** Every new link
   to a `/jobs/{taxonomy}/{state}` or `/jobs/{taxonomy}/city/{slug}` URL
   must come from a query that filters to populated pages.

7. **Programmatic taxonomies without a content-differentiation strategy.**
   If you can't write 1–2 sentences of unique copy per cell, the page
   shouldn't be indexable. Use `noindex` + canonical-to-parent.

8. **Auth pages in sitemap or with external links pointing to them.**
   Verify on every PR that adds a new authenticated route.

9. **`generateMetadata` without `searchParams`** on pages that accept
   `?page=N`. The middleware sets `X-Robots-Tag: noindex` for `?page>=2`
   automatically (P3.5), but the per-page canonical must point to page 1.

---

## CI / pre-deploy checks

Three guardrails block regressions:

| Gate | What it checks | Where |
|---|---|---|
| **Sitemap budget** | Entry count within range, all URLs canonical-shaped, robots.txt declares sitemaps, auth pages temporarily unblocked, admin/token URLs still blocked | `tests/seo/sitemap-budget.test.ts` |
| **Pre-deploy SEO smoke** | HEAD-checks ~24 representative URLs against a deployed preview, asserts expected status + headers (200, 301, 308, 410, X-Robots-Tag) | `scripts/seo-smoke-test.ts --target <preview-url>` |
| **GSC health monitor** | Daily pull from Search Console API, alerts on >20% click drop or >15% impression drop week-over-week | `app/api/cron/gsc-health-check/route.ts` |

Run smoke test on every preview deploy:
```bash
npx tsx scripts/seo-smoke-test.ts --target https://your-preview.vercel.app
```

Run the unit tests on every PR via `vitest run tests/seo/`.

---

## When in doubt

- **Default to 410**, not 404, for any URL we know is gone.
- **Default to noindex**, not index, for any page that doesn't have
  meaningfully unique content.
- **Default to omitting from sitemap** unless the page passes ALL of:
  200 OK, index:true, self-canonical, substantive unique content.
- **Default to NOT adding an internal link** to a programmatic URL unless
  you've verified it passes the pseoStats gate.

These defaults err on the side of fewer URLs in Google's index, which is
exactly the right error for a site recovering from a sitemap detonation.
