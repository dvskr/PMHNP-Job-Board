# CWV & SEO Performance Audit — 2026-05-08

Static analysis of Core Web Vitals and SEO-impacting performance across the PMHNP Job Board Next.js codebase.

---

## Summary Table

| Severity | Count | Areas |
|----------|-------|-------|
| CRITICAL | 2 | Job detail hero wrapped in AnimatedContainer delay; blog force-dynamic defeats ISR |
| HIGH | 5 | CategoryHero missing `sizes` prop; `'use client'` on HomepageHero wrapping LCP image; JobsPageClient is fully client-side; debug console.log in production bundle; RelatedJobs/JobCard vanilla `<img>` |
| MEDIUM | 4 | CookieConsent 1500ms delay still causes late layout shift; PushNotificationPrompt 20s timer fires SW register on every page load; getRelatedJobs runs up to 4 sequential DB queries; `<img>` tags in dashboard/employer flows |
| LOW | 3 | CategoryHero breadcrumbs render text-only spans (not links); framer-motion domAnimation pulled into hero bundle; /jobs revalidate=60 causes cold ISR cache misses |
| Verified-clean | 8 | Font loading; GA script strategy; consent-gated telemetry; BottomNav SSR fix; job detail ISR (revalidate=3600); pSEO pages ISR; homepage LCP image (priority + fetchPriority + sizes); skip-to-content link |

---

## CRITICAL

### C-1 — Job detail hero h1 + header card wrapped in AnimatedContainer with delay=0 but 'use client' boundary

**File:** `app/jobs/[slug]/page.tsx:708`, `components/ui/AnimatedContainer.tsx:1`

`AnimatedContainer` is a `'use client'` component. The very first above-the-fold card on the job detail page — containing the `<h1>` job title, employer logo, salary and badges — is wrapped in:

```tsx
<AnimatedContainer animation="fade-in-up" delay={0}>
```

Because `AnimatedContainer` is `'use client'`, React must hydrate it before the CSS animation class becomes active. Until hydration, the content is invisible (opacity: 0 via the CSS animation class `animate-fade-in-up`). This delays LCP paint on the most crawled page type on the site. Even with `delay={0}`, the `'use client'` wrapper introduces a hydration gap.

**Impact:** LCP on `/jobs/[slug]` pages is gated behind JS hydration, not paint. This is a direct ranking factor impact on thousands of individual job URLs.

**Fix:** For the above-the-fold header card (the first `AnimatedContainer` in the job detail), replace with a plain `<div>`. Use CSS `@keyframes` with `animation-fill-mode: both` baked into the stylesheet instead. Keep `AnimatedContainer` only for below-fold cards where the delay is intentional.

---

### C-2 — `blog/[slug]/page.tsx` uses `force-dynamic` — every blog page is SSR on every request

**File:** `app/blog/[slug]/page.tsx:24`

```ts
export const dynamic = 'force-dynamic';
```

`app/blog/page.tsx` also has `force-dynamic`. Blog content is editorial — it changes rarely. `force-dynamic` disables ISR entirely, meaning every Googlebot request for every blog post hits the origin server and database. This:

1. Adds server response time to TTFB for all blog crawls.
2. Eliminates any ISR cache hit — every request is a full SSR round-trip through Supabase.
3. Creates crawl budget pressure: Googlebot must wait for dynamic server response on each blog URL.

**Impact:** Blog pages are high-authority content used for internal linking from pSEO pages. Slow TTFB from SSR suppresses their crawl frequency and PageSpeed score.

**Fix:** Change to `export const revalidate = 3600;` (or `86400` for editorial content). Blog posts do not need per-request freshness — they are written once. Remove `force-dynamic` from both `app/blog/page.tsx` and `app/blog/[slug]/page.tsx`.

---

## HIGH

### H-1 — CategoryHero `<Image>` missing `sizes` prop — Next.js serves wrong srcset breakpoint

**File:** `components/CategoryHero.tsx:121-128`

```tsx
<Image
  src={heroImage}
  alt={heroAlt}
  width={560}
  height={560}
  priority
  style={{ width: '100%', height: '100%', objectFit: 'contain', ... }}
/>
```

