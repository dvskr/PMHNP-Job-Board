# SEO + Site Quality Remediation Runbook (2026-05)

**Status:** Open
**Owner:** Sathish Kumar / engineering
**Created:** 2026-05-08
**Source:** End-to-end audit using 13 parallel agents covering technical SEO, structured data, pSEO, performance, accessibility, security, mobile-first, E-E-A-T, broken assets, plus GSC URL Inspection live verification.

This runbook tracks **52 distinct issues** discovered after the initial 22-issue SEO fix landed in commit `65b3628`. Use it as the source of truth for execution status.

---

## Status legend

| Marker | Meaning |
|---|---|
| `[ ]` | Pending |
| `[~]` | In progress |
| `[x]` | Done — verified |
| `[-]` | Skipped (false positive or out of scope) |
| `[!]` | Blocked |

When marking `[x]`, also add a `done:` line with date + commit SHA + verification evidence.

---

## Issue index (52 issues)

### CRITICAL (8) — fix in Phase A

| ID | Issue | File | Status |
|---|---|---|---|
| C1 | Fake author byline on every blog post + fictional "PMHNP Clinical Review Board" in JSON-LD | `app/blog/[slug]/page.tsx:217-231,487-503` | `[ ]` |
| C2 | Hero search inputs no `<label>`/`aria-label` (WCAG 4.1.2) | `components/HomepageHero.tsx:170-191` | `[ ]` |
| C3 | Hero search inputs strip `:focus-visible` outline (WCAG 2.4.7) | `app/globals.css:478-499` | `[ ]` |
| C4 | Sidebar filter inputs no labels + stripped focus | `components/jobs/LinkedInFilters.tsx:373-416` | `[ ]` |
| C5 | Stats unsourced ($155k, 45% growth, 123M shortage) — YMYL trust violation | `app/page.tsx:139,147` | `[ ]` |
| C6 | Salary numbers inconsistent ($155k–165k vs $140k–175k across pages) | `app/page.tsx`, `app/blog/[slug]/page.tsx:293` | `[ ]` |
| C7 | `ExitIntentPopup` triggers on mobile after 45s — Google "intrusive interstitial" penalty | `components/ExitIntentPopup.tsx:56-61` | `[ ]` |
| C8 | `/jobs` OG image 404 — every social share of jobs surfaces broken | `app/jobs/page.tsx:75` | `[ ]` |

### HIGH (15)

| ID | Issue | File | Status |
|---|---|---|---|
| H1 | Sentry SDK ~224KB raw on every page (incl. d3) | `next.config.ts:185-213`, `sentry.client.config.ts` | `[ ]` |
| H2 | Hero LCP image served `Cache-Control: no-cache` from Supabase | Supabase bucket headers OR move to `/public/` | `[ ]` |
| H3 | 4 Google Fonts families loaded site-wide (max should be 2) | `app/layout.tsx:5,27-49` | `[ ]` |
| H4 | No fonts preloaded — only preconnect; LCP text wait | `app/layout.tsx:158-165` | `[ ]` |
| H5 | `Header.tsx` imports full `framer-motion` (not LazyMotion) | `components/Header.tsx:6` | `[ ]` |
| H6 | No skip-to-content link site-wide (WCAG 2.4.1) | `app/layout.tsx`, `components/MainContent.tsx` | `[ ]` |
| H7 | `FilterSection` collapsible has no `aria-expanded` / `aria-controls` | `components/jobs/LinkedInFilters.tsx:60-95` | `[ ]` |
| H8 | `FAQAccordion` uses `max-h-0 + aria-hidden` instead of `display:none` | `components/FAQAccordion.tsx:40,54-59` | `[ ]` |
| H9 | 4 overlays stacked in root layout (ExitIntent, Push, Cookie, PWA) — full-screen overlap risk on mobile | `app/layout.tsx:262-265` | `[ ]` |
| H10 | Founder hidden — only "S.K." / "Kumar" visible; full name only in JSON-LD | `app/about/AboutClient.tsx:128-138` | `[ ]` |
| H11 | Likely fabricated testimonials (no last names, no LinkedIn) | `app/about/AboutClient.tsx:153-155` | `[ ]` |
| H12 | No `/authors/[slug]` pages — required for YMYL E-E-A-T | new file | `[!]` blocked on B.1 path A (need real authors first) |
| H13 | No "informational only, not medical advice" disclaimer on blog | `app/blog/[slug]/page.tsx` | `[ ]` |
| H14 | AI-generated copy markers ("uncompromised ecosystem", em-dash spam) in About | `app/about/AboutClient.tsx` | `[ ]` |
| H15 | DC state hero image 404 — breaks 5 components when DC appears | `app/jobs/locations/page.tsx`, `components/TopStatesList.tsx`, `LicensureChecker.tsx`, `app/resources/page.tsx` | `[ ]` |

