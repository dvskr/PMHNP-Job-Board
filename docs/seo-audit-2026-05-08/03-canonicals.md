# Canonical Tag Audit -- PMHNP Hiring
**Date:** 2026-05-08  **Branch:** dev

---

## Scope

All alternates.canonical, generateMetadata, and export const metadata declarations in app/**/page.tsx, app/**/layout.tsx, lib/pseo/category-city-template.tsx, lib/pseo/setting-state-template.tsx, middleware.ts, config/brand.ts.

---

## Verified-Clean

- config/brand.ts:36 -- baseUrl=https://pmhnphiring.com (HTTPS, no www, no trailing slash). Used as template-literal root on most pages.
- middleware.ts:642-644 -- 301 strips trailing slash from all non-root paths. All declared canonicals omit trailing slash.
- middleware.ts:651-653 -- 301 lowercases uppercase paths. All declared canonicals are lowercase.
- middleware.ts:659-662 -- 301 removes ?page=1. All paginated pages canonical to page-1 URL without param.
- app/jobs/[slug]/page.tsx:436,445,464 -- canonicalUrl and openGraph.url are the same literal value. No mismatch on job detail pages.
- lib/pseo/category-city-template.tsx:913-915 -- thin p1 pages canonical to parent category; high-quality p1 self-canonical; high-quality p>1 canonical to page-1 same city. Internally consistent.
- lib/pseo/setting-state-template.tsx:161-163 -- always self-canonical to page-1 path; paginated views get noindex,follow.
- app/employer/layout.tsx -- robots: noindex,nofollow. No canonical risk on employer portal.

---

## Findings

---

[CRITICAL] metadataBase resolves to localhost in non-production environments
Location: app/layout.tsx:55
Issue: metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl). Both .env:6 and .env.local:5 set NEXT_PUBLIC_BASE_URL=http://localhost:3000. Next.js uses metadataBase to resolve relative OG image paths. The pSEO templates use relative paths like /api/og/city?... for og:image. In any Vercel preview deployment inheriting the localhost value, every og:image on the ~2000+ pSEO pages resolves to http://localhost:3000/api/og -- a broken URL. Canonical tags are hardcoded absolute strings and are not affected, but broken og:image in previews suppresses social-share rendering and may affect GSC rich snippets.
Fix: Set NEXT_PUBLIC_BASE_URL=https://pmhnphiring.com in Vercel production env vars. For preview deploys use VERCEL_URL. Add a CI assertion.

---

[CRITICAL] Root layout openGraph.url = slash -- every page without its own openGraph.url inherits og:url = homepage
Location: app/layout.tsx:82
Issue: openGraph: { url: "/" } in the root layout. Next.js merges this into every page that does not set its own openGraph.url. Affected indexable pages: /about, /for-job-seekers, /for-employers, /resources/*, /faq, /pricing, /contact, /new-grad, /salary-guide, /blog, /companies, and all pSEO pages that omit openGraph.url. All emit og:url=https://pmhnphiring.com/ -- mismatching their link[rel=canonical] and actual URL. Facebook and LinkedIn use og:url as the share deduplication key so every social share of /about accrues to the homepage share count. The job detail page correctly overrides openGraph.url and is unaffected.
Fix: Remove url: "/" from the openGraph block in app/layout.tsx:82. Pages without an explicit openGraph.url will emit no og:url tag, which is preferable to the wrong value. Key social-traffic pages (salary guide, for-job-seekers, pricing) should add explicit openGraph.url in their own generateMetadata.

---

[HIGH] /login and /signup have no canonical declaration
Location: app/login/page.tsx:7-10, app/signup/page.tsx:7-10
Issue: Both pages export only title and description. No alternates.canonical, no robots directive. Both are publicly crawlable. The middleware strips utm_* and page=1 but not ?redirectTo. Without a self-canonical Google can pick a parameterized variant like /login?redirectTo=%2Fdashboard as the canonical URL.
Fix: Add alternates: { canonical: brand.baseUrl + "/login" } and the same for /signup. If these should not be indexed add robots: { index: false, follow: true }.

---

[HIGH] /settings page has no metadata export
Location: app/settings/page.tsx:1-2
Issue: The page is a use client component with no generateMetadata or metadata export. Falls back to root layout title template. No canonical tag. No robots directive. Auth is checked client-side via useEffect (Supabase), not server-enforced -- Googlebot can reach the page without a session.
Fix: Create app/settings/layout.tsx with: export const metadata = { robots: { index: false, follow: false }, alternates: { canonical: brand.baseUrl + "/settings" } }.
