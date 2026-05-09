# 17 — Middleware, Redirects & Header Audit

**Date:** 2026-05-08
**Scope:** middleware.ts, next.config.ts, vercel.json
**Cross-referenced:** app/sitemap.ts, app/robots.ts

---

## CRITICAL

### C-1 — /new-grad in sitemap points at a URL that immediately 301s to /jobs/new-grad

**Location:** next.config.ts:147-150, app/sitemap.ts:100

**Issue:** app/sitemap.ts submits https://pmhnphiring.com/new-grad (priority 0.9, changeFrequency weekly). next.config.ts permanently redirects /new-grad to /jobs/new-grad. Next.js evaluates redirects() before page handlers, so app/new-grad/page.tsx never fires — every request to /new-grad redirects. Googlebot fetches a sitemap URL and follows a 301. Google consolidates authority to the destination eventually, but until then the sitemap URL and canonical URL are mismatched, generating Submitted URL redirected errors in GSC and suppressing the sitemap priority/changeFrequency hints.

**Fix:** Remove https://pmhnphiring.com/new-grad from app/sitemap.ts line 100 and replace it with https://pmhnphiring.com/jobs/new-grad. If app/new-grad/page.tsx is the intended canonical, remove the redirect from next.config.ts:147-150 instead — pick one and make them consistent.

---

### C-2 — UA-based branching returns 503 to crawlers and 200 to users on DB failure (cloaking)

**Location:** middleware.ts:261-293, middleware.ts:436-439, middleware.ts:521-524

**Issue:** When the Supabase DB check fails, isFailClosedCrawler() returns 503 + X-Robots-Tag: noindex, nofollow + Retry-After: 300 to Googlebot/Bingbot/DuckDuckBot/Applebot. Real users fall through to the page handler and receive 200 OK with full content. This is structural user-agent-based response differentiation on the same URL. Google's quality guidelines define cloaking as serving different content to search engines versus users — serving different HTTP status codes on the same URL meets that definition even when the intent is benign.

Practical risk scales with DB failure frequency. During any Supabase outage or cold-start latency spike, every job-detail and company page becomes a potential cloaking signal for the duration of the incident.

**Fix:** Return 503 to all request types when the DB check fails. Remove the isFailClosedCrawler branch at middleware.ts:436-439 and middleware.ts:521-524; always return unavailable503() on catch. Users receiving a brief 503 is acceptable: Vercel edge may serve a stale cached copy, and Retry-After: 300 tells all clients to retry in 5 minutes.

---

## HIGH

### H-1 — /job-alerts in sitemap; confirm base path is genuinely public

**Location:** middleware.ts:861, app/sitemap.ts:95

**Issue:** app/sitemap.ts submits https://pmhnphiring.com/job-alerts (priority 0.7). The middleware noindexPaths array at line 861 lists /job-alerts/manage and /job-alerts/unsubscribe but NOT /job-alerts. This is correct IF /job-alerts renders substantive public content for unauthenticated users. If the page is gated or renders near-empty content for anonymous visitors, Google will index a thin or blocked page.

**Fix:** Verify app/job-alerts/page.tsx returns meaningful content without authentication. If it is gated or thin for anonymous users, add /job-alerts to noindexPaths in middleware.ts at the line 857-863 block.

---

### H-2 — Redirect-source blog posts may still appear in the generated sitemap

**Location:** next.config.ts:135-142, app/sitemap.ts:155-163

**Issue:** next.config.ts permanently redirects /blog/pmhnp-salary-guide-2026 and /blog/average-pmhnp-salary-by-state-2026-real-numbers to /salary-guide. app/sitemap.ts generates blog URLs from getAllPublishedSlugs(). If both posts are still is_published: true in the database they appear in the sitemap. Googlebot fetches a sitemap URL and follows a 301, generating Submitted URL redirected errors in GSC.

**Fix:** Set both blog posts to unpublished in the database so getAllPublishedSlugs() excludes them. Keep the redirects in next.config.ts to pass link equity to the destination.

---

### H-3 — Uppercase + trailing-slash combination produces a two-hop redirect chain

**Location:** middleware.ts:642-645 (trailing slash), middleware.ts:651-654 (case fold)

**Issue:** A URL like /Jobs/Remote/ triggers two sequential redirects: (1) trailing-slash strip fires at line 642, redirects to /Jobs/Remote (301); (2) the fresh request hits case-fold at line 651, redirects to /jobs/remote (301). That is two hops. Each hop passes diminished PageRank. With thousands of programmatic category and city pages this effect compounds across the crawl.