The `sizes` prop is absent. Without `sizes`, Next.js defaults to `100vw` when a `style={{ width: '100%' }}` is present, causing it to serve a 1920px-wide image on mobile. The `cath5-photo` container is `height: clamp(260px, 28vw, 380px)` and at most half the viewport width (the layout is a 1.5fr / 1fr grid). A correct `sizes` attribute would be something like `(max-width: 900px) 100vw, 45vw`. Without it, mobile devices download ~2-4x the necessary image bytes, directly harming LCP on every pSEO category page.

**Impact:** Every `/jobs/[setting]/[state]`, `/jobs/[setting]`, and `/jobs/locations` page serves an oversized LCP image to mobile — the dominant crawl surface in this pSEO architecture.

**Fix:**
```tsx
<Image
  src={heroImage}
  alt={heroAlt}
  width={560}
  height={560}
  priority
  sizes="(max-width: 900px) 100vw, 45vw"
  style={{ width: '100%', height: '100%', objectFit: 'contain', ... }}
/>
```

---

### H-2 — HomepageHero is `'use client'` — LCP image is painted by a client component

**File:** `components/HomepageHero.tsx:1`

```ts
'use client';
```

`HomepageHero` contains the homepage LCP candidate: the full-viewport background `<Image>` with `priority` and `fetchPriority="high"`. Because the entire component is `'use client'`, the browser cannot begin loading the image until React hydrates this component. The `priority` prop emits a `<link rel="preload">` in the server HTML only when the `<Image>` is rendered server-side. A `'use client'` component renders client-side only — Next.js does **not** emit the `<link rel="preload">` for it.

The homepage is the highest-value page for CWV scores. The LCP image is delayed by the full JS parse + hydration cycle before the request even starts.

**Impact:** Homepage LCP is delayed by JS hydration time (typically 300-800ms on mid-range mobile) before the LCP image fetch begins.

**Fix:** Extract the background `<Image>` into a server component wrapper that renders the `<Image>` with `priority` and `fetchPriority="high"`. Keep the interactive search bar and quick filters in a separate `'use client'` child component. This is the standard RSC split pattern for hero sections.

```tsx
// HomepageHeroImage.tsx (server component — no 'use client')
import Image from 'next/image';
export function HomepageHeroImage() {
  return (
    <Image
      src="https://...hero-nurses.webp"
      alt="Diverse community of PMHNP professionals"
      fill
      priority
      fetchPriority="high"
      sizes="100vw"
      quality={75}
      style={{ objectFit: 'cover', objectPosition: 'center bottom' }}
    />
  );
}
```

---

### H-3 — `/jobs` page delivers a fully client-side experience — H1 invisible to crawlers on JS-off render

**File:** `app/jobs/JobsPageClient.tsx:1`, `app/jobs/JobsPageClient.tsx:287-291`

`JobsPageClient.tsx` is a `'use client'` component that wraps the entire `/jobs` page content. The H1 is rendered inside it:

```tsx
<h1 style={{
  position: 'absolute', width: '1px', height: '1px', ... clip: ...
}}>
  Browse PMHNP &amp; Psychiatric Nurse Practitioner Jobs
</h1>
```

While the server component (`app/jobs/page.tsx`) does SSR `initialJobs` correctly, the entire rendered output — including job cards, the H1, sort controls, and filter sidebar — is in a client component subtree. Googlebot renders JavaScript but the H1 is visually-hidden and deeply nested within a hydration boundary. More critically, filter state changes trigger client-side fetches that produce content Googlebot never sees.

The debug statement at line 34-39 also ships to production:

```ts
console.log('Client Job 0:', {
  title: jobs[0].title,
  originalPostedAt: jobs[0].originalPostedAt,
  type: typeof jobs[0].originalPostedAt
});
```

This bloats production JS bundles and fires on every render cycle of `jobs` state. See H-4 below.

**Impact:** The job listing content is technically SSR'd via `initialJobs` but the entire component tree is `'use client'`, meaning any client-side interaction produces content invisible to crawlers.

