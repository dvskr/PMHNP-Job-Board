# Mobile Rendering Remediation Runbook (2026-05)

> Audience: engineering. Tracks mobile-rendering defects discovered in the 10-agent parallel audit on 2026-05-08.
> Last updated: 2026-05-08.

**Status:** Open
**Owner:** Sathish Kumar / engineering
**Created:** 2026-05-08
**Source:** Parallel agent audit covering 10 surfaces — homepage, /jobs listing, job detail, nav/shell, pSEO/city pages, forms, a11y/tap-targets, typography/overflow, performance/CLS, secondary/legal pages. Live Playwright at 375 / 390 / 414 / iPhone Plus + static code review. Screenshots: `tmp/mobile-audit/`. Specs: `tests/e2e/mobile-audit*.spec.ts`.

This runbook tracks **38 distinct issues**. It is the source of truth for execution status.

---

## Status legend

| Marker | Meaning |
|---|---|
| `[ ]` | Pending |
| `[~]` | In progress |
| `[x]` | Done — verified |
| `[-]` | Skipped (false positive or out of scope) |
| `[!]` | Blocked |

When marking `[x]`, add a `done:` line with date + commit SHA + verification evidence (screenshot diff, manual viewport check, or test pass).

---

## Issue index (38 issues)

### CRITICAL (6) — Phase A

| ID | Issue | File | Status |
|---|---|---|---|
| C1 | `/jobs` mobile filter drawer unusable — Header `z-[100]` intercepts taps on drawer's close button (`z-50`); drawer never dismisses, blocking filter apply + card nav | `components/MobileFilterDrawer.tsx:42` | `[x]` |
| C2 | `/salary-guide` horizontal overflow (body 399px @ 375px viewport) — inline `gridTemplateColumns: 'repeat(12, 1fr)'` overrides mobile stylesheet; market-trends table has `overflow:hidden` | `app/salary-guide/page.tsx:238,538-539` | `[x]` |
| C3 | pSEO city pages overflow (body 565px @ 375px) — hard-coded `repeat(3, 1fr)` grids on Local Insights + Explore More + state Explore-More | `lib/pseo/category-city-template.tsx:1454,1573`, `lib/pseo/setting-state-template.tsx:790,728,572`, `app/globals.css` | `[x]` |
| C4 | iOS keyboard zoom on every auth form + contact form — input `font-size:14px` triggers viewport zoom on focus (affects /login, /signup, /forgot-password, /employer/login, /employer/signup, /contact, MessageEmployerModal, ComposeMessageModal, ReportJobButton) | `components/auth/authTokens.ts`, `app/contact/page.tsx`, `components/jobs/MessageEmployerModal.tsx`, `components/employer/ComposeMessageModal.tsx`, `components/ReportJobButton.tsx` | `[x]` |
| C5 | CookieConsent `z-[9990]` covers BottomNav (`z-50`) — bottom 60–100px of nav unreachable while banner shown | `components/CookieConsent.tsx:153` | `[x]` |
| C6 | Non-semantic checkboxes — `<div onClick>` toggling "highest degree" / "I currently work here". Not focusable, screen readers don't announce, switch users blocked (WCAG 4.1.2, 2.1.1) | `components/settings/EducationSection.tsx:211`, `components/settings/WorkExperienceSection.tsx:233` | `[x]` |

**done (Phase A):** 2026-05-08, commit `<TBD>`. Verified by `tests/e2e/mobile-phase-a-verify.spec.ts` (6/6 passing) covering: drawer close-button reachable on /jobs, /salary-guide + city + state with `scrollWidth ≤ innerWidth`, /login + /contact inputs computed `font-size ≥ 16px`. C5 + C6 verified by manual code review (no E2E coverage yet).

### HIGH (11) — Phase B