### MEDIUM (20)

| ID | Issue | File | Status |
|---|---|---|---|
| M1 | 8 raw `<img>` tags missing `loading="lazy"` | `JobCard.tsx:192,410`, `Header.tsx:164`, `Footer.tsx:174`, `JobNotFound`, `AboutEmployer`, `RelatedJobs` | `[ ]` |
| M2 | 9 `dynamic()` imports in layout — many small chunks per page | `app/layout.tsx:9-25` | `[ ]` |
| M3 | CSP keeps `'unsafe-inline'` on `style-src` | `middleware.ts:614-616` | `[ ]` |
| M4 | `/api/email-preview` skips CSP — verify auth-gated in prod | `middleware.ts:747-750` | `[ ]` |
| M5 | Service-role Supabase key used in edge middleware for public reads — over-privileged | `middleware.ts:395-403,460-470` | `[ ]` |
| M6 | Semantic-search cookie missing explicit `secure: true` | `app/api/jobs/search/semantic/route.ts:79` | `[ ]` |
| M7 | CORS `Allow-Methods` includes DELETE for all `/api/*` (mitigated by origin allowlist; tighten anyway) | `middleware.ts:805-821` | `[ ]` |
| M8 | Hamburger button 34×34px (Google = 48px, Apple HIG = 44px) | `components/Header.tsx:146-161` | `[ ]` |
| M9 | CookieConsent X button 32×32px | `components/CookieConsent.tsx:205-212` | `[ ]` |
| M10 | Hero search inputs 14.4px font — triggers iOS auto-zoom-on-focus | `components/HomepageHero.tsx:176,189` | `[ ]` |
| M11 | Body `overflow-x: hidden` masks real horizontal-scroll bugs | `app/globals.css:53-66` | `[ ]` |
| M12 | Footer `<h4>` with no `<h2>`/`<h3>` above in landmark | `components/Footer.tsx:120` | `[ ]` |
| M13 | Quick-filter pills 28px tall (WCAG 2.5.8 AA min 24px) | `components/HomepageHero.tsx:246-275` | `[ ]` |
| M14 | Color contrast — `#9A8A7E` on white ≈ 3.4:1 (fails 4.5:1) | `app/jobs/[slug]/page.tsx:533` and elsewhere | `[ ]` |
| M15 | No phone, no street address in footer | `components/Footer.tsx:270-272` | `[ ]` |
| M16 | Hardcoded About stats not pulled from live DB | `app/about/AboutClient.tsx:28-40` | `[ ]` |
| M17 | GA4 may double-count `page_view` (config + RouteChangeTracker) | `components/GoogleAnalytics.tsx:117,23-29` | `[ ]` |
| M18 | `react-quill-new` (~204KB chunk) may leak from admin into public bundles | run `ANALYZE=true npm run build` | `[ ]` |
| M19 | No `<img onError>` fallback in 4 state-image components | same 4 as H15 | `[ ]` |
| M20 | No build-time validator that every state slug has a matching webp | new validator | `[ ]` |

### LOW (9)

