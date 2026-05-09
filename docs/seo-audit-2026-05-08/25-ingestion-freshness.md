# Ingestion, Expiry and Freshness SEO Audit
**Date:** 2026-05-08
**Scope:** Job lifecycle, sitemap accuracy, JSON-LD freshness, dead-job detection, quality gates, dedup, admin and RSS surfaces

---

## CRITICAL

None found. Sitemap expired-job filtering, HTTP 410 for dead jobs, and structured-data date fields are all correctly implemented.

---

## HIGH

### [HIGH] Expired-job page returns HTTP 200 when Supabase check fails in middleware

Location: app/jobs/[slug]/page.tsx:607-619 vs middleware.ts:382-441

Issue: When an unpublished job is visited the middleware fires a Supabase REST call to check is_published. On success with is_published=false it returns HTTP 410 via styled410(). The call is inside a try/catch (middleware.ts:423). On any Supabase failure it falls through to the Next.js page handler which runs getJob() and when result.status is expired renders the Position Filled page with HTTP 200. The metadata block sets robots:{index:false} but HTTP status is 200. During a Supabase degraded window Googlebot records the URL as 200 and delays de-indexing. The isFailClosedCrawler() path at middleware.ts:428-434 sends 503+Retry-After for recognised bots only.

Fix: Verify Googlebot is included in isFailClosedCrawler(). After cleanup-expired unpublishes jobs, fire on-demand ISR revalidation via Next.js revalidatePath for each affected slug to purge the edge cache immediately so the next Googlebot hit triggers the middleware 410 check against fresh data.
---

### [HIGH] lastmod in batched job sitemap inflates on every source re-appearance even with no content change

Location: app/api/sitemaps/jobs/[batch]/route.ts:80

Issue: lastmod is set to j.updatedAt. The renewal path in lib/ingestion-service.ts:416-418 writes updatedAt:new Date() every ingest run where the source still returns the job regardless of content changes. Googlebot sees a new lastmod on thousands of job URLs every 12 hours and re-fetches pages that are byte-for-byte identical. Google guidance: lastmod should reflect the last significant content change not a heartbeat ping. Inflating lastmod degrades crawl-budget efficiency for genuinely new jobs.

Fix: Track a separate contentUpdatedAt field written only when description, salary, title, or location change. Use that field for lastmod. Interim: use originalPostedAt as a stable immutable floor since job content does not change between source re-appearances.

---

### [HIGH] ISR 1-hour cache -- unpublished jobs serve full JobPosting JSON-LD to Googlebot for up to 60 minutes after expiry cron fires

Location: app/jobs/[slug]/page.tsx:36 (revalidate=3600) and components/JobStructuredData.tsx:69-71

Issue: Job detail pages use ISR with revalidate=3600. When cleanup-expired unpublishes a batch at 12:10 and 18:10 UTC, Googlebot visiting those URLs within the next 60 minutes receives a cached 200 with intact JobPosting JSON-LD including a validThrough that has now passed. The middleware 410 check goes to Supabase which has millisecond-level replication lag from the Prisma write. If the ISR edge cache returns the stale page before the middleware check resolves, Googlebot records the job as live with an expired validThrough -- a Google Jobs quality signal hit.

Fix: After cleanup-expired flips isPublished=false for a batch, call the Next.js on-demand revalidation API for each affected slug. Purges the ISR cache immediately so the next request goes to origin and triggers the middleware 410 check against fresh data.

---

### [HIGH] deindex-expired and historical-deindex share 100/day Google Indexing API quota -- morning historical run can exhaust quota before midday expiry window

Location: app/api/cron/deindex-expired/route.ts:8 and app/api/cron/historical-deindex/route.ts:9-11 and vercel.json:164-169

Issue: Both crons share the 100/day Google Indexing API deletion quota. historical-deindex attempts up to 200 URL submissions per day (50 URLs x 4 runs). The 07:00 UTC run can exhaust the daily quota before deindex-expired fires at 12:45 UTC. Jobs expiring on the 12:10 cleanup-expired run may fail their Google URL_DELETED submission and wait until next day. IndexNow covers Bing and Yandex but not Google Jobs specifically. The comment in historical-deindex at line 33-36 acknowledges the shared quota but the scheduling analysis is incomplete -- it only considers the 19:00 slot not the 07:00 slot.