**Fix:** Combine both normalizations into one redirect branch:



---

### H-4 — vercel.json and next.config.ts set conflicting Cache-Control TTLs on image files

**Location:** vercel.json:237-244, next.config.ts:111-118

**Issue:** next.config.ts sets Cache-Control: public, max-age=31536000, immutable for /:all*(svg|jpg|png|webp|ico|woff2). vercel.json sets Cache-Control: public, max-age=604800 (7 days) for /:path*.(png|jpg|jpeg|gif|webp|svg|ico|avif). Both match png, jpg, webp, svg, and ico. Vercel platform-level headers in vercel.json take precedence over Next.js headers() config for static files. The effective TTL for those types is 7 days, silently overriding the 1-year intent in next.config.ts. The woff2 type is only in next.config.ts and is unaffected.

**Fix:** Remove the image cache header rule from next.config.ts:111-118. Decide on a single authoritative TTL in vercel.json. If immutable caching is desired, raise the vercel.json image rule to max-age=31536000, immutable.

---

## MEDIUM

### M-1 — AUTH_REBLOCK_DATE CI test does not exist; deadline is 2026-05-19

**Location:** app/robots.ts:9, app/robots.ts:154-156

**Issue:** The comment at line 9 says a CI test at tests/sitemap-budget.test.ts should fail after AUTH_REBLOCK_DATE (2026-05-19). That file was not found in the repository. On 2026-05-20, only a console.warn in Vercel logs fires as the reminder. Auth pages remaining crawlable is not catastrophic since middleware X-Robots-Tag: noindex still fires, but it is unintended drift that will persist silently.

**Fix:** Create tests/sitemap-budget.test.ts with a date assertion before 2026-05-19 (11 days from audit date).

---
### M-2 — No middleware 410 guard for invalid /salary-guide/:state slugs

**Location:** middleware.ts:539-589

**Issue:** The pSEO 410 block guards /jobs/state/:invalid but has no equivalent for /salary-guide/:invalid-state. Bot-invented URLs like /salary-guide/fake-state return 404 from the page handler. Google recrawls 404s for months; 410 signals permanent removal within days.

**Fix:** Add a check in middleware for /salary-guide/ paths: if the second segment is not a recognized state slug per resolveStateSlug(), return gone410(...).

---
### M-3 — Set-Cookie: pmhnp_consent_region on every request prevents CDN caching of indexable pages

**Location:** middleware.ts:795-800

**Issue:** The consent region cookie is re-set unconditionally on every request. Vercel CDN does not cache responses containing a Set-Cookie header. Every Googlebot crawl of a job page, category page, or blog post therefore hits the Next.js origin rather than the CDN edge, increasing crawl latency and origin load.

**Fix:** Check whether the cookie value has changed before setting it. If request.cookies.get("pmhnp_consent_region")?.value === region, skip the set. On repeat visits the Set-Cookie header is eliminated and CDN caching becomes possible.

---
### M-4 — x-nonce response header exposes the CSP nonce to the browser

**Location:** middleware.ts:751

**Issue:** response.headers.set("x-nonce", nonce) sends the per-request nonce as a response header. In Next.js App Router the nonce is passed to the SSR layout via a request header earlier in middleware. The response-direction header is not needed and weakens the CSP: any client-side code that can read response headers gains the nonce and can inject arbitrary scripts with it.

**Fix:** Remove response.headers.set("x-nonce", nonce) at middleware.ts:751.

---
### M-5 — No www to non-www 301 enforcement

**Location:** middleware.ts (absent), next.config.ts (absent), vercel.json (absent)

**Issue:** The CORS allowlist at middleware.ts:815-820 explicitly lists both https://pmhnphiring.com and https://www.pmhnphiring.com, confirming both are live. No redirect enforces a canonical hostname. Google may split PageRank across both forms if they appear in backlinks or are discovered separately.

**Fix:** Add a host-conditional redirect in vercel.json. Use a has rule matching host: www.pmhnphiring.com and redirect to https://pmhnphiring.com/:path* with permanent: true.

---
### M-6 — Intra-blog redirect uses a year-locked destination slug

**Location:** next.config.ts:194-198

**Issue:** /blog/pmhnp-interview-questions permanently redirects to /blog/pmhnp-interview-questions-2026. If the destination slug is renamed next year the chain becomes two hops. The first hop is baked into a deploy and cannot be changed retroactively.

**Fix:** Point the redirect at a dateless evergreen slug and add a second redirect from the 2026 slug to the same destination. All inbound links resolve in one hop indefinitely.

---
## LOW

### L-1 — vercel.json has no redirects key

