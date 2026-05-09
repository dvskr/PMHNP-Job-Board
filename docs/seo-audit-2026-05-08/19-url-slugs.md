# URL Slug Structure and Route Consistency Audit

Audit date: 2026-05-08
Scope: every dynamic route segment under app/
Checklist items: 14

---
## CRITICAL

[CRITICAL] C-1  Ingested jobs have NULL slug; canonical URL is constructed on-the-fly from a mutable title
Location: lib/ingestion-service.ts:1255  app/jobs/[slug]/page.tsx:436
Issue: The INSERT path in the ingestion pipeline never writes a slug column. slugify(job.title, job.id)
  is called only in the de-indexing helper (line 1255) to build a removal URL, not during row creation.
  The job-detail page extracts the UUID from the incoming slug (line 342) to look up the row, then emits
  the canonical as the verbatim incoming slug (line 436):
    const canonicalUrl = backtick-https://pmhnphiring.com/jobs/dollar-sign-slash-slug-backtick;
  Result: if the title stored in the DB changes (employer edits, data-quality cleanup, ATS re-push),
  every previously indexed URL recomputes to a different path. Google sees the old slug 404 and must
  re-discover the new one. External ingest jobs (the majority of the index) are all affected.
Fix: Add a one-time migration: UPDATE job SET slug = slugify(title, id) WHERE slug IS NULL.
  Guard slug against future mutation: once written, never overwrite on title update.
  Write the slug column at INSERT time inside ingest-service.
  In app/jobs/[slug]/page.tsx emit canonical from job.slug (post-migration), not the request param.
[CRITICAL] C-2  /new-grad is a real ISR page permanently redirected to /jobs/new-grad;
                both URLs exist and neither self-canonicalizes correctly
Location: next.config.ts:140  app/new-grad/page.tsx:1  app/jobs/new-grad/page.tsx:1
Issue: next.config.ts emits a permanent (308) redirect from /new-grad to /jobs/new-grad.
  app/new-grad/page.tsx still exists as a full rendered route with export const revalidate = 3600
  and its own metadata block. Next.js serves the redirect before the page renders, so /new-grad
  is never actually indexed -- but the metadata block on app/new-grad/page.tsx may emit a
  canonical to /new-grad, splitting the signal.
  Additionally, app/new-grad/page.tsx:344 contains a dead internal link:
    href=/resources/state-licensure-guide/alabama
  /resources/state-licensure-guide/* is confirmed removed in gsc-removal-day3.txt:88-89
  and no matching app/ route exists.
Fix: Delete app/new-grad/page.tsx entirely (the redirect covers all traffic).
  OR consolidate: make /jobs/new-grad the canonical route and remove the redirect.
  In either case, excise all hrefs to /resources/state-licensure-guide/* site-wide.

---

## HIGH
[HIGH] H-1  Job slugs are title-derived and mutable; no immutability guard exists
Location: lib/utils.ts:106  app/api/jobs/post-free/route.ts:321
Issue: slugify(title, id) produces <normalized-title>-<uuid>.
  app/api/jobs/post-free/route.ts:321 writes this slug at INSERT for employer posts.
  No code prevents an employer from editing the job title after posting, and no migration
  locks the slug column once written. A title edit produces a new slug on the next recompute,
  silently breaking inbound links and any Google-indexed URL.
Fix: Add an application-layer guard: if job.slug IS NOT NULL, skip slug computation in the update path.
  In the employer dashboard title-edit handler, do not recompute slug.
[HIGH] H-2  normalizeCompanyName produces space-containing output, making company
            URLs percent-encoded (/companies/life%20stance)
Location: lib/company-normalizer.ts:167
Issue: Line 167 collapses hyphens to SPACES:
    normalized = normalized.replace(/-+/g, space);
  The function never converts the result to kebab-case.
  Life Stance Health normalizes to life stance (with a literal space).
  When used as a route segment this produces /companies/life%20stance, which:
    1. Looks broken to users and Googlebot in raw form.
    2. Creates two addressable forms: /companies/life%20stance and /companies/life-stance
       if any code path converts differently.
    3. Canonical URLs written with the space form may not match hrefs written with the hyphen form.
Fix: After line 167, add:
    normalized = normalized.trim().replace(/\s+/g, '-');
  Audit all company route hrefs and canonical tags to confirm consistent kebab form.
[HIGH] H-3  Dead internal links to /resources/state-licensure-guide/* on three rendered pages
Location: app/jobs/metro/[slug]/page.tsx:348
           app/jobs/city/[slug]/page.tsx:850
           app/new-grad/page.tsx:344
Issue: All three pages link to /resources/state-licensure-guide/stateSlug or /alabama.
  gsc-removal-day3.txt:88-89 confirms these URLs were submitted for removal.
  No app/resources/state-licensure-guide/ route exists in the file tree.
  Googlebot following these links receives a 404, wastes crawl budget, and may demote
  the linking pages.
Fix: Remove or replace all three hrefs immediately.
  If a replacement resource page is planned, redirect the old path first.
  Short-term: remove the anchor elements entirely from the three pages.
[HIGH] H-4  State route accepts 2-letter code without redirect to canonical full-name slug;
            two URLs self-declare as canonical for the same state
Location: app/jobs/state/[state]/page.tsx:128-161  :388
Issue: parseStateParam() accepts ny, new-york, and New York all as valid inputs.
  Line 388 emits:
    canonical: backtick-https://pmhnphiring.com/jobs/state/dollar-sign-stateParam-backtick;
  where stateParam is the raw incoming segment.
  /jobs/state/ny and /jobs/state/new-york therefore both render full content AND both
  self-declare as canonical -- to different URLs. Google must choose one; it will
  likely split link equity across both.
Fix: In parseStateParam(), after identifying the canonical state object, issue a 301 redirect
  to the full-name kebab form if the incoming param is a 2-letter code.
  Change line 388 to always use stateToSlug(state.name), never the raw param.
  Guard:
    if (stateParam !== stateToSlug(resolved.name)) {
      redirect(slash-jobs-slash-state-slash + stateToSlug(resolved.name), 301);
    }
[HIGH] H-5  /jobs/va and /jobs/veterans are near-identical pages targeting the same
            keyword cluster with no cross-canonical or consolidation
Location: app/jobs/va/page.tsx  app/jobs/veterans/page.tsx
Issue: Both pages target PMHNP jobs for veterans and the VA system.
  Separate pages with near-identical content and overlapping keyword targets constitute
  keyword cannibalization: Google must decide which to rank and frequently ranks neither well.
  Neither page references the other via canonical or rel=alternate.
Fix: Pick one as the primary URL (recommend /jobs/veterans -- more descriptive, less ambiguous
  than /jobs/va which could mean Virginia).
  301 redirect /jobs/va to /jobs/veterans.
  Ensure /jobs/veterans canonical points to itself.
  If the VA-system angle and the general-veterans angle are genuinely distinct, differentiate
  the content meaningfully enough to justify two pages.

[HIGH] H-6  JobCard and RelatedJobs ignore job.slug; recompute slug from title on every render,
            emitting links that diverge from the canonical slug stored in DB
Location: components/JobCard.tsx:84  components/RelatedJobs.tsx:59
Issue: Both components call slugify(job.title, job.id) locally instead of using job.slug
  from the API response. For employer-posted jobs where the DB slug was written at INSERT,
  this recomputation produces the same result -- as long as the title has not changed.
  For ingested jobs where slug IS NULL, this is the only slug source.
  After the C-1 fix (slug column populated for all jobs), these components will continue
  to diverge unless updated to use job.slug.
Fix: After C-1 migration: change both components to const jobUrl = slash-jobs-slash + job.slug;
  Add job.slug to the API response shape and Supabase select list.

---

## MEDIUM
[MEDIUM] M-1  stateToSlug() is duplicated: defined in lib/pseo/setting-state-config.ts
              and re-implemented inline in three other locations
Location: lib/pseo/setting-state-config.ts:48-50
           app/jobs/state/[state]/page.tsx (inline)
           lib/pseo/setting-state-template.tsx (inline)
Issue: Three separate places apply .toLowerCase().replace(/\s+/g, dash) to a state name.
  If behavior diverges (one strips punctuation, another does not) state slugs across
  sitemap, canonical tags, and internal links will not match.
Fix: Export stateToSlug from lib/utils.ts or a dedicated lib/slug-utils.ts.
  Import and use it everywhere a state name is converted to a slug segment.

[MEDIUM] M-2  Breadcrumb component emits 2-letter state code in some city-page paths
              rather than the full-name slug
Location: components/Breadcrumbs.tsx
Issue: City pages use the city-stateCode slug format (e.g., new-york-ny).
  The breadcrumb for the state level in the city page hierarchy links to /jobs/state/ny
  rather than /jobs/state/new-york.
  After H-4 is fixed this will resolve via redirect, adding an unnecessary redirect hop
  on every city-page breadcrumb click.
Fix: Derive the state breadcrumb href using stateToSlug(resolvedStateName) rather than
  the 2-letter code extracted from the city slug.

[MEDIUM] M-3  Slug length is uncapped; very long job titles produce slugs over 75 chars
              before the UUID suffix is appended
Location: lib/utils.ts:106-116
Issue: slugify() does no truncation. A title like
  Psychiatric Mental Health Nurse Practitioner PMHNP Outpatient Telehealth Remote Opportunity
  Full Time Benefits
  normalizes to 110 chars before the 37-char UUID suffix yields a 148-char URL segment.
  Long URLs are harder to share and carry stop words diluting keyword signal.
Fix: Truncate the title slug to 60 chars before appending the UUID:
    const slug = title.toLowerCase()...trim().slice(0, 60).replace(/-$/, '');
    return slug + '-' + id;
  Apply the same cap in app/api/jobs/post-free/route.ts:321.

[MEDIUM] M-4  Metro/city priority logic is undocumented and untested; a city slug
              matching a metro slug silently redirects with no canonical fallback
Location: app/jobs/city/[slug]/page.tsx:287-291
Issue: The city page fires a redirect to the metro page if a metro record matches
  the incoming slug. If a metro is later removed from metro-data.ts, the redirect
  disappears and the city page renders at the same slug -- with no canonical pointing
  to the former metro URL, potentially splitting link equity.
Fix: Add a JSDoc comment on lines 287-291 explaining the priority rule.
  Add an integration test: request /jobs/city/new-york-ny, assert 301 to metro URL.
  Log or alert when a metro slug is removed so the city canonical can be audited.

---

## LOW
[LOW] L-1  Numeric slug 1099 is acceptable; no action needed
Location: app/jobs/category/[category]/page.tsx (category slug: 1099)
Issue: The 1099 category slug is a valid identifier for contractor/1099 roles.
  It is numeric-only, which is unusual, but it matches the tax-form shorthand universally
  understood in the US, appears consistently in sitemap, footer, and robots references,
  and has no collision with any other route segment. No change required.

[LOW] L-2  app/[indexnow]/route.ts uses a dynamic segment at root level creating an
           ambiguous route shadow
Location: app/[indexnow]/route.ts
Issue: A dynamic segment at the root catches any unmatched single-segment path.
  If a future top-level page (e.g., /employers, /pricing) is added without a corresponding
  static route, it will silently hit this handler instead of 404ing.
  This is a maintenance risk, not a current indexing problem.
Fix: Rename to app/indexnow/route.ts (static segment) if the path is always literally /indexnow.
  If it must be dynamic, add an explicit allowlist check and return 404 for unrecognized values.

---

## Verified Clean
[VC-1]  Slug case: slugify() lowercases all output. Middleware enforces lowercase on incoming
         requests via 301. No mixed-case slug reachable in production.

[VC-2]  UUID anchoring: app/jobs/[slug]/page.tsx extracts UUID via regex regardless of the
         title prefix. Any incoming slug with the correct UUID resolves correctly. Old inbound
         links survive a title change at the resolver level (though canonical emission is still
         wrong per C-1).

[VC-3]  Trailing slash: middleware.ts:642-645 enforces no trailing slash via 301. next.config.ts
         does not set trailingSlash:true. Policy is consistent site-wide.

[VC-4]  UTM stripping: middleware.ts:668-679 strips utm_* params via 301 before the page
         renders. Canonical tags never see UTM noise.

[VC-5]  City slug format: buildCitySlug() in app/jobs/city/[slug]/page.tsx consistently
         produces city-kebab-stateCode. lib/metro-data.ts uses the same convention.
         Sitemap city entries match.

[VC-6]  Slug uniqueness: slugify() appends the UUID, guaranteeing global uniqueness even when
         two jobs share an identical title. No -1/-2 suffix needed or used.

[VC-7]  Category slugs: locum-tenens and lgbtq are stable kebab identifiers used consistently
         in sitemap, footer links, and route params. No drift found.

[VC-8]  Stop words in slugs: slugify() does not strip stop words, but the UUID suffix ensures
         uniqueness so stop-word collisions are not a routing problem. Acceptable as-is.

[VC-9]  Reserved slug /companies/new: no app/companies/new/page.tsx exists. The dynamic
         [slug] handler would match /companies/new if a company were normalised to new.
         normalizeCompanyName strips generic single words before this point.
         Risk is theoretical; no current collision found.

[VC-10] Redirect chain length: all next.config.ts redirects are single-hop.
         /new-grad -> /jobs/new-grad is one hop. No chains longer than two hops found.

---

## Priority Order for Engineers

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | C-1  slug migration + insert-time write | M | Stops canonical churn across entire index |
| 2 | H-6  JobCard/RelatedJobs use job.slug | S | Consistent hrefs site-wide post-migration |
| 3 | H-4  state 2-letter code redirect | S | Eliminates split canonical on 50 state pages |
| 4 | H-3  remove dead licensure links | S | Stops crawl budget leak on 3 page types |
| 5 | H-2  company normalizer kebab fix | S | Removes percent-encoded company URLs |
| 6 | H-5  va/veterans consolidation | S | Resolves keyword cannibalization |
| 7 | C-2  delete app/new-grad/page.tsx | S | Removes zombie route behind 308 redirect |
| 8 | H-1  slug immutability guard | S | Prevents future canonical churn |
| 9 | M-3  slug length cap at 60 chars | S | Cleaner URLs, minor crawl efficiency gain |
| 10 | M-1  stateToSlug dedup to shared util | S | Prevents future slug drift |
| 11 | M-2  breadcrumb state href fix | S | Removes redirect hop on every city breadcrumb |
| 12 | M-4  metro/city priority doc + test | S | Operational safety net |
| 13 | L-2  indexnow static route | S | Maintenance hygiene |