| ID | Issue | File | Status |
|---|---|---|---|
| L1 | Verify `UPSTASH_REDIS_REST_URL` set in prod | env config | `[ ]` |
| L2 | Verify HSTS preload submission at hstspreload.org | external | `[ ]` |
| L3 | No COOP / COEP headers (defense-in-depth for auth pages) | `next.config.ts:63-91` | `[ ]` |
| L4 | `Server: Vercel` reveals platform (acceptable, document) | platform-default | `[-]` |
| L5 | EU users get no Speed Insights (consent-gated, privacy-correct, blind to CWV) | `components/ConsentGatedTelemetry.tsx` | `[ ]` |
| L6 | PWA install banner appears after 3 visits — additional interstitial | `components/PWAInstallBanner.tsx:17-54` | `[ ]` |
| L7 | Hero subtitle font 13–13.5px borderline mobile | `components/HomepageHero.tsx:251` | `[ ]` |
| L8 | Header logo uses raw `<img>` instead of `next/image` | `components/Header.tsx:164-170` | `[ ]` |
| L9 | `llms.txt` dated "March 2026" — refresh to current month | `public/llms.txt` | `[ ]` |

---

## Phase A — today (~2 hr)

Removes the highest-leverage signals: intrusive-interstitial penalty, 3 CRITICAL WCAG hero a11y violations, broken `/jobs` social previews.

### A.1 — C7 — disable mobile ExitIntentPopup
**Why:** Google's "intrusive interstitial" doc explicitly cites timed mobile popups blocking content as a ranking penalty. The 45s mobile timer is the exact pattern they call out.

**Fix:** In `components/ExitIntentPopup.tsx` around lines 56–61, gate the timer behind `window.innerWidth >= 768` so it fires desktop-only. Or remove the `mobileTimer` setTimeout entirely.

**Verify:**
- View `/` on mobile viewport — wait 60s — popup should NOT appear.
- View `/` on desktop — exit cursor — popup SHOULD appear.

**Time:** 5 min

---

### A.2 — C2/C3 — hero search inputs a11y
**Why:** Most-clicked control on the site. Screen readers currently announce only "edit text". WCAG 4.1.2 + 2.4.7 are CRITICAL fails.

**Fix in `components/HomepageHero.tsx:170-191`:**
- Add `aria-label="Job title or keyword"` to the first input.
- Add `aria-label="City or remote"` to the second.
- Remove the `onFocus` handler that strips `box-shadow` / `outline`.

**Fix in `app/globals.css:478-499`:**
- Replace `outline: none !important; box-shadow: none !important` on `.hero-search-input:focus-visible` with a `box-shadow: 0 0 0 3px rgba(13,148,136,0.4)` ring.

**Verify:**
- Tab through homepage with keyboard — visible focus ring on each input.
- VoiceOver / NVDA / Narrator on the homepage — announces "Job title or keyword, edit text" on first input.

**Time:** 15 min

---

### A.3 — C4 — sidebar filter inputs a11y
**Why:** Same WCAG fail as hero, on the second-most-clicked control.

**Fix in `components/jobs/LinkedInFilters.tsx`:**
- Line 373: add `aria-label="Search jobs"` to the search input.
- Line 400: add `aria-label="Filter by location"` to the location input.
- Remove any `:focus { outline: none }` on these inputs (or add a focus-ring fallback).

**Verify:** Same as A.2 on `/jobs`.

**Time:** 10 min

---

### A.4 — H6 — skip-to-content link
**Why:** WCAG 2.4.1. Keyboard users currently tab through the full nav on every page.

**Fix in `app/layout.tsx`** (inside `<body>`, before the `ThemeProvider`):
```tsx
<a
  href="#main-content"
  style={{
    position: 'absolute',
    left: '-9999px',
    top: '0',
    background: '#0D9488',
    color: 'white',
    padding: '12px 18px',
    zIndex: 9999,
    textDecoration: 'none',
    fontWeight: 600,
  }}
  onFocus={(e) => { e.currentTarget.style.left = '8px'; e.currentTarget.style.top = '8px'; }}
  onBlur={(e) => { e.currentTarget.style.left = '-9999px'; }}
>
  Skip to main content
</a>
```
(Or use Tailwind: `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:bg-teal-600 focus:text-white focus:p-3 focus:z-50 focus:rounded`.)