| ID | Issue | File | Status |
|---|---|---|---|
| H1 | JobCard save/share icon buttons ~30×30; ReportJob trigger ~14×14 (WCAG 2.5.8 fails) | `components/JobCard.tsx:480-506`, `components/ReportJobButton.tsx:77-86`, `components/ShareButton.tsx:32-43` | `[x]` |
| H2 | BottomNav links ~40×40 tap target (`py-2 px-1` + 24px icon) | `components/BottomNav.tsx:57-81` | `[x]` |
| H3 | Signup name fields side-by-side render at ~128px each (below usable input width) | `components/auth/SignUpForm.tsx:325` | `[x]` |
| H4 | Footer hidden on mobile for ALL non-`/` routes — pSEO landings lose footer SEO + nav links | `components/MobileHideOnAppRoutes.tsx` | `[x]` |
| H5 | Breadcrumbs are JSON-LD only, never rendered as visible `<nav><ol>` | `components/CategoryHero.tsx` | `[x]` |
| H6 | UserMenu modal fixed `width:280px` — overflows < 360px viewports | `components/auth/UserMenu.tsx:151` | `[x]` |
| H7 | Modals lack `role="dialog"` / `aria-modal` / focus-trap / focus-restore: ShareModal, ReportJobButton modal, ComposeMessageModal, root MobileFilterDrawer | new `lib/hooks/useFocusTrap.ts`; `components/ShareModal.tsx`, `components/ReportJobButton.tsx`, `components/employer/ComposeMessageModal.tsx`, `components/MobileFilterDrawer.tsx` | `[x]` |
| H8 | Focus-visible missing on inline-styled icon buttons | `app/globals.css` (new `.jc-icon-btn` / `[data-icon-btn]:focus-visible` rule), `components/JobCard.tsx`, `components/ReportJobButton.tsx`, `components/SaveJobButton.tsx`, `components/ShareButton.tsx`, `components/Header.tsx` | `[x]` |
| H9 | Raw `<img>` with no width/height on critical paths — guaranteed CLS | `app/jobs/[slug]/page.tsx:720` (next/image), `app/about/AboutClient.tsx:54,58,62,66,99,114` (width/height + lazy) | `[x]` |
| H10 | GA consent script uses `strategy="beforeInteractive"` — blocks parser before paint (+50–200ms TBT mobile) | `components/GoogleAnalytics.tsx:85` | `[x]` |
| H11 | `text-muted` (`#A0AEC0`) ≈ 2.9:1 on backgrounds — fails WCAG 1.4.3 AA | `app/globals.css:175` (#A0AEC0 → #64748B, ~4.99:1) | `[x]` |

**done (Phase B):** 2026-05-08, commit `<TBD>`. Verified by `tests/e2e/mobile-phase-b-verify.spec.ts` (7/7 passing) covering: BottomNav + JobCard icon buttons ≥ 44×44, /signup first/last each ≥ 260px, pSEO city page has visible `<nav aria-label="Breadcrumb">` with `aria-current="page"`, job-detail employer logo has explicit width/height, GA consent script no longer in `<head>`, and `--text-muted` resolves to `#64748b`. Phase A spec (`mobile-phase-a-verify.spec.ts`) re-run to confirm no regressions — 6/6 still passing. M7 (double safe-area), M11 (aria-current), and M12 (compose-modal label association) folded in incidentally.

### MEDIUM (14) — Phase C

| ID | Issue | File | Status |
|---|---|---|---|
| M1 | Hero `<Image>` inside `'use client'` component — `priority` only applies post-hydration; est. 200–500ms LCP delay on mid-range mobile | `components/HomepageHero.tsx:58-70` | `[-]` (false positive: Next.js 15 SSRs `'use client'` components, and the `<link rel="preload" as="image" fetchpriority="high">` is already emitted in the SSR HTML head — verified 2026-05-08 via `curl http://localhost:3000 \| grep hero-nurses`) |
| M2 | Header logo `<Image>` missing `sizes` prop — wastes ~30KB/page on mobile | `components/Header.tsx:184` | `[x]` |
| M3 | Five `<Image>` in pSEO category-city template missing `sizes` — oversized srcset on mobile | `lib/pseo/category-city-template.tsx:1381,1387,1402,1423,1577` | `[x]` |
| M4 | `BottomNav` is `dynamic({ssr:false})` — 56px bar injected after hydration → CLS on mobile | `app/layout.tsx:10` | `[x]` |
| M5 | `FeedbackWidget` fixed `w-[300px]` — fragile at < 320px | `components/FeedbackWidget.tsx:94` | `[x]` |
| M6 | `PushNotificationPrompt` `bottom:20` overlaps BottomNav | `components/PushNotificationPrompt.tsx:99-104` | `[x]` |
| M7 | Double safe-area inset on BottomNav — `.safe-bottom` + `.pb-safe` on same `<nav>` | `components/BottomNav.tsx:45,51` | `[x]` (folded into Phase B) |
| M8 | AnalyticsTab `<table>` has no horizontal-scroll wrapper | `components/employer/AnalyticsTab.tsx:210` | `[x]` |
| M9 | Breadcrumb label `max-w-[200px]` truncates aggressively on mobile | `components/Breadcrumbs.tsx:59` | `[x]` |
| M10 | ResumeUpload toast `top:24, right:24` — clips behind iOS Dynamic Island | `components/auth/ResumeUpload.tsx:314` | `[x]` |
| M11 | BottomNav active state has no `aria-current="page"` | `components/BottomNav.tsx:56-80` | `[x]` (folded into Phase B) |
| M12 | Modal labels (MessageEmployer, ComposeMessage) not associated via `htmlFor`/`id` | `components/jobs/MessageEmployerModal.tsx:337-357,362-390`, `components/employer/ComposeMessageModal.tsx` | `[x]` (both modals fixed; ComposeMessage in Phase B, MessageEmployer in Phase C) |
| M13 | /post-job page returns 401 on load (auth-gate not redirecting cleanly) | `app/post-job/page.tsx` (gate `/api/employer/profile-snapshot` fetch behind `user && role === 'employer'`) | `[x]` |
| M14 | Possible visual regression: dark hero background bleeds through sections below it on `/` (flagged mid-investigation by homepage agent; needs visual confirmation) | `components/HomepageHero.tsx`, `app/page.tsx` | `[-]` (false positive: hero `<section>` has `overflow:hidden`; the "dark color" was the parent div's intentional `#FDFBF7→#F5D5C4→#F0C4AF` gradient. Verified 2026-05-08 via `tests/e2e/mobile-m14-bg-probe.spec.ts`.) |

**done (Phase C):** 2026-05-08, commit `<TBD>`. Verified by `tests/e2e/mobile-phase-c-verify.spec.ts` (5/5 passing) + `tests/e2e/mobile-m14-bg-probe.spec.ts` (1/1) — covers M2 (Header logo `imageSizes="56px"` in SSR HTML), M3 (pSEO Images carry `sizes` attr), M4 (BottomNav present in initial HTML before hydration), M9 (`max-w-[140px]` mobile cap), L1 (zero 401s on `/api/applications` + `/api/saved-jobs` for anonymous home + /jobs visits), and M14 (no hero-image bleed past hero section). Phase A + Phase B specs re-run together — 18/19 tests pass (the one H9 retry depends on a real job listing being present in the DB with an employer logo). M1 and M14 marked `[-]` skipped after verification — both were agent false positives. M5 has no E2E coverage (the widget renders only after 60s + 3 visits + auth) and is verified by source diff. Bonus fixes folded in: L1 console-noise gating on `useAppliedJobs` + `useSavedJobs` via Supabase auth-cookie heuristic.

### LOW (7) — Phase D / hygiene

| ID | Issue | File | Status |
|---|---|---|---|
| L1 | 401 console noise on every anonymous page from `/api/applications` + `/api/saved-jobs` — gate with auth-cookie heuristic | `lib/hooks/useAppliedJobs.ts`, `lib/hooks/useSavedJobs.ts` | `[x]` (closed in Phase C) |
| L2 | Three font families load on every page — move Newsreader to blog segment | new `app/blog/layout.tsx`; `app/layout.tsx` Newsreader removed | `[x]` |
| L3 | Header mobile overlay missing `role="dialog"` + ESC handler | `components/Header.tsx` | `[x]` |
| L4 | Locations page raw `<img>` icons bypass next/image AVIF | `app/jobs/locations/page.tsx` (4 sites converted to `<Image>` with `sizes`) | `[x]` |
| L5 | Copy-link button has no `aria-live` announcement | `components/ShareModal.tsx` (visually-hidden `role="status" aria-live="polite"` region added; `aria-label` flips to "Link copied") | `[x]` |
| L6 | ReportJobButton emoji labels missing `aria-hidden="true"` | `components/ReportJobButton.tsx:212` | `[x]` |
| L7 | Body scroll-lock race during fast nav-during-drawer-animation | `components/Header.tsx` (single effect saves prior overflow + restores only if not stomped by another overlay; route-change effect no longer touches body.style) | `[x]` |

**done (Phase D):** 2026-05-08, commit `<TBD>`. Verified by `tests/e2e/mobile-phase-d-verify.spec.ts` (5/5 passing) covering: Newsreader absent on `/`, present on `/blog` (L2); Header overlay carries `role="dialog" aria-modal="true"` and ESC dismisses (L3); `/jobs/locations` Supabase icons rewritten through `/_next/image` (L4); ShareModal exposes a polite live region + accessible-name copy-link button (L5). L6 + L7 verified by source diff. **Full regression suite (Phase A + B + C + D + M14): 24/24 passing in 52.2s.**

---

## Phase plan

**Phase A — CRITICAL (this PR).** Unblock `/jobs` filtering (C1), kill iOS form zoom (C4), eliminate horizontal overflow on /salary-guide (C2) and pSEO city pages (C3), restore BottomNav reachability (C5), replace fake checkboxes (C6). Mostly single-line or near-single-line changes.

**Phase B — HIGH.** Tap-target padding (H1, H2), form layout (H3), pSEO footer + breadcrumbs (H4, H5), modal a11y semantics (H7), focus-visible (H8), CLS image fixes (H9), GA script timing (H10), contrast (H11).

**Phase C — MEDIUM.** Performance (M1–M4), responsive widths (M5, M6), nav polish (M7, M11), table scroll wrappers (M8), Dynamic Island safe-area (M10), modal labels (M12), auth-gate redirect (M13), visual regression check (M14).

**Phase D — LOW / hygiene.** Console-noise gating (L1), font loading scope (L2), header dialog semantics (L3), image polish (L4), aria-live + aria-hidden (L5, L6), scroll-lock race (L7).

---

## Verification

For each fix:
1. Run the relevant Playwright spec under `tests/e2e/mobile-audit*.spec.ts` — re-screenshot at 375x812 and compare.
2. For overflow fixes: confirm `document.documentElement.scrollWidth <= window.innerWidth + 1` at 375px, 390px, 414px.
3. For tap-target fixes: confirm computed `width >= 44 && height >= 44` (or use Lighthouse mobile a11y audit ≥ 95).
4. For form-zoom fixes: confirm computed input `font-size >= 16` in a real iOS Safari session if available, otherwise via getComputedStyle in Playwright.
5. For modal a11y: keyboard-tab through and confirm focus trap, ESC dismiss, focus restore.