Fix: In historical-deindex before submitting to Google, check remaining daily quota from the X-Quota-Remaining response header. If below 20, skip Google for that run and submit IndexNow only. Fresh-expiry de-indexing from deindex-expired must always have priority on the Google quota.

---

## MEDIUM

### [MEDIUM] shouldUnpublish() uses updatedAt as proxy for last-seen -- renewals inflate updatedAt so stale jobs persist indefinitely

Location: lib/freshness-decay.ts:44-76

Issue: shouldUnpublish() compares updatedAt to a 60-day threshold. The renewal path in lib/ingestion-service.ts:418 writes updatedAt:new Date() every ingest run regardless of content changes. A job posted 120 days ago that the source still lists has updatedAt=today and is never unpublished by freshness-decay. The 60-day cap in renewJob() at lib/ingestion-service.ts:387-406 only fires when existingPostedAt is non-null. Jobs matched by fuzzy title/employer at line 579-585 may return null for existingPostedAt, bypassing the age cap entirely.

Fix: Change shouldUnpublish() to compare originalPostedAt against the 60-day threshold instead of updatedAt. Add a null guard falling back to createdAt when originalPostedAt is null. This closes the renewed-forever loophole and aligns freshness-decay with MAX_JOB_AGE_MS in ingestion-service.
---

### [MEDIUM] deindex-expired query catches all recently-unpublished jobs regardless of mechanism

Location: app/api/cron/deindex-expired/route.ts:37-53

Issue: The query catches jobs unpublished by the dead-link cron and source-presence cron as well as expiry-triggered ones. The dead-link cron already fires an Inngest job.health.flipped event at check-dead-links/route.ts:171-184 for its own de-indexing flow. Duplicate URL_DELETED submissions count against the 100/day Google quota.

Fix: Add expiresAt:{not:null,lt:new Date()} to the deindex-expired query so it targets only expiry-mechanism unpublishes.

---

### [MEDIUM] Cities sub-sitemap hardcodes lastmod as today

Location: app/api/sitemaps/cities/[batch]/route.ts:159

Issue: lastmod is new Date().toISOString().split(T)[0] on every request. The sitemap index at app/api/sitemaps/index/route.ts:28-32 explicitly fixed this same anti-pattern. The cities batch route was not updated.

Fix: Pre-fetch MAX(updatedAt) from jobs filtered to ACTIVE_JOB_WHERE before the URL loop and use that as lastmod.

---

### [MEDIUM] No RSS or Atom feed -- Google Jobs discovery latency up to 5 hours

Location: No feed route found under app/api/ or app/

Issue: The site has no RSS or Atom feed. With a 4h ingest cadence and 1h ISR, new jobs may not be indexed for up to 5 hours from originalPostedAt. An Atom feed allows Google to discover jobs within minutes via PubSubHubbub.

Fix: Create app/api/feed/route.ts serving Atom 1.0 for the most recent 100 active jobs ordered by createdAt DESC. Add link rel=alternate type=application/atom+xml to app/layout.tsx. Publish the feed URL in robots.ts sitemap directives.

---

### [MEDIUM] historical-deindex User-Agent blocked by employer ATS WAFs

Location: app/api/cron/historical-deindex/route.ts:87

Issue: The HEAD check sends User-Agent: PMHNPHiringIndexer/1.0. Employer ATS WAFs commonly blocklist named proprietary UA strings causing 403/network-error responses. After MAX_ATTEMPTS=3 failures the row is marked failed and never gets a URL_DELETED submission.

Fix: Use Mozilla/5.0 (compatible) or remove the User-Agent header. Add fallback: if HEAD returns 403 assume dead and submit URL_DELETED.

---

### [MEDIUM] freshness-decay runs once daily -- jobs expiring at 18:10 UTC have stale qualityScore for 18 hours

Location: vercel.json:141 vs vercel.json:128-129

Issue: cleanup-expired fires at 12:10 and 18:10 UTC. freshness-decay fires only at 12:20 UTC.

Fix: Schedule freshness-decay at 20 12,18 to match both cleanup-expired windows.