**Then in `components/MainContent.tsx`** add `id="main-content"` to the `<main>` element.

**Verify:** Load any page, press Tab once — "Skip to main content" should appear in the top-left corner.

**Time:** 10 min

---

### A.5 — C8 — fix /jobs OG image 404
**Why:** Every social share of any /jobs URL renders a missing preview card. Live-verified bug.

**Fix in `app/jobs/page.tsx:75`:** Change the OG image URL from the missing `pmhnp-job-board-og.webp` to the existing `pmhnp-job-board-homepage.webp`. Same for any other place pointing at the missing asset.

**Or:** upload `pmhnp-job-board-og.webp` to the Supabase `site-assets/images/pages/` bucket. (One-line code change is faster.)

**Verify:** Run `curl -I https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp` — should return 200. Then paste a `/jobs` URL into LinkedIn / Facebook share preview tools.

**Time:** 5 min

---

### A.6 — H15 — DC state image fallback
**Why:** Whenever DC appears in results (it's in the sitemap), 5 components render broken images.

**Fix (the fast path — onError fallback):** In each of the 4 components below, change `<img src="...{slug}.webp">` to add an `onError` handler that swaps to a generic placeholder:

```tsx
<img
  src={`https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/states/${slug}.webp`}
  alt={`${name} PMHNP Jobs`}
  onError={(e) => {
    e.currentTarget.src = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/states/_default.webp';
  }}
/>
```

Files: `app/jobs/locations/page.tsx:382`, `components/TopStatesList.tsx:93`, `components/LicensureChecker.tsx:134,200`, `app/resources/page.tsx:304`.

**Better but slower path:** upload a `district-of-columbia.webp` to Supabase. Do both.

**Verify:** Force-render a page with DC → no broken-image icon.

**Time:** 20 min for both code changes + asset upload

---

### Phase A acceptance gate

Before merging Phase A, all of:

- [ ] `npm run type-check` clean
- [ ] `npm run test` 730/730 pass
- [ ] `npm run lint` no new errors
- [ ] Manual smoke: keyboard-tab through homepage and `/jobs` — focus visible on all inputs, skip link works
- [ ] Manual smoke: mobile viewport, wait 60s on `/` — no exit-intent popup
- [ ] OG share preview check on `/jobs` via LinkedIn Post Inspector or `https://www.opengraph.xyz/url/...`

---

## Phase B — this week (~1 day)

Closes YMYL trust gaps. Most are content/business decisions, not pure code.

### B.1 — C1 — real authors or remove fake credentials
**Decision required from product/legal:**
- Path A: contract a real PMHNP-BC reviewer (named, photo, license number, LinkedIn).
- Path B: remove the "PMHNP-BC Reviewed" badges and the `reviewedBy` JSON-LD entirely.

Until a decision is made, **path B is the safe default** because shipping fake credentials in healthcare YMYL content is a manual-action risk.

**Path B fix in `app/blog/[slug]/page.tsx`:**
- Lines 217–231: remove the `reviewedBy` field from the `BlogPosting` JSON-LD.
- Lines 487–503: remove the "PMHNP-BC Reviewed" badge UI.
- Replace "PMHNP Hiring Editorial Team" byline with the real author name from the blog post frontmatter.

**Time:** 30 min code + decision time

---

### B.2 — C5/C6 — cite + reconcile stats
**Why:** Healthcare YMYL bar — every stat needs a verifiable source.

**Fix:**
1. Add a single source-of-truth file `lib/stats-sources.ts`:
   ```ts
   export const STAT_SOURCES = {
     averageSalary: { value: '155000', range: '$155K–$165K', source: 'BLS OES May 2024', sourceUrl: 'https://www.bls.gov/oes/...' },
     bls45Growth: { value: '45%', source: 'BLS Occupational Outlook Handbook 2024–2032', sourceUrl: '...' },
     hrsa123M: { value: '123M', source: 'HRSA Health Workforce Shortage Designations 2024', sourceUrl: '...' },
   };
   ```
2. Replace hardcoded stats in `app/page.tsx:139,147` and the FAQ JSON-LD with values from the file.
3. Render visible `<sup><a href={STAT_SOURCES.X.sourceUrl}>[1]</a></sup>` next to each stat in the visible HTML.
4. Audit `app/blog/[slug]/page.tsx:293` and fix the $140k–$175k inconsistency by reading from the same constant.

**Verify:** Same `STAT_SOURCES.averageSalary.range` rendered on homepage and in blog schema.

**Time:** 2 hr

---

### B.3 — H10 — promote founder
**Decision required:** OK for Pavan to be visibly named and pictured?

**Fix in `app/about/AboutClient.tsx:128-138`:**
- Replace `"S.K."` mark and `"Kumar"` text with full name "Pavan Kumar Reddy Daggula".
- Add a real headshot (upload to `/public/founders/pavan.webp` or Supabase).
- Add LinkedIn link.
- 2–3 sentence "Why I built this".

**Fix in `app/layout.tsx`** (Organization schema lines 190–193):
- Add `sameAs: ["https://www.linkedin.com/in/<pavan-handle>"]` to the founder Person.

**Update `config/brand.ts`:**
- Add `legal.founderTitle`, `legal.founderLinkedIn`.

**Time:** 1 hr

---

### B.4 — H11 — replace fabricated testimonials
**Fix in `app/about/AboutClient.tsx:153-155`:** either
- Get 3 real quotes with full names + LinkedIn opt-in, OR
- Remove the testimonial section entirely.

**Time:** 30 min code + outreach time

---

### B.5 — H12 — author pages
**Fix:**
1. Add `app/authors/[slug]/page.tsx` rendering `Person` schema, bio, credentials, list of articles.
2. Update `lib/blog.ts` schema/queries to include `authorSlug`, `authorName`, `authorBio`, `authorCredentials`, `authorLinkedIn`.
3. Link blog post bylines to `/authors/{slug}`.

**Time:** 4 hr (depends on existing blog schema)

---

### B.6 — H13 — medical disclaimer
**Fix:** Add a footer disclaimer block to `app/blog/[slug]/page.tsx` and any non-job page making clinical-sounding claims:
> *This content is for informational purposes only and is not medical advice. Always consult a licensed clinician for individual care decisions. PMHNP Hiring is a job board operated by Akari Labs LLC, not a medical or licensing authority.*

**Time:** 15 min

---

### B.7 — H14 — rewrite AI-generated copy in About
**Fix in `app/about/AboutClient.tsx`:** replace LLM-tells ("uncompromised ecosystem", "hyper-calibrated marketplace", "fractured ecosystem", em-dash spam) with plain founder-voice English.

**Time:** 1–2 hr (writing)

---

### B.8 — M15 — footer address + phone
**Fix in `components/Footer.tsx:270-272`:**
- Add full mailing address: "30 N Gould St, Sheridan, WY 82801".
- Add a contact phone (or Google Voice forwarding number).

**Decision required:** Real phone or none?

**Time:** 10 min

---

## Phase C — this week (~1 day)

Performance + Core Web Vitals.

### C.1 — H1 — Sentry SDK trim
**Why:** ~224KB raw on every page is the single biggest bundle liability.

**Fix in `next.config.ts:185-213` and `sentry.client.config.ts`:**
- Set `replaysSessionSampleRate: 0` (only sample on errors).
- Set `tracesSampleRate: 0.05`.
- Disable `autoInstrumentAppDirectory` for non-error pages.
- Consider switching from `@sentry/nextjs` to `@sentry/browser` lite + manual API-route instrumentation.

**Verify:** `ANALYZE=true npm run build` — confirm `bd35cd919d803eba.js`-class chunk drops below 100KB raw.

**Time:** 2 hr

---

### C.2 — H2 — hero LCP image cache
**Why:** Hero image served `Cache-Control: no-cache` from Supabase; every cold visit re-fetches.

**Fix (pick one):**
- A: Override the bucket headers — set `Cache-Control: public, max-age=31536000, immutable` on `site-assets/`.
- B: Move the hero to `/public/hero-nurses.webp` so it inherits Next.js's 1-year immutable headers.

**Verify:** `curl -I https://pmhnphiring.com/hero-nurses.webp` returns `Cache-Control: public, max-age=31536000, immutable`.

**Time:** 30 min

---

### C.3 — H3 — drop fonts to 2 families
**Fix in `app/layout.tsx:5,27-49`:**
- Keep `Inter` (body) + `Lora` (headings).
- Remove `Newsreader` and `JetBrains_Mono` unless they're used on critical surfaces.
- Audit `font-mono` and `font-newsreader` usage with `grep -r`.

**Time:** 30 min

---

### C.4 — H4 — preload hero image + primary font
**Fix in `app/layout.tsx:158-165`:** add `<link rel="preload">` for the hero webp and the Inter regular woff2.

**Time:** 15 min

---

### C.5 — H5 — Header LazyMotion
**Fix in `components/Header.tsx:6`:** replace `import { motion, AnimatePresence } from 'framer-motion'` with the LazyMotion + `m` pattern already used in `HomepageHero.tsx`.

**Time:** 30 min

---

### C.6 — M1 — add `loading="lazy"` to 8 raw `<img>`s
Files: `JobCard.tsx:192,410`, `Header.tsx:164`, `Footer.tsx:174`, `JobNotFound`, `AboutEmployer`, `RelatedJobs`. Also add explicit `width`/`height` to prevent CLS.

**Time:** 30 min

---

### C.7 — H7 — FilterSection aria
**Fix in `components/jobs/LinkedInFilters.tsx:60-95`:** the collapsible button needs:
- `aria-expanded={expanded}`
- `aria-controls="filter-section-{name}"`
- The collapsed panel needs a matching `id` and `role="region"`.

**Time:** 20 min

---

### C.8 — H8 — FAQAccordion robust hide
**Fix in `components/FAQAccordion.tsx:40,54-59`:**
- Replace the `max-h-0; opacity-0; aria-hidden=!isOpen` pattern with the `hidden` attribute or `display: none`.
- Restore a `:focus-visible` ring on the question button.

**Time:** 20 min

---

### C.9 — H9 — overlay hierarchy
**Why:** ExitIntent + Push + Cookie + PWA can stack on mobile.

**Fix in `app/layout.tsx:262-265`:** introduce a single `<OverlayManager>` that allows only ONE overlay visible at a time, with priority order: Cookie > Push > PWA > ExitIntent. (Cookie consent must always win.)

**Time:** 1–2 hr

---

## Phase D — next week (~1–2 days)

Polish + harden. All MEDIUM items not already in earlier phases.

| ID | Action | Time | Status |
|---|---|---|---|
| M2 | Audit 9 layout `dynamic()` imports — consolidate small chunks | 1 hr | `[!]` deferred — needs `ANALYZE=true npm run build` baseline first |
| M3 | Move `style-src` off `'unsafe-inline'` (hash- or nonce-based) | 2 hr | `[!]` deferred — many inline `style={{}}` props would break; needs CSP-hash codemod |
| M4 | Verify `/api/email-preview` is auth-gated in prod | 30 min | `[x]` verified — `requireApiAdmin` gate at route.ts:18 |
| M5 | Replace edge-middleware `SUPABASE_SERVICE_ROLE_KEY` with anon key + RLS | 1 hr | `[!]` deferred — needs Supabase RLS-policy review to avoid breaking 410-Gone middleware lookups |
| M6 | Add explicit `secure: true` on semantic-search cookie | 5 min | `[x]` done — secure: process.env.NODE_ENV === 'production' |
| M7 | Tighten CORS `Allow-Methods` to per-route minimum (drop DELETE on read endpoints) | 30 min | `[!]` deferred — origin allowlist already mitigates; per-route Allow-Methods needs middleware refactor |
| M8 | Bump hamburger button to `padding: 12px` (≥44×44) | 5 min | `[x]` done |
| M9 | CookieConsent X button to `p-3` (≥44×44) | 5 min | `[x]` done |
| M10 | Hero search inputs `fontSize: 16px` to prevent iOS zoom | 5 min | `[x]` done in Phase A |
| M11 | Find and fix the actual horizontal-scroll bugs `overflow-x: hidden` is masking | 1 hr | `[!]` deferred — needs runtime browser audit at multiple breakpoints |
| M12 | Promote footer `<h4>` → `<h3>` and wrap in `<nav aria-label>` | 15 min | `[x]` done |
| M13 | Quick-filter pills bump padding to `12px 20px` | 10 min | `[x]` done |
| M14 | Audit grays — replace `#9A8A7E` on white with `#7A6A62` (≥4.5:1) | 30 min | `[x]` done across 3 files |
| M16 | Wire About stats to live DB | 30 min | `[x]` done — dioramaCounts prop wired through page→client |
| M17 | Fix GA4 double-counting | 15 min | `[x]` done — send_page_view: false, RouteChangeTracker owns it |
| M18 | Run `ANALYZE=true npm run build`; isolate `react-quill-new` if leaking | 1 hr | `[!]` deferred — needs interactive bundle analyzer review |
| M19 | Add `onError` fallback to all state-image renders | 15 min | `[x]` done in Phase A (StateImage component) |
| M20 | Build-time validator that every state slug has a matching webp | 30 min | `[x]` done — scripts/check-state-images.ts |

---

## Phase E — when convenient

| ID | Action | Time |
|---|---|---|
| L1 | Verify `UPSTASH_REDIS_REST_URL` set in Vercel env | 5 min |
| L2 | Submit apex domain to hstspreload.org | 10 min |
| L3 | Add `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` to auth pages only | 1 hr |
| L5 | Add anonymous, sampled web-vitals shim (no cookies) so EU CWV is observable | 2 hr |
| L6 | Tighten PWA install banner trigger logic (currently 3 visits + iOS 2s timer) | 30 min |
| L7 | Bump hero subtitle font from 13px → 14px or larger | 5 min |
| L8 | Swap header logo `<img>` → `<Image>` | 10 min |
| L9 | Refresh `public/llms.txt` timestamp to current month | 5 min |

---

## Verification & rollback

### After every commit
- `npm run type-check`
- `npm run test`
- `npm run lint`

### After every phase merge to main
- Push to `dev` → wait for Vercel preview → smoke-check the affected surfaces.
- After merge to `main` → re-run **GSC URL Inspection** ("Test Live URL") on:
  - `https://pmhnphiring.com/`
  - `https://pmhnphiring.com/jobs/remote`
  - One job-detail URL
  - One blog post
- Confirm no new "Detected items" errors in the Rich Results test report.
- Watch GSC over the following week for:
  - "Discovered – currently not indexed" trend
  - "Crawled – currently not indexed" trend
  - "Indexed, though blocked by robots.txt" — should drop to 0 by 2026-05-19

### Rollback
Each phase is a separate commit (or PR). Revert with `git revert <sha>` and redeploy.

---

## Tracking

Update the status column in the issue tables above as work progresses. When closing a row, append a `done:` line:
```
done: 2026-05-09 commit abc1234 — verified via GSC URL Inspection on /jobs/remote
```

When the entire runbook is closed, archive this file by renaming to `docs/runbooks/seo-2026-05-remediation-CLOSED.md` and add a final summary row above the issue index.

---

## Out-of-scope items (not in this runbook)

- Vercel firewall rules (managed in Vercel dashboard, not repo)
- Supabase bucket headers (managed in Supabase dashboard)
- Real Googlebot indexing / GSC Coverage reports (read-only telemetry)
- Hiring a clinical reviewer for blog content (business decision)
