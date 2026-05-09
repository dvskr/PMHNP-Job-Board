# /jobs Listing Page SEO Audit
Date: 2026-05-08
Scope: app/jobs/page.tsx | app/jobs/JobsPageClient.tsx | components/jobs/LinkedInFilters.tsx | components/MobileFilterDrawer.tsx | components/JobCard.tsx | lib/filters.ts

---

## CRITICAL

[CRITICAL] Pagination fires via JavaScript fetch only -- page numbers are not linkable anchor elements
Location: app/jobs/JobsPageClient.tsx:250-265, 643-766
Issue: handlePageChange calls fetchJobs() directly without touching the URL. All page buttons are button elements not anchor tags so pages 2-N produce no crawlable link. Googlebot never discovers anything beyond the first SSR-rendered 50 jobs. With 50 results per page and potentially hundreds of pages the crawler sees only the first page of the entire listing corpus.
Fix: Replace page-change buttons with Link href pointing to /jobs?page=N or call router.push to write ?page=N to the URL on page button click. The URL must update so each page has a canonical crawlable address. Add rel=next and rel=prev alternates in generateMetadata for ?page= variants.

[CRITICAL] Sort parameter updates the URL but page change does not -- mismatched URL-state model creates a crawl blind spot
Location: app/jobs/JobsPageClient.tsx:236-247 (sort writes URL) | 250-254 (page does not)
Issue: handleSortChange calls router.push so sort is correctly reflected in the URL and triggers server-side re-render. handlePageChange skips router.push entirely. Googlebot crawls page 1 of any sort but pages 2-N of all sort+filter combinations are invisible.
Fix: Mirror the sort-handler pattern inside handlePageChange: read current searchParams, set page=N, call router.push. The useEffect on searchParams already calls fetchJobs so no duplicate fetch occurs.

[CRITICAL] Empty zero-result state is a soft 404 -- HTTP 200 with no-results body and no noindex directive
Location: app/jobs/JobsPageClient.tsx:597-606
Issue: When filters return zero results the page renders No jobs found with HTTP 200. Google treats these as soft 404s and may deindex or demote the URL. No noindex directive is applied for the zero-result case.
Fix: In app/jobs/page.tsx if total === 0 AND hasFilters is true the metadata must include robots:{index:false}. The existing hasFilters guard on line 92 covers this -- confirm it fires when total === 0. Add a visible Clear filters link alongside the no-results message.

---

## HIGH

[HIGH] AI semantic search does not write to the URL -- results are CSR-only with no crawlable address
Location: app/jobs/JobsPageClient.tsx:77-107
Issue: The AI search form submits to /api/jobs/search/semantic and replaces the job list in React state only via setAiResults. The URL never changes. Results cannot be shared or bookmarked. Separately the sidebar filter search uses ?q= via router.push while the AI search bar also lives above the results -- two input surfaces for overlapping use cases with different persistence models will confuse users.
Fix: Clearly separate AI search and filter search as distinct UI affordances with explicit labels. If the AI search bar stays document it as a client-only feature with no crawlability intent. Do not attempt to make semantic vector results crawlable.

[HIGH] H1 is visually hidden via CSS clip -- sends weaker heading signal than a visible heading
Location: app/jobs/JobsPageClient.tsx:287-292
Issue: The H1 Browse PMHNP and Psychiatric Nurse Practitioner Jobs is clamped to 1x1px with overflow:hidden and clip:rect(0,0,0,0). Google may discount off-screen or clipped H1s. The visible above-the-fold content contains no readable heading making the filter sidebar h2 and h3 elements appear structurally orphaned without a parent heading.
Fix: Make the H1 visible at any size above the filter+results layout. The CSS clip pattern is correct only for purely assistive-technology-only labels not for the page primary H1.

