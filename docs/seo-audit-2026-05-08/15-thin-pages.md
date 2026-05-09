# Thin-Content Audit — PMHNP Hiring
**Date:** 2026-05-08  
**Scope:** 19 page routes audited for thin content, missing schema, FAQ gaps, boilerplate duplication, and indexability errors  
**Auditor:** SEO specialist agent (claude-sonnet-4-6)

---

## Word-Count Table

| Route | File | Est. Words (rendered) | FAQ | Schema types present | Index? |
|---|---|---|---|---|---|
| /about | app/about/AboutClient.tsx | ~620 | None | BreadcrumbList | Yes |
| /contact | app/contact/page.tsx | ~320 | 6 items (accordion, no JSON-LD) | BreadcrumbList | Yes |
| /salary-guide | app/salary-guide/page.tsx | ~1,800+ | 5 items + FAQPage JSON-LD | FAQPage, Article, WebPage, BreadcrumbList | Yes |
| /for-job-seekers | app/for-job-seekers/page.tsx | ~650 | None | BreadcrumbList, VideoJsonLd | Yes |
| /for-employers | app/for-employers/page.tsx | ~550 | None | BreadcrumbList | Yes |
| /pricing | app/pricing/page.tsx | ~480 | 9 items (no FAQPage JSON-LD) | BreadcrumbList | Yes |
| /new-grad | app/new-grad/page.tsx | ~1,400+ | 6 items + FAQPage JSON-LD | FAQPage, BreadcrumbList | Yes |
| /job-alerts | app/job-alerts/page.tsx | ~240 | None | BreadcrumbList | Yes (WRONG) |
| /jobs/locations | app/jobs/locations/page.tsx | ~160 info section | None | CollectionPage, ItemList, BreadcrumbList | Yes |
| /companies | app/companies/page.tsx | ~60 | None | BreadcrumbList | Yes (WRONG) |
| /companies/[slug] | app/companies/[slug]/page.tsx | 0-80 variable | None | Organization (partial) | Yes |
| /saved | app/saved/page.tsx | ~100 | None | None | Yes (WRONG) |
| /security | app/security/page.tsx | ~700 | None (implicit only) | None | Yes |
| /sub-processors | app/sub-processors/page.tsx | ~200 | None | None | Yes (WRONG) |
| /data-request | app/data-request/page.tsx | ~150 | None | None | Yes (WRONG) |
| /do-not-sell | app/do-not-sell/page.tsx | ~200 | None | None | Yes (WRONG) |
| /privacy | app/privacy/page.tsx | ~1,200+ | None | None | Yes + sitemap |
| /terms | app/terms/page.tsx | ~900+ | None | None | Yes + sitemap |
| /post-job | app/post-job/page.tsx | ~180 (labels only) | None | BreadcrumbList | Yes |
---

## Findings

### CRITICAL

    [CRITICAL] /job-alerts is a bare form with ~240 rendered words
    Location: app/job-alerts/page.tsx:1
    Issue: The page is a pure client-side subscription form. Nearly all visible text is UI
    labels (state dropdown, job-type checkboxes, submit button). CategoryHero stats are
    decorative numbers. Google sees roughly 240 words of meaningful content with no prose
    explaining what PMHNP job alerts are, how they work, or who they are for. The
    helpful-content classifier flags pages where the primary purpose is data collection
    with no informational value to the reader. The page is currently indexed.
    Fix: Either (a) add a 300-400 word editorial section above the form explaining what
    the alert covers, delivery frequency, who should subscribe, and what job types trigger
    it; or (b) add robots: { index: false, follow: false } to a metadata export and remove
    from the sitemap. Option (a) is preferred if this URL is worth ranking for branded
    job-alert queries.

    [CRITICAL] /companies index page has ~60 editorial words — pure grid of company cards
    Location: app/companies/page.tsx:1
    Issue: The hero renders a single sentence of subtext. The entire body is a card grid
    with company names and active-job counts fetched from the database. No editorial
    introduction, no explanation of why PMHNP practices hire there, no FAQ, no
    CollectionPage schema. Google cannot determine the purpose or authority of this page.
    At roughly 60 editorial words it is well below the 250-word floor that is a soft
    thin-content signal.
    Fix: Add a 200-300 word editorial introduction above the grid covering: what types of
    employers hire PMHNPs, why these companies are included, and what a PMHNP candidate
    should expect. Add CollectionPage + ItemList JSON-LD. Alternatively noindex if the
    page serves no organic search purpose.