**Fix:** The server component pattern is already partially in place (`app/jobs/page.tsx` fetches `initialJobs`). The fix is to ensure the static job grid (first paint) renders in a server component, and only the interactive filter sidebar + sort controls are `'use client'`. This is a larger refactor; as a lower-risk step, at minimum ensure the initial `initialJobs` render path produces the H1 and job cards in the SSR HTML stream (which it does via RSC — the issue is that `JobsPageClient` being `'use client'` means it is still a client-only boundary).

---

### H-4 — Debug `console.log` ships to production in `/jobs` page

**File:** `app/jobs/JobsPageClient.tsx:34-39`

```ts
useEffect(() => {
  if (jobs.length > 0) {
    console.log('Client Job 0:', {
      title: jobs[0].title,
      originalPostedAt: jobs[0].originalPostedAt,
      type: typeof jobs[0].originalPostedAt
    });
  }
}, [jobs]);
```

This fires on every page load of `/jobs` and every filter change. It is a debugging artifact that:
1. Runs in production browser, adding minor CPU overhead.
2. Leaks internal field names (`originalPostedAt`) to anyone with DevTools open.
3. Increases TBT marginally on every render cycle.

**Fix:** Remove lines 33-40 of `JobsPageClient.tsx`.

---

### H-5 — Vanilla `<img>` tags in `JobCard` and `RelatedJobs` — no width/height reservation causes CLS

**Files:**
- `components/JobCard.tsx:196` — `<img src={job.companyLogoUrl} ...>`
- `components/RelatedJobs.tsx:87` — `<img src={job.companyLogoUrl} ...>`

Both components use vanilla `<img>` tags (not `next/image`) for employer logos. Even though they include `width={48}` and `height={44}` HTML attributes, the images are served without Next.js optimization (no srcset, no AVIF/WebP conversion, no lazy-load boundary management). More critically, `companyLogoUrl` values are arbitrary user-supplied URLs from employers — these can be any dimension, and without `object-fit` enforcement at the browser level (which these do use via inline style), the reserved box may still shift when a logo loads at a different aspect ratio.

The job cards are the primary above-the-fold content on `/jobs` and every pSEO page. CLS from logo load on the grid is a direct CWV impact.

**Fix:** Replace vanilla `<img>` with `next/image` using `unoptimized` (since the URLs are arbitrary external hosts, same pattern already used in the job detail page at `app/jobs/[slug]/page.tsx:725`):

```tsx
import Image from 'next/image';
// ...
<Image
  src={job.companyLogoUrl}
  alt={`${job.employer} logo`}
  width={48}
  height={48}
  unoptimized
  loading="lazy"
  style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'contain', ... }}
/>
```

---

## MEDIUM

### M-1 — CookieConsent banner uses 1500ms setTimeout for strict-consent regions — late layout insertion

**File:** `components/CookieConsent.tsx:107`

```ts
setTimeout(() => setShow(true), 1500);
```

For EEA/UK/CA/BR/AU visitors, the cookie banner appears 1.5 seconds after mount. The banner is a `fixed` bottom bar with no reserved space. When it appears, it shifts all viewport content upward by its height (~70px collapsed), causing a significant CLS event 1.5 seconds into the session. The banner is already gated with `useOverlaySlot` and rendered via `dynamic()` with no SSR, so it arrives after hydration anyway — the 1500ms adds unnecessary delay on top of the existing hydration lag.

**Impact:** CLS spike at T+1.5s on every first visit from strict-consent regions.

**Fix:** Reduce the delay to 200ms or eliminate it entirely. The 1500ms was likely intended to avoid fighting with the page load animation, but the `OverlayCoordinator` already serializes overlays. A shorter delay reduces the CLS window significantly. For the strictest fix, use `transform: translateY(100%)` with a CSS transition instead of injecting the element after a delay — this avoids layout shift entirely (transform is compositor-only).

---

### M-2 — PushNotificationPrompt registers service worker on every page load for all users

**File:** `components/PushNotificationPrompt.tsx:58`

```ts
navigator.serviceWorker.register('/push-sw.js').catch(() => { });
```

This `register()` call runs inside `useEffect` on every page load — not just when the prompt is shown. The service worker registration check fires for all users regardless of visit count or login state. `serviceWorker.register()` is a network request to fetch `/push-sw.js` on the first call, and re-evaluates the SW script on subsequent calls. This is a wasted network request + parse cycle on every page load for the vast majority of users (unauthenticated, first-time visitors, dismissed users).