[HIGH] generateMetadata noindexes ALL parameterized URLs including pagination -- correct pages are being suppressed
Location: app/jobs/page.tsx:66-98
Issue: hasFilters is Object.keys(params).length > 0 which catches ?page=2 and ?sort=newest as filtered and sets robots:{index:false} for them. If pagination is fixed per the CRITICAL above paginated pages would be noindexed throwing away crawl equity from deep pages.
Fix: Separate the noindex logic. Identify user-filter keys (workMode jobType location q salaryMin postedWithin category specialty experienceLevel cityExact stateCode) separately from navigation keys (page sort). Only noindex user-filter combinations. Paginated pages should be self-canonicalled not canonical to page 1 since each page has distinct content.

[HIGH] ItemList JSON-LD uses raw job ID in URL -- job detail pages are served at slug-based URLs
Location: app/jobs/page.tsx:198
Issue: The schema URL is built as /jobs/JOB_ID but job detail pages are served at /jobs/SLUG where SLUG = slugify(job.title, job.id). URLs in structured data that resolve to 404 fail Google Rich Results validation and forfeit any potential job carousel appearance.
Fix: Import slugify from @/lib/utils and build the schema URL as process.env.NEXT_PUBLIC_BASE_URL + /jobs/ + slugify(job.title, job.id).

[HIGH] No visible breadcrumb rendered on /jobs -- BreadcrumbSchema emits JSON-LD only no visual nav
Location: app/jobs/page.tsx:208-211
Issue: BreadcrumbSchema outputs only a script type=application/ld+json tag. There is no visible nav breadcrumb on the /jobs listing page. The Breadcrumbs component renders both the JSON-LD and the visual nav. Google uses visible breadcrumbs for SERP snippet display and as a page structure signal.
Fix: Replace BreadcrumbSchema with the Breadcrumbs component passing items=[{label:Home href:/},{label:Jobs}] in app/jobs/page.tsx.

[HIGH] Debug console.log left in the production client bundle
Location: app/jobs/JobsPageClient.tsx:34-39
Issue: A console.log block runs on every page load for every user logging job title and date field types to the browser console. It leaks internal field names to scraper authors and adds execution overhead on every mount.
Fix: Remove the useEffect block at lines 32-40 or replace with a logger.debug call gated on process.env.NODE_ENV === development.

---

## MEDIUM

[MEDIUM] Job card link anchor text is title-only -- city and state live only in badge spans
Location: components/JobCard.tsx:84-86 | 173-174 | 397-398
Issue: The h3 in each card carries the job title. Location appears only in a badge span lower in the card. The anchor text signal Google attributes to the card link is dominated by the h3 text. A title like PMHNP Needed - Full Time carries weak topical signal compared to one that includes employer and location.
Fix: Add an aria-label on the outer Link that includes employer and location when available. This improves both accessibility and the anchor text signal Google reads from the card link.

[MEDIUM] useFilterPersistence is a disabled no-op stub -- the hook call in JobsPageClient has no effect
Location: lib/hooks/useFilterPersistence.ts:1-12 | app/jobs/JobsPageClient.tsx:118
Issue: The hook was disabled to fix an infinite loop and never restored. The call at line 118 returns an empty object. Absent filter persistence forces users to re-enter filters on every visit increasing bounce rate signals.
Fix: Remove the useFilterPersistence() call at line 118 since it does nothing or re-implement filter persistence reading localStorage inside useEffect only guarded against SSR hydration mismatch.

[MEDIUM] Filter count sidebar fires a POST to /api/jobs/filter-counts before any user interaction -- waterfall on every page load
Location: components/jobs/LinkedInFilters.tsx:115-137
Issue: fetchCounts fires immediately on mount and re-fires on every searchParams change. The sidebar shows ... in all count badges until the POST resolves. The sidebar count is fetched separately from the SSR initialTotal and can diverge when the ISR cache is up to 60 seconds stale producing a visible count mismatch.
Fix: Pass initialTotal from the server component down as a prop for the initial render. Defer fetchCounts with requestIdleCallback or setTimeout(fetchCounts, 800) so it does not block first paint.