---

### HIGH

    [HIGH] /about has ~620 words but no FAQ and no Organization or AboutPage JSON-LD
    Location: app/about/AboutClient.tsx:1
    Issue: 620 words is above the thin-content floor but the page lacks structured data
    that Google uses to understand an organization page. No Organization schema (name,
    url, logo, foundingDate, areaServed). No AboutPage schema. The page implicitly covers
    common questions about the site but has no FAQ section. The creator attribution block
    (lines 156-176) renders entity name and address as plain text that Google cannot parse
    as structured data.
    Fix: (1) Add an Organization JSON-LD block in the server wrapper that wraps
    AboutClient.tsx, including name, url, logo, sameAs, and areaServed.
    (2) Add an AboutPage JSON-LD block. (3) Add a 3-item FAQ section below the existing
    content covering the most common questions about the site.

    [HIGH] /for-job-seekers has ~650 words but no FAQ and weak schema (BreadcrumbList + VideoJsonLd only)
    Location: app/for-job-seekers/page.tsx:1
    Issue: The comparison table (comparisonRows, lines 49-60) and feature cards contain
    real content but there is no editorial FAQ. The HomepageHero and FeaturedJobsSection
    components are reused from the homepage, meaning Google sees similar markup on two
    different URLs — a duplication signal that reduces the perceived uniqueness of both.
    Fix: (1) Add a 4-6 item FAQ section with FAQPage JSON-LD covering: how alerts work,
    whether the board is free for job seekers, what PMHNP-specific jobs are listed, how
    to create a profile, and salary data availability. (2) Replace or differentiate the
    FeaturedJobsSection so the hero copy is unique to this page.

    [HIGH] /for-employers has ~550 words but no FAQ and no Service schema
    Location: app/for-employers/page.tsx:1
    Issue: The EmployerHowItWorks component (line 166) is shared from the homepage. The
    comparison table is a second copy of the identical comparisonRows array used in
    for-job-seekers and pricing. No FAQ. No Service schema even though this page describes
    a paid service offering with pricing signals.
    Fix: (1) Add a 4-6 item employer FAQ (pricing, payment methods, how applicants are
    screened, turnaround, refund policy). (2) Add a Service or Product JSON-LD block with
    name, description, and provider. (3) Differentiate the comparison table rows from the
    job-seeker and pricing versions — they should not be identical arrays.

    [HIGH] /companies/[slug] renders 0-80 words for the majority of auto-ingested companies
    Location: app/companies/[slug]/page.tsx:193
    Issue: Company description is conditionally rendered at line 193 as
    {company.description && <p>{company.description}</p>}
    Auto-ingested companies sourced from job feeds rarely have a description field
    populated. The rendered page for most companies is: company name, logo, job count
    badge, and a grid of job cards. The meta description fallback is the boilerplate
    string Browse open PMHNP positions at [Company] — identical across all company
    pages except for the name token. The Organization JSON-LD (lines 282-293) has no
    address, numberOfEmployees, or sameAs fields.
    Fix: (1) Source or generate a 60-120 word description for each company during ingest.
    A template like [Company] is a [setting type] practice operating in [state] with
    [N] active PMHNP positions is better than an empty field. (2) Fall back to a
    generated description when description is null rather than rendering nothing.
    (3) Enrich the Organization JSON-LD with location and sameAs where available.
    (4) Confirm that notFound() at line 111 fires for all companies with 0 active jobs.
---

### MEDIUM

    [MEDIUM] /contact has no ContactPage or FAQPage JSON-LD schema
    Location: app/contact/page.tsx:1
    Issue: The page has a 6-item FAQ accordion and ~320 words, which is adequate content.
    However no ContactPage schema is emitted. The page lists only an email address
    (support@pmhnphiring.com) with no phone or mailing address. The 6 FAQ items are
    rendered as a DOM accordion but are not machine-readable for FAQ rich results.
    Fix: (1) Add a ContactPage JSON-LD block with name, url, and contactPoint (type:
    customer service, email, areaServed: US, availableLanguage: English). (2) Add a
    FAQPage JSON-LD block mirroring the 6 existing FAQ accordion items.

    [MEDIUM] /pricing has 9-item FAQ but no FAQPage JSON-LD and no Product or Offer schema
    Location: app/pricing/page.tsx:51
    Issue: The page exposes an explicit price via config.postingPrice but emits no Product
    or Offer structured data. Google cannot surface pricing in rich results. The 9-item
    faqs array (lines 51-61) is rendered in the DOM but no FAQPage JSON-LD is emitted,
    so the FAQ is not eligible for FAQ rich results. The comparison table (lines 38-49)
    is the third copy of the identical comparisonRows pattern across for-employers,
    for-job-seekers, and pricing.
    Fix: (1) Add a FAQPage JSON-LD block mirroring the 9 existing faqs items.
    (2) Add a Product + Offer JSON-LD block with name, price (config.postingPrice),
    priceCurrency: USD, and seller pointing to the Organization block.
    (3) Differentiate the comparison table content from the other two pages.

    [MEDIUM] /jobs/locations info section is ~160 words of generic copy
    Location: app/jobs/locations/page.tsx:509
    Issue: The info section (lines 509-547) contains boilerplate text along the lines of
    Each state offers unique opportunities for psychiatric nurse practitioners. The state
    diorama cards and city grid are data-driven and useful, but the editorial prose is
    thin and generic. No FAQ section.
    Fix: (1) Replace the generic info section with 300+ words of specific, state-level
    guidance and link to the practice authority breakdown on /new-grad for depth.
    (2) Add a 4-item FAQ: which states have the most PMHNP jobs, full practice authority
    states list, telehealth licensing reciprocity, and highest-paying states.
    (3) Add FAQPage JSON-LD for those items.

    [MEDIUM] /privacy and /terms are included in sitemap.ts at priority 0.3
    Location: app/sitemap.ts:96-97
    Issue: Legal/policy pages appear in the XML sitemap. Including them wastes crawl
    budget and signals to Google that they are content worth ranking, which they are not.
    Neither has a noindex directive.
    Fix: Remove the /privacy and /terms entries from sitemap.ts. The pages can remain
    indexed (Google will find them via footer links) but they do not need to be in the
    sitemap priority queue.

    [MEDIUM] Identical comparisonRows array duplicated verbatim across three page files
    Location: app/for-employers/page.tsx:49, app/for-job-seekers/page.tsx:49, app/pricing/page.tsx:38
    Issue: All three pages define an identical comparisonRows constant with the same 10
    feature rows comparing PMHNP Hiring vs Indeed vs LinkedIn. Google evaluates uniqueness
    of page content relative to other pages on the same site. Three pages with nearly
    identical comparison tables, similar CTA copy, and shared components reduce the
    perceived uniqueness of each page.
    Fix: (1) Extract a shared COMPARISON_ROWS constant to lib/content/comparison.ts and
    import it in all three pages (code quality fix). (2) More importantly, differentiate
    the table copy per page: for-job-seekers rows should focus on candidate-facing
    features; for-employers on employer-facing features; pricing on value-for-money.
---

### LOW

    [LOW] /security has ~700 words but no FAQPage JSON-LD despite natural FAQ structure
    Location: app/security/page.tsx:1
    Issue: The security page has sufficient word count and verifiable claims. The section
    headers (data storage, encryption, access controls, incident response, audits) map
    cleanly to FAQ items but no FAQPage JSON-LD is emitted. Missed opportunity for FAQ
    rich results on security-related queries.
    Fix: Add a 4-5 item FAQPage JSON-LD block using the existing H2/H3 section headers
    as question text. No prose changes required.

    [LOW] /sub-processors is explicitly indexed (robots: index: true) but has no search value
    Location: app/sub-processors/page.tsx:11
    Issue: A vendor sub-processor list is a legal compliance artifact, not a content page.
    Currently set to robots: { index: true, follow: true } at line 11. Google may crawl
    and index it, but it provides no ranking value and wastes crawl budget.
    Fix: Change robots to { index: false, follow: false } at app/sub-processors/page.tsx:11
    and remove from sitemap if present.

    [LOW] /saved is indexed (inherits root default) but content is 100% client-rendered
    Location: app/saved/page.tsx:1
    Issue: The saved-jobs page is a pure client component. Googlebot cannot execute the
    client-side data fetch. What Google sees is a page with roughly 100 words (the page
    header and empty-state message) and no job content. There is no robots metadata
    export so the page inherits index: true from the root layout.
    Fix: Add export const metadata = { robots: { index: false, follow: false } } to a
    server wrapper above the client component, or add a layout.tsx in app/saved/ that
    exports the noindex metadata.

    [LOW] /data-request and /do-not-sell are pure client components with no noindex directive
    Location: app/data-request/page.tsx:1, app/do-not-sell/page.tsx:1
    Issue: Both are CCPA/GDPR compliance forms. Neither exports a metadata object (they
    are pure client components). They inherit index: true from the root layout. These
    pages serve a legal function, not an SEO function, and should not consume crawl budget.
    Fix: For each page, extract a thin server wrapper that exports:
      export const metadata = { robots: { index: false, follow: false } }
    Then render the existing client component as a child of that wrapper.

---

## Boilerplate Duplication Summary

| Pattern | Files | Severity |
|---|---|---|
| Identical comparisonRows (10-row table, 3 columns, identical text) | for-employers, for-job-seekers, pricing | MEDIUM |
| CTA card text reused verbatim | for-employers, pricing | LOW |
| HomepageHero component reused without differentiation | for-job-seekers, homepage | LOW |
| EmployerHowItWorks component shared from homepage | for-employers, homepage | LOW |
| Boilerplate company meta description (token-substituted string) | All /companies/[slug] pages | HIGH |

---

## Indexability Errors Summary

| Route | Current state | Should be | Priority |
|---|---|---|---|
| /job-alerts | index, follow | noindex OR add editorial content | CRITICAL |
| /companies | index, follow | Add editorial content OR noindex | CRITICAL |
| /saved | index (inherited) | noindex, follow | LOW |
| /sub-processors | index: true (explicit) | noindex, follow | LOW |
| /data-request | index (inherited) | noindex, follow | LOW |
| /do-not-sell | index (inherited) | noindex, follow | LOW |
| /privacy | index + in sitemap | Remove from sitemap | MEDIUM |
| /terms | index + in sitemap | Remove from sitemap | MEDIUM |

---

## Verified Clean

| Route | Reason |
|---|---|
| /salary-guide | FAQPage + Article + WebPage JSON-LD, real Prisma data, ~1,800 words, 5 FAQ items with JSON-LD |
| /new-grad | FAQPage JSON-LD, 6 FAQ items, ~1,400 words, step-by-step guide, salary tables, fellowship directory |
| /job-alerts/confirmed | Correctly noindexed at app/job-alerts/confirmed/page.tsx:9 |

---

## Priority Action Queue (engineer-ready)

| Priority | File | Change |
|---|---|---|
| 1 | app/job-alerts/page.tsx | Add 300-word editorial intro above form OR add noindex metadata export |
| 2 | app/companies/page.tsx | Add editorial intro + CollectionPage/ItemList JSON-LD OR noindex |
| 3 | app/companies/[slug]/page.tsx:193 | Generate fallback description for null company.description in ingest |
| 4 | app/about/AboutClient.tsx | Add Organization + AboutPage JSON-LD in server wrapper |
| 5 | app/for-job-seekers/page.tsx | Add 4-6 item FAQ section + FAQPage JSON-LD |
| 6 | app/for-employers/page.tsx | Add 4-6 item FAQ section + Service/Product JSON-LD |
| 7 | app/pricing/page.tsx:51 | Add FAQPage JSON-LD for existing 9 FAQ items + Product/Offer JSON-LD |
| 8 | app/contact/page.tsx | Add ContactPage + FAQPage JSON-LD |
| 9 | app/sitemap.ts:96-97 | Remove /privacy and /terms entries |
| 10 | app/sub-processors/page.tsx:11 | Change robots to { index: false, follow: false } |
| 11 | app/saved/page.tsx | Add server wrapper with noindex metadata export |
| 12 | app/data-request/page.tsx | Add server wrapper with noindex metadata export |
| 13 | app/do-not-sell/page.tsx | Add server wrapper with noindex metadata export |
| 14 | app/jobs/locations/page.tsx:509 | Replace generic info section with 300+ specific words + 4-item FAQ |
| 15 | app/security/page.tsx | Add FAQPage JSON-LD mirroring existing H2/H3 section headers |