---

## LOW

### [LOW] freshness-decay JSDoc says 90 days but code enforces 60 days

Location: lib/freshness-decay.ts:82

Issue: Comment reads 90 days. shouldUnpublish() at line 69 uses 60 days matching MAX_JOB_AGE_MS in lib/ingestion-service.ts:344.

Fix: Change comment to 60 days.

---

### [LOW] fantastic-jobs-db 6-month backfill runs only on January 1

Location: vercel.json:56-58 (schedule: 0 0 1 1 *)

Issue: Jobs missed by the 24h endpoint in November or December may not enter the catalog for up to 13 months.

Fix: Consider changing to 0 0 1 */3 * (quarterly).

---

### [LOW] AUTH_REBLOCK_DATE enforcement relies only on a console.warn

Location: app/robots.ts:9 and app/robots.ts:154-156

Issue: Temporary auth-page unblock per P2.3 must be reversed by 2026-05-19. No CI gate enforces this.

Fix: Add a build-time assertion that fails if today is past AUTH_REBLOCK_DATE and auth paths are not back in FULL_DISALLOW.

---

## Verified-clean

1. Sitemap expired-job filter: app/sitemap.ts:14-20 and app/api/sitemaps/jobs/[batch]/route.ts:28-34 both use ACTIVE_JOB_WHERE with isPublished:true AND (expiresAt IS NULL OR expiresAt > now). Expired jobs are excluded from all sitemap surfaces.

2. datePosted JSON-LD uses originalPostedAt: components/JobStructuredData.tsx:56-58 uses job.originalPostedAt || job.createdAt. Schema reflects the real posting date not the scrape date.

3. validThrough JSON-LD is deterministic: components/JobStructuredData.tsx:60-71. When expiresAt is set it is used verbatim. When null the fallback is datePosted+60d per job. The prior now+30d anti-pattern was explicitly removed per code comment at line 60-68.

4. /admin is disallowed in robots.txt: app/robots.ts:73 places /admin/ in FULL_DISALLOW for all user agents.

5. Dead-job detection is three-layered: (a) ingest-time probe at lib/ingestion-service.ts:604-668; (b) check-dead-links cron with multi-signal voting; (c) source-presence-unpublish via healthConsecutiveMissing. All three write to job_health_checks.

6. PMHNP-only filter runs pre-normalization: lib/ingestion-service.ts:451-467 runs classifyRelevance() on raw title+description before normalization for every source.

7. Cross-source dedup prevents duplicate URLs: global dedup maps shared across all sources in a single ingest run. Kept in sync post-insert at lib/ingestion-service.ts:737-749.

8. No Discord URLs on indexable surfaces: grep across app/ found no matches in rendered content. Discord is server-side only via lib/discord-notifier.ts.

9. Quality gates reject thin listings: computeCompleteness() enforces hard floor 20 and soft floor 40 with LLM rescue at lib/ingestion-service.ts:499-537.

10. All cron API routes are disallowed: app/robots.ts:51-52 places /api/ and /api/cron/ in FULL_DISALLOW for all user agents.

11. JSON-LD datetimes are ISO 8601 UTC via .toISOString(). CST display rendering in lib/utils.ts does not affect structured data output.

12. Video sitemap only includes blog posts with YouTube as primary content: app/video-sitemap.xml/route.ts. Scroll animation videos removed per GSC guidance.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 6 |
| LOW | 3 |
| Verified-clean | 12 |

Priority order:
1. Add on-demand ISR revalidation after cleanup-expired (HIGH)
2. Create RSS/Atom feed (MEDIUM -- highest leverage per implementation hour)
3. Fix lastmod to use contentUpdatedAt not updatedAt (HIGH)
4. Fix shouldUnpublish() to use originalPostedAt (MEDIUM)
5. Add quota guard to historical-deindex (HIGH)
6. Narrow deindex-expired query to expiresAt-triggered unpublishes (MEDIUM)
7. Fix cities sitemap lastmod to MAX(updatedAt) (MEDIUM)
8. Schedule freshness-decay at 12,18 UTC (MEDIUM)
9. Fix historical-deindex User-Agent (MEDIUM)