**Location:** vercel.json (entire file)

**Issue:** All redirects live in next.config.ts. Vercel-platform redirects in vercel.json execute at the CDN before the Next.js runtime, making them faster and bypass cold-start latency. The www enforcement redirect (M-5) belongs here.

**Fix:** Add a redirects array to vercel.json for host-level redirects. Keep next.config.ts for app-slug consolidation.

---
### L-2 — X-Frame-Options: DENY is redundant with CSP frame-ancestors: none

**Location:** next.config.ts:80-83, middleware.ts:627

**Issue:** frame-ancestors none in the CSP provides the same framing protection in all modern browsers. X-Frame-Options: DENY is the IE 11 legacy fallback. No SEO impact; dead weight in response headers.

**Fix:** Remove X-Frame-Options: DENY from next.config.ts:80-83.

---
### L-3 — interest-cohort=() in Permissions-Policy is a deprecated no-op

**Location:** next.config.ts:91

**Issue:** FLoC was discontinued in 2022. The directive is silently ignored by all current browsers. No harm but signals unmaintained copy-paste.

**Fix:** Remove interest-cohort=(). Add browsing-topics=() if Topics API opt-out is desired.

---
### L-4 — connect-src missing wss:// for Supabase Realtime

**Location:** middleware.ts:619

**Issue:** connect-src allows https://*.supabase.co but Supabase Realtime uses WebSocket (wss://). Any page with a Realtime subscription triggers a CSP violation and blocks the connection. CSP violations can silently break JS-rendered content that Googlebot depends on.

**Fix:** Add wss://*.supabase.co to the connect-src directive at middleware.ts:619.

---
## Verified Clean

- **http to https enforcement:** HSTS correctly set in next.config.ts:76-78 and vercel.json:220-224. Vercel platform enforces HTTPS globally.
- **Trailing slash redirects:** Consistent 301 for all non-root paths at middleware.ts:642-645.
- **301 vs 302:** All next.config.ts redirects use permanent: true. All middleware redirects pass explicit 301. No stray 302s.
- **UTM stripping:** Strips only utm_* prefixed keys, preserves all other params (middleware.ts:668-679). No overbroad stripping.
- **Catch-all redirect risk:** No broad regex redirect rules. junkPaths is an exact-match list (middleware.ts:690-693).
- **Page=1 stripping:** Correctly 301s ?page=1 to the bare URL without removing other params (middleware.ts:659-662).
- **Case normalization:** Correctly skips /_next paths before lowercasing (middleware.ts:651-654). Does not affect API tokens.
- **Country/language redirects:** None. x-vercel-ip-country is used only for consent classification, not URL branching or content gating.
- **A/B test cookie:** No cookie varies HTML body or content structure. pmhnp_consent_region affects only the consent UI overlay.
- **CSP and Google rendering:** GTM and GA explicitly allowed in script-src. Nonce-based CSP is correctly structured with per-request nonces.
- **Source-IP/geo gating:** None found that hides content from US-based Googlebot.
- **410 page noindex:** styled410() and unavailable503() both set X-Robots-Tag: noindex, nofollow (middleware.ts:236, middleware.ts:284-286).
- **API routes in sitemap:** /api/og and /api/sitemaps correctly excluded from noindex sweep at middleware.ts:876, matching robots.ts PUBLIC_ALLOW.
- **Redirect chains longer than two hops:** Only the uppercase + trailing-slash combination (H-3) can produce two hops. No three-hop chains exist.

---

## Priority Fix Order

| # | ID | File | Effort |
|---|-----|------|--------|
| 1 | C-2 | middleware.ts:436-439, 521-524 | Remove UA branch; always 503 on DB failure |
| 2 | C-1 | app/sitemap.ts:100 | Change one URL string to /jobs/new-grad |
| 3 | H-4 | next.config.ts:111-118, vercel.json:237-244 | Remove next.config rule; unify TTL in vercel.json |
| 4 | H-3 | middleware.ts:642-654 | Merge trailing-slash and case-fold into one branch |
| 5 | M-5 | vercel.json | Add redirects array with www host rule |
| 6 | M-3 | middleware.ts:795-800 | Guard cookie re-set behind value-change check |
| 7 | M-4 | middleware.ts:751 | Remove one response header line |
| 8 | H-2 | Database | Unpublish two redirect-source blog rows |
| 9 | M-1 | tests/sitemap-budget.test.ts | Create date-check test before 2026-05-19 |
| 10 | M-2 | middleware.ts pSEO block | Add /salary-guide/:invalid-state 410 guard |