[MEDIUM] Two competing BreadcrumbList JSON-LD components exist in the project -- risk of duplicate schema
Location: components/Breadcrumbs.tsx:16-26 | components/BreadcrumbSchema.tsx:9-24
Issue: Breadcrumbs.tsx emits JSON-LD inline AND renders the visual nav. BreadcrumbSchema.tsx emits JSON-LD only. If both are ever rendered on the same page Google Rich Results Test flags duplicate breadcrumb schema.
Fix: Delete components/BreadcrumbSchema.tsx. Use components/Breadcrumbs.tsx everywhere as the single source for both visual nav and JSON-LD.

[MEDIUM] No title differentiation for paginated deep pages -- identical title on every page number
Location: app/jobs/page.tsx:42-63
Issue: generateMetadata derives title from filters only. /jobs?page=4 has the same title as /jobs?page=1. Once pagination is fixed and deep pages become indexable duplicate titles appear across all paginated variants.
Fix: Append page number to the title for pages greater than 1.

---

## LOW

[LOW] StickyFilterSidebar is visibility:hidden until JavaScript measures layout -- sidebar invisible on initial render
Location: app/jobs/JobsPageClient.tsx:955-957
Issue: The sidebar div starts with visibility:hidden and becomes visible only after requestAnimationFrame resolves the left pixel position. Googlebot rendering with no real layout metrics may compute leftPx=0 and see the sidebar overlapping the main content. Filter labels remain in the DOM so crawlability is not lost but the rendered layout could appear broken to the rendering bot.
Fix: Use CSS position:sticky or a CSS-only fixed sidebar rather than JS-computed pixel positioning.

[LOW] Company logo alt text can render as near-empty string when job.employer is falsy
Location: components/JobCard.tsx:200 | 424
Issue: The alt attribute uses job.employer concatenated with the word logo. If job.employer is empty or undefined the alt resolves to a near-empty string.
Fix: Guard with a ternary: if job.employer then use job.employer + logo otherwise use Employer logo.

[LOW] ?sort=best default is not written to the URL -- intentional but undocumented risks accidental revert
Location: app/jobs/JobsPageClient.tsx:133-135
Issue: When the user selects Best Match params.delete(sort) is called. This is correct canonical URL hygiene but is undocumented. A future developer may fix it by always writing ?sort=best which would bloat the param space and invalidate the noindex logic for all default-sort URLs.
Fix: Add a code comment noting this is intentional: omit ?sort= for the default value to keep the canonical URL clean. The server defaults to best when the param is absent per app/jobs/page.tsx:123.

---

## Verified-Clean

- Canonical tag: /jobs always emits canonical brand.baseUrl/jobs regardless of filter params. app/jobs/page.tsx:88
- robots.txt: /jobs/ is in PUBLIC_ALLOW. Filter parameter variants are not blocked -- noindex handled via meta robots. app/robots.ts:15
- Sitemap: /jobs listed at priority 0.9 changeFrequency hourly latestJobDate as lastModified. Filter URLs not in sitemap. app/sitemap.ts:87
- No infinite scroll: Pagination is discrete button-based -- no IntersectionObserver auto-load.
- ISR revalidation: revalidate=60 -- SSR data refreshes every 60 seconds. app/jobs/page.tsx:10
- SSR with >=10 jobs on first load: Server fetches 50 jobs passed as initialJobs. Googlebot sees all 50 server-side without needing JS execution. app/jobs/page.tsx:149-183
- No faceted nav crawl trap: Filter sidebar links are checkbox onChange handlers calling router.push not crawlable anchor tags. All filtered variants get robots:{index:false}. components/jobs/LinkedInFilters.tsx:140-155
- Meta description length: Default description approximately 148 characters -- within the 160-char SERP cap. app/jobs/page.tsx:45
- OG image: Points to an existing Supabase asset fixed in prior audit. app/jobs/page.tsx:79
- JSON-LD XSS escape: replace on angle brackets applied on ItemList schema output. app/jobs/page.tsx:206
- lang=en on html element: Present. app/layout.tsx:159
- Title template: /jobs uses generateMetadata to override with a full custom title -- template not double-applied. app/layout.tsx:57-60
- robots.txt does not block ?sort= or ?page= params: Correct -- meta robots in generateMetadata is the right mechanism for query-string-level noindex in Next.js.