The prompt itself is guarded by the 20-second timer and authentication check, but the SW registration is unconditional.

**Impact:** Unnecessary network request and JS execution on every page load, contributing to TBT on mobile.

**Fix:** Move the `navigator.serviceWorker.register('/push-sw.js')` call inside the authenticated user check, after the visit count gate:

```ts
supabase.auth.getUser().then(({ data: { user } }) => {
  if (!user) return;
  // Register SW only for authenticated users on 3+ visits
  navigator.serviceWorker.register('/push-sw.js').catch(() => {});
  navigator.serviceWorker.ready.then(reg => { ... });
});
```

---

### M-3 — `getRelatedJobs` on job detail pages runs up to 4 sequential DB round-trips

**File:** `app/jobs/[slug]/page.tsx:113-186`

The `getRelatedJobs` function waterfalls up to 4 sequential Prisma queries:
1. Same employer jobs
2. Same city jobs (only if employer didn't fill limit)
3. Same state jobs (only if city didn't fill limit)
4. Same mode jobs (only if state didn't fill limit)

This is sequential `await prisma.job.findMany(...)` inside `if` blocks. In the worst case (no jobs from same employer, city, or state), this executes 4 DB round-trips before returning. While the result is parallelized with `companyInfo`, `employerJobCount`, etc. via `Promise.all` at line 624, the sequential fallback logic within `getRelatedJobs` itself is not parallelized.

**Impact:** On tail-end job pages with no matching employer/city jobs, server response time adds 4× the DB round-trip latency before the page can be streamed. At ISR revalidation time (up to every 3600s per page), this affects all first-renders.

**Fix:** Run all 4 queries in parallel with `Promise.all`, then merge and deduplicate client-side:

```ts
const [sameEmployer, sameCity, sameState, sameMode] = await Promise.all([
  prisma.job.findMany({ where: { employer, ...}, take: limit }),
  city ? prisma.job.findMany({ where: { city, ...}, take: limit }) : Promise.resolve([]),
  state ? prisma.job.findMany({ where: { state, ...}, take: limit }) : Promise.resolve([]),
  mode ? prisma.job.findMany({ where: { mode, ...}, take: limit }) : Promise.resolve([]),
]);
// merge, deduplicate by id, slice to limit
```

---

### M-4 — Vanilla `<img>` tags in dashboard, employer, and messages flows

**Files:**
- `components/dashboard/DashboardContent.tsx:773`, `:999`
- `app/messages/page.tsx:95`
- `components/AboutEmployer.tsx:61`
- `app/employer/settings/EmployerSettingsClient.tsx:528`

Multiple dashboard and employer-facing pages use vanilla `<img>` tags for user-uploaded content (logos, avatars). While these pages are behind authentication and are not crawled by Googlebot, authenticated users experience CLS from unoptimized images. These pages affect INP scores logged by RUM tools (e.g., GA4 web vitals attribution).

**Fix:** Apply the same `next/image` + `unoptimized` pattern used on the job detail page for all user-uploaded image sources.

---

## LOW

### L-1 — CategoryHero breadcrumbs render as `<span>` — not navigable links

**File:** `components/CategoryHero.tsx:98-109`

```tsx
<span aria-current={isLast ? 'page' : undefined} ...>
  {label}
</span>
```

The breadcrumb `<ol>` renders plain `<span>` elements, not `<a>` links. The `BreadcrumbSchema` JSON-LD emitted separately does have the URLs, so structured data is correct. However, the visible DOM breadcrumbs are not clickable. This does not harm Googlebot (it reads the JSON-LD) but reduces internal link equity from breadcrumb anchor text, which is a mild SEO signal. It also fails WCAG 2.4.8 ("Location") for keyboard users.

**Fix:** The `breadcrumbs` prop is currently `string[]` (labels only). Extend it to `{ label: string; href: string }[]` and render `<Link>` for all non-current items.

---

### L-2 — `framer-motion` `domAnimation` imported into the homepage hero bundle

**File:** `components/HomepageHero.tsx:8`

```ts
import { LazyMotion, domAnimation, m } from 'framer-motion';
```

`LazyMotion` with `domAnimation` is used for stagger animations on the hero text. `framer-motion` (including `domAnimation`) adds ~30KB gzipped to the client bundle. `domAnimation` is the minimal subset, which is good, but it still loads synchronously with the hero client component. Because `HomepageHero` is `'use client'` and rendered above the fold, framer-motion is part of the critical JS path.

**Impact:** ~30KB additional parse/evaluate time on homepage initial load, contributing to TBT.

**Fix:** The stagger animations on the hero text are decorative. Replace with CSS `@keyframes` + `animation-delay` (the same approach used everywhere else in the codebase). This eliminates the framer-motion dependency from the homepage critical path entirely.

---

### L-3 — `/jobs` page `revalidate = 60` — aggressive ISR revalidation frequency under crawl pressure

**File:** `app/jobs/page.tsx:10`

```ts
export const revalidate = 60;
```

60-second revalidation on the `/jobs` page means Googlebot (which crawls this URL frequently) triggers ISR revalidation up to once per minute. Each revalidation executes two Prisma queries: `job.findMany` (50 rows with select) + `job.count`. During Googlebot crawl spikes, this creates sustained DB load. The homepage has the same `revalidate = 60` (`app/page.tsx:24`).

For a job board where the job list changes ~every 4 hours per the ingest pipeline cadence, 60 seconds is far more frequent than content changes justify.

**Fix:** Increase to `revalidate = 300` (5 minutes) for `/jobs` and the homepage. This reduces DB pressure 5× while still keeping content fresh well within the crawl recency window. Consider `revalidate = 600` (10 minutes) during off-peak hours if on-demand revalidation via `revalidatePath` is implemented on ingest.

---

## Verified-clean

| Item | File | Notes |
|------|------|-------|
| Font loading | `app/layout.tsx:33-43` | Inter + Lora with `display: 'swap'`, loaded via `next/font/google`. Only 2 families globally. Newsreader scoped to `/blog/*`. JetBrains Mono removed. No render-blocking Google Fonts `<link>`. |
| GA script strategy | `components/GoogleAnalytics.tsx:91,109,116` | All three scripts use `strategy="afterInteractive"`. Consent-defaults script runs first (correct ordering). No `beforeInteractive` usage. |
| Consent-gated telemetry | `components/GoogleAnalytics.tsx:70-72` | GA returns null in non-production or when `GA_MEASUREMENT_ID` is absent. |
| BottomNav SSR | `app/layout.tsx:17` | BottomNav is statically imported (not dynamic), fixing the 56px CLS spike that existed when it was `dynamic({ ssr: false })`. |
| Job detail ISR | `app/jobs/[slug]/page.tsx:36` | `revalidate = 3600` — appropriate for job content that changes infrequently. |
| pSEO pages ISR | All checked pages in `app/jobs/[setting]/` | `revalidate = 3600` consistently applied. No `force-dynamic` on pSEO routes. No `force-static` either — correct since data is DB-driven. |
| Homepage LCP image | `components/HomepageHero.tsx:58-70` | `priority`, `fetchPriority="high"`, `sizes="100vw"`, `quality={75}`. The preload is defeated by the `'use client'` wrapper (see H-2), but the attributes themselves are correct. |
| Cookie/push dynamic import | `app/layout.tsx:29-31` | `CookieConsent`, `PushNotificationPrompt`, `PWAInstallBanner`, and `ExitIntentPopup` are all `dynamic()` imports — they do not block initial bundle parse. |
| Third-party script count | `app/layout.tsx`, `components/GoogleAnalytics.tsx` | Only GA4 (`gtag.js`) is present. No Hotjar, GTM, Intercom, Drift, FullStory, or other third-party scripts detected. Clean. |
| Cookie consent SSR gate | `app/layout.tsx:156`, `components/CookieConsent.tsx:74-95` | Initial consent is read server-side from an HttpOnly cookie and passed as a prop. For users with prior consent, the banner never renders. For US implied-consent visitors, analytics are granted without banner. |
| pSEO template revalidate | `lib/pseo/category-city-template.tsx`, `lib/pseo/setting-state-template.tsx` | Neither file exports `revalidate` or `dynamic` — they are pure template factories consumed by page files that do set `revalidate = 3600`. Correct architecture. |
