# PMHNP Hiring — Full End-to-End Audit + Runbook

**Audit run:** 2026-05-31 · **Target:** https://pmhnphiring.com (production) + full codebase
**Method:** real-browser crawl of 104 live pages · read-only production DB queries · logged-in job-seeker + employer flows · 28-agent code review (14 finders → 14 adversarial verifiers) over the whole repo. Every finding is verified against real `file:line` evidence; 5 agent claims were refuted and dropped.

> **PART A = the results (what's wrong, what's fine).**
> **PART B = the runbook (how to re-run this yourself anytime).**

---

# PART A — RESULTS

## A.0 Verdict (no sugar-coating)

The engineering is genuinely above-average for a solo project — 160 API routes, a 70-model schema, pSEO at scale, idempotent Stripe webhooks, real rate-limiting, mature privacy scaffolding. **But several flagship features are silently dead in production and have been for weeks**, and the recurring failure pattern is the same everywhere: *work is wired up, fails or no-ops silently, and still returns `200 OK`, so nobody is alerted.*

The one sentence that matters most: **`job_embeddings = 0`, `candidate_recommendations = 0`, `gsc_snapshots = 0`, and only 4 of ~29 crons ever record a run — not because code is missing, but because events are never emitted and failures return 200.**

## A.1 Scorecard

| Severity | Count | Closed (2026-06-01) |
|---|---|---|
| 🔴 CRITICAL | 4 | **4/4** ✅ — Phase 2 of `docs/AUDIT_FIX_PLAN.md` |
| 🟠 HIGH | 30 | **8/30** ✅ — Phase 3+4 (S1, S2, S5, S3, Sec2, Sec3, T1, T2) |
| 🟡 MEDIUM | 61 | **5/61** ✅ — Phase 5.A security batch |
| ⚪ LOW | 26 | 0 |
| ✅ Refuted by verifiers | 5 | n/a |

> **Tracking:** detailed phase-by-phase status lives in `docs/AUDIT_FIX_PLAN.md`.
> Closed-this-session commits: dfeee48 → 6e86471 on `dev`.
> Live audit harness: `scripts/audit-catalog-quality.ts` + `scripts/run-prod-audit.ps1`.

## A.2 What I actually tested (and the result)

| Test | Result |
|---|---|
| Crawled 104 live public pages (real browser) | all load 200; but soft-404 + hydration errors found (A.4 S1/S5) |
| Queried production DB read-only | numbers in A.6 — several tables empty that shouldn't be |
| Logged in as **job seeker** | dashboard/applications/saved/settings/messages/alerts all work ✅ |
| Logged in as **employer** (`test@pmhnphiring.com`) | dashboard/applicants/talent-pool(1,092)/settings/post-job all work ✅ |
| Authorization (seeker & employer → `/admin`, `/employer/*`) | correctly blocked → `/unauthorized` ✅ |
| Sitemaps | correct — job sitemap = exactly 1,557 (published count), no unpublished leak ✅ |
| Supabase data API (RLS) — anon + logged-in user | **locked down** — every sensitive table returns 403; only `blog_posts` is public ✅ (A.10) |
| Core Web Vitals (mobile, throttled) | TTFB + CLS great; **LCP/FCP poor on pSEO pages** (A.9) |

---

## A.3 🔴 CRITICAL (fix first)

**C1 — The whole AI layer is dead in production.**
The "AI Search" bar on `/jobs` returns nothing and the candidate-recommendation engine produces nothing, because job vectors are never created. The Inngest event `embedding.refresh.job` is **never emitted anywhere in the codebase** (`lib/inngest/functions/embeddings.ts:40` defines the handler; nothing calls it). DB confirms: `job_embeddings` = **0 rows** vs 1,557 published jobs. Worse, Inngest events silently no-op in prod if `INNGEST_EVENT_KEY` is unset (`lib/inngest/client.ts:9`).
→ *Fix:* emit `embedding.refresh.job` on job create/update + ingest; run `npm run backfill:embeddings --env=prod`; or hide the AI bar until then and fall back to keyword search.

**C2 — The Stripe webhook can take someone's money and never publish their job.**
The idempotency "already processed" row is written **before** processing and **never rolled back on failure** (`app/api/webhooks/stripe/route.ts:52`). The code relies on returning 500 so Stripe retries — but the retry is then thrown away as "duplicate." So one transient hiccup on the first webhook → job stays unpublished, no charge recorded, no receipt sent, customer paid for nothing. (0 charges in prod today only because nobody's hit the paywall yet — this fires the moment money flows.)
→ *Fix:* wrap the dedupe insert + processing in one `$transaction`, or delete the dedupe row on the 500 paths.

**C3 — "Delete my account" doesn't actually delete the sensitive data.**
`app/api/cron/purge-soft-deleted/route.ts:49` only deletes the profile row + auth user. It never removes the **résumé file from storage** (name, phone, NPI/DEA, work history), the **candidate embedding**, or the person's rows in `email_sends`. Your published privacy policy promises erasure. This is a GDPR Art. 17 / CCPA gap and a policy misrepresentation.
→ *Fix:* in the purge path, `storage.remove()` the résumé/attachments, delete the candidate embedding, anonymize `email_sends`.

**C4 — Autofill sends EEO data (race, gender, veteran, disability) to OpenAI — against your own policy.**
`app/api/autofill/classify-fields/route.ts:248` appends those fields to the prompt sent to OpenAI. Privacy policy §13 explicitly says these are never shared. A `sensitiveDataConsent` flag exists and is **not checked**. GDPR Art. 9 special-category data to an undisclosed processor.
→ *Fix:* strip the EEO block from the autofill context (it's useless for field classification anyway) or gate on `sensitiveDataConsent === true`; disclose OpenAI as a sub-processor.

---

## A.4 🟠 HIGH (grouped by area)

### SEO / crawlability
| ID | Problem | Where |
|---|---|---|
| S1 | **Soft-404:** `/jobs/<garbage-slug>` returns HTTP **200** "Page Not Found" instead of 404 | `app/jobs/[slug]/page.tsx:653` (`renderGonePage()` should be `notFound()`) |
| S2 | **Any DB error renders every job as "removed"** (200+noindex) → can deindex live jobs | `app/jobs/[slug]/page.tsx:100` |
| S3 | **Auth pages still crawlable past deadline; CI test red.** `AUTH_REBLOCK_DATE` (2026-05-19) passed; only a `console.warn` | `app/robots.ts:19`, `tests/seo/sitemap-budget.test.ts:138` |
| S4 | **Thin/doorway pSEO:** category×city pages render full 200 for 1–2 jobs (only 0-job redirects) | `lib/pseo/category-city-template.tsx:990` |
| S5 | **Hydration error #418** on `/jobs` + pSEO listings — `JobCard` computes "posted X ago" with `new Date()` at render (server≠client) | `components/JobCard.tsx:94`, `lib/utils.ts:143` |
| S6 | **145 dead-link jobs still published/indexed** — health check writes the signal but never unpublishes ("shadow mode") | `app/sitemap.ts:14`, schema:98 |

### Security
| ID | Problem | Where |
|---|---|---|
| Sec1 | **Stored-XSS surface:** job descriptions saved with regex-only sanitize; real sanitizer runs **only at render** — one new render path = stored XSS | `lib/sanitize.ts:181` |
| Sec2 | **Open redirect → phishing/account-takeover:** password-reset `redirectTo` passed to Supabase with no origin check | `app/api/auth/forgot-password/route.ts:51` |
| Sec3 | **Renewal token leak:** `verify-renewal-session` returns the job's management token for any `session_id`, no cookie binding (the new-post path was fixed; renewals weren't) | `app/api/verify-renewal-session/route.ts:73` |

### Tests / CI (the safety net is mostly theater)
| ID | Problem | Where |
|---|---|---|
| T1 | **CI is red right now and nobody noticed** (the expired-reblock test fails) | `tests/seo/sitemap-budget.test.ts:138` |
| T2 | **No CI runs the full Vitest suite or any Playwright** — ~60 unit tests + all E2E never gate a deploy | `.github/workflows/*` |
| T3 | **Zero tests** on the Stripe webhook, the apply flow, IDOR auth, or the soft-404 | — |

### Email / deliverability (you send 34k+/month)
| ID | Problem | Where |
|---|---|---|
| E1 | **One-click unsubscribe (RFC 8058) is broken** — the header POSTs to a client-only page with no handler; Gmail/Yahoo penalize this | `lib/email-service.ts:168` |
| E2 | **Bulk job-alert sends store `resendId=null`** → delivery/bounce webhooks can't attach (why prod shows `sent 34,769` vs `delivered 1,183`) | `lib/job-alerts-service.ts:625` |
| E3 | **candidate-alerts sends with no suppression check + no unsubscribe header** — mails addresses that already bounced/complained | `app/api/cron/candidate-alerts/route.ts:121` |

### Frontend / product
| ID | Problem | Where |
|---|---|---|
| F1 | **The "AI Search" bar on /jobs is a dead end** — 404 when flag off, 0 results when on, and it throws away the user's typed query | `app/jobs/JobsPageClient.tsx:456` |
| F2 | **Save-job self-corrupts:** detail-page button (array) and list hook (map) share `localStorage['savedJobs']` — saving from the detail page corrupts the saved list | `components/SaveJobButton.tsx:17` vs `lib/hooks/useSavedJobs.ts:5` |

### Privacy / legal (beyond C3/C4)
| ID | Problem | Where |
|---|---|---|
| P1 | **OpenAI, Upstash, Inngest are undisclosed sub-processors** despite receiving résumé PII | `app/sub-processors/page.tsx` |
| P2 | **DSAR endpoint is intake-only** — records a request, executes no access/deletion, no identity check | `app/api/data-request/route.ts:65` |

### Performance
| ID | Problem | Where |
|---|---|---|
| Perf1 | Every pSEO page fetches **all** job columns (incl. multi-KB `description`) without a `select` — ~60KB wasted/page ×20+ pages | `app/jobs/*/page.tsx` |
| Perf2 | pSEO stats run 3 serial queries, called **twice** per render (no React `cache()`) → 7+ serial DB hits/render | `app/jobs/*/page.tsx` |
| Perf3 | Hydration #418 (S5) forces React to throw away SSR and re-render — hurts INP/TBT on the highest-traffic pages | as S5 |

---

## A.5 🟡 MEDIUM (notable — full list in `tmp/audit/digest.md`)

| Area | Items |
|---|---|
| **Security** | Edit-token never expires + leaks `contactEmail` (`app/api/jobs/edit/[token]/route.ts:70`); employer ownership resolves on `userId OR contactEmail` → impersonation by registering with an employer's email (`app/api/employer/applicants/route.ts:40`); cron auth fully bypassed when `NODE_ENV=development` (`lib/auth/verify-cron-or-admin.ts:23`); SSRF in dead-link prober, no private-IP block (`lib/health/probe.ts`); Resend webhook has no idempotency; `sanitize-html` allows `style` on all tags |
| **Data quality** | 508 published jobs <300-char descriptions; 235 with no salary (hurts Google Jobs salary filter); 0/4,723 companies have logos; 34,964 dead/unpublished rows retained (bloat); 134–145 dead-link jobs still live |
| **DB / perf** | Missing indexes on `originalPostedAt` + `stateCode` (seq scan on every listing/sort); 222 `ILIKE` category filters can't use indexes; pSEO stats aggregator issues ~190k sequential queries (likely times out → stale stats); freshness-decay does per-row UPDATEs; employer-report N+1 |
| **Crons** | 24/29 crons bypass `withCronTracking` (invisible in `cron_runs`); `gsc-health-check` returns 200 `{skipped}` when its key is unset (→ `gsc_snapshots` empty); `purge-inactive-users` deletes accounts **without sending the legally-promised warning email** (it's a TODO); `social-post`/`instagram-post`/`enrich-thin-jds` aren't scheduled at all; `llm-enrichment` marks 200 jobs "enriched" even when OpenAI is down |
| **Email** | `EmailSend.status` is single-mutable (funnel metrics structurally wrong); visible footer "unsubscribe" link discards its token; suppression not enforced centrally (each caller must remember) |
| **Code quality** | `middleware.ts` 967 lines, `lib/ingestion-service.ts` 1,342, `app/jobs/[slug]/page.tsx` 1,218 (all over the 800 limit); 206 `console.log` in prod (one logs `user.email` to the browser); 30 `as any` on Prisma writes; `noUnusedLocals/Parameters` off; 28 copy-paste pSEO pages with confirmed drift; inconsistent API error shapes across 160 routes |
| **A11y** | Unlabeled SalaryCalculator/LicensureChecker selects; MobileFilterDrawer keeps off-canvas controls in tab order; hint/counter text fails contrast (1.5–2.9:1); no global `prefers-reduced-motion` for framer-motion; login error banner not `role="alert"` |
| **Payments / privacy** | `ENABLE_PAID_POSTING` is a phantom flag (read nowhere; checkout is live regardless); free-quota gameable via cheap shell domains (team-deferred); GA loads in consent-pending mode vs policy wording |

---

## A.6 Production database reality (read-only, audit day)

| Metric | Value | Meaning |
|---|---|---|
| Jobs total / published | 36,521 / **1,557** | 34,964 dead rows retained |
| Published: aggregated vs employer | **1,547 / 10** | 99.4% scraped content |
| `job_embeddings` / `candidate_recommendations` / `gsc_snapshots` | **0 / 0 / 0** | AI + GSC monitoring dead |
| Stripe `job_charges` / `processed_events` | **0 / 0** | zero revenue; kill-switch is fake |
| Published jobs: thin desc / no salary | 508 (33%) / 235 (15%) | content quality |
| Companies / with logo | 4,723 / **0** | every company page is logo-less |
| Dead-link jobs still published | **~134–145** | + 12 user "expired" reports |
| Apply clicks / views | 271 / 108,976 = **0.25%** | funnel broken or bot-heavy |
| Crons logging a run (7d) | **4 of ~29** | 24 are invisible |

## A.7 ✅ What's actually GOOD (don't "fix")

Page-level authorization holds (tested live — seeker & employer both correctly blocked from `/admin`). Cron + admin auth gating, Stripe signature verification + idempotency table, Resend Svix verification, file-upload magic-byte checks, **sitemaps correctly exclude all 34,964 unpublished jobs**, ingestion healthy (710 runs, 0 fails/14d), freshness gating works, candidate-contact paywall works, employer dashboard/talent-pool are well-built, **the Supabase data API is locked down (anon + authenticated both 403 on all sensitive tables — see A.10)**, `.env.prod` is correctly gitignored. The privacy *design* is mature — the gaps are in *execution*, not intent.

## A.8 If you fix only 10 things, in this order

1. **C2** — wrap the Stripe webhook in a transaction (before real money flows).
2. **C3 + C4** — make deletion actually delete; stop sending EEO data to OpenAI.
3. **S1 + S2** — `notFound()` instead of `renderGonePage()`; re-throw DB errors.
4. **S5** — mount-guard the freshness label (kills #418 sitewide).
5. **T1 + T2** — add a `vitest run` + Playwright-smoke CI gate.
6. **S3** — re-block the auth pages in `robots.ts`.
7. **C1** — emit `embedding.refresh.job` + backfill, or hide the dead AI bar.
8. **Sec1–3** — sanitize JD at write; validate `redirectTo`; cookie-bind renewal token.
9. **E1 + E2** — fix one-click unsubscribe; capture `resendId`.
10. **S4** — gate category×city pSEO on `<3 jobs → notFound()`.

## A.8.1 Implementation status (updated 2026-06-01)

Fixes landed with regression tests that fail on the pre-fix code:

| ID | Fix | Test (red→green proven) |
|---|---|---|
| C2 | Stripe webhook idempotency wrapped so failed events re-process | `tests/api/webhooks-stripe-c2.test.ts` ✅ |
| C3 | Account deletion now removes résumé/embedding/email PII | `tests/api/purge-soft-deleted-c3.test.ts` ✅ |
| C4 | EEO data gated behind `sensitiveDataConsent` before any OpenAI call | `tests/api/autofill-eeo-c4.test.ts` ✅ |
| Sec1 | JD `description` sanitized with the DOM sanitizer at **write** time | `tests/lib/sanitize.test.ts` ✅ |
| Sec2 | `forgot-password` `redirectTo` restricted to first-party origins | `tests/lib/redirect-origin-guard.test.ts` ✅ |
| SSRF | dead-link prober blocks private/internal hosts + redirect hops | `tests/lib/ssrf-guard.test.ts` ✅ |
| S3 | auth pages re-blocked in `robots.ts` after the deadline | `tests/seo/sitemap-budget.test.ts` ✅ |
| S6 | dead-link jobs excluded from sitemaps via shared `lib/active-job-filter.ts` | `tests/seo/sitemap-active-jobs.test.ts` ✅ |
| AC-1 | edit-token PII/expiry hardening (in progress) | — |
| AC-3 | cron dev-bypass tightened (in progress) | — |

### Batch 2 (2026-06-01) — remaining HIGH/MEDIUM closed with TDD (red→green proven)

| ID | Fix | Test |
|---|---|---|
| S5 | `getJobFreshness` made clock-injectable (kills hydration #418); `JobCard` ageIndicator also mount-guarded | `tests/lib/get-job-freshness.test.ts` ✅ |
| F2 | save-job state unified on one shared map-shaped store (`lib/saved-jobs.ts`); button + hook both consume it | `tests/lib/saved-jobs.test.ts` ✅ |
| S4 | thin category×city pSEO (<3 jobs) now `notFound()` instead of a crawlable 200 (`lib/pseo/render-gate.ts`) | `tests/pseo/category-city-render-gate.test.ts` ✅ |
| F1 | AI-search bar falls back to keyword search **preserving the typed query** on flag-off/error/0-results (`lib/jobs/resolve-search-mode.ts`) | `tests/lib/resolve-search-mode.test.ts` ✅ |
| E1 | real RFC 8058 one-click unsubscribe POST (`/api/one-click-unsubscribe`); all `List-Unsubscribe` headers retargeted via `lib/email/list-unsubscribe.ts` | `tests/api/one-click-unsubscribe.test.ts`, `tests/lib/list-unsubscribe.test.ts` ✅ |
| E2 | Resend batch message-id captured to `EmailSend.resendId`; failed sends write `status='failed'` not a phantom `sent` (`lib/email/batch-send-result.ts`) | `tests/lib/job-alerts-resend-id.test.ts` ✅ |
| E3 | candidate-alerts now suppression-gated + carry a real-token `List-Unsubscribe` header | `tests/api/candidate-alerts-suppression.test.ts` ✅ |
| C1 | `embedding.refresh.job` now emitted on employer edit (`/api/jobs/update`) + republish (`toggle-publish`) — the 2 sites the partial fix missed | `tests/api/employer-job-update-embedding-c1.test.ts` ✅ |
| P1 | OpenAI, Upstash, Inngest added to the sub-processors disclosure | `tests/pages/sub-processors.test.ts` ✅ |
| P2 | DSAR route now requires an authenticated, email-owning session (401/403) and **executes** the request (deletion → soft-delete+purge; access → export) | `tests/api/data-request-p2.test.ts` ✅ |
| Perf1 | pSEO listing fetchers `omit` the multi-KB `description` column (cards use `descriptionSummary`) — 4 fetchers via `lib/pseo/job-listing-omit.ts` | `tests/pseo/listing-omit.test.ts` ✅ |
| Perf2 | pSEO stats aggregators wrapped in React `cache()` → the metadata+page duplicate call dedupes to one DB hit/render | (tsc + inspection) |
| A11y | label↔select binding (SalaryCalculator, LicensureChecker), `role="alert"` on auth error banners, hint-text contrast raised to AA | `tests/lib/a11y-tokens.test.ts` ✅ |
| S1/S2 | regression locks for the already-shipped soft-404 `notFound()` + DB-error re-throw | `tests/seo/job-detail-status-s1-s2.test.ts` ✅ |
| Sec3 | regression lock for the already-shipped renewal-token cookie binding | `tests/api/verify-renewal-session-sec3.test.ts` ✅ |

**Status:** full suite **1068 tests / 92 files green**; `npx tsc --noEmit` = 0 errors.

### Batch 2 — adversarial self-review pass (caught & fixed before commit)

A multi-agent review (4 dimensions → independent per-finding verification) over the Batch-2 diff confirmed the frontend (F1/F2/S5) and data/perf (C1/Perf/S4) changes clean, but caught **2 HIGH + 3 MEDIUM** real bugs in the email/DSAR changes — all now fixed and tested:

- **HIGH** — job-alert one-click URL fed `JobAlert.token`, but `/api/one-click-unsubscribe` resolves `EmailLead.unsubscribeToken` → the header was a no-op for the highest-volume mail. Now sources the correct token via `getOrCreateUnsubToken`.
- **HIGH** — `interpretResendBatch` read the wrong nesting level (Resend returns `{ data: { data: [{id}] } }`, not `{ data: [{id}] }`) → E2's resendId capture would have silently stayed null in prod; the test fixture had masked it. Interface + interpreter + fixture corrected.
- **MEDIUM** — DSAR deletion used `userProfile.update` → a profileless OAuth user hit P2025, orphaning an `in_progress` request and leaving them signed in. Switched to `updateMany` + count check (idempotent completion + signOut).
- **MEDIUM** — DSAR `access` export returned only 11 fields → incomplete under GDPR Art. 15. Now returns the full profile + the directly-attributable related records (parity with `/api/profile/export`).
- **MEDIUM** — a non-rate-limit throw from `resend.batch.send` aborted *all* remaining alert batches. Now fails only the offending batch and continues.
- *(Deliberately not changed: rate-limiting the one-click endpoint — IP rate limits risk throttling legitimate Gmail/Yahoo POSTs from shared egress IPs; the unguessable token already gates abuse, and a blocked unsubscribe is worse for compliance.)*

**Still open (not blocking):** AC-1/AC-3 (edit-token + cron-bypass, operator's in-progress WIP); the MEDIUM code-quality/DB-index backlog (oversized files, missing `originalPostedAt`/`stateCode` indexes, `console.log` cleanup); and three operational follow-ups surfaced by this batch — (1) set `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` in Vercel prod and run `npx tsx scripts/backfill-job-embeddings.ts` to populate the 1,557-job embedding backlog (C1 emits are now wired but the backlog stays empty until backfill); (2) gate the public `/data-request` form behind login (it now surfaces "Authentication required" from the hardened API); (3) decide whether to disclose Anthropic as a fallback AI sub-processor (P1).

---

## A.9 Core Web Vitals — measured (mobile-emulated, 4× CPU, ~Slow 4G, lab single-run)

| Page type | LCP | FCP | CLS | TTFB | JS |
|---|---|---|---|---|---|
| Home `/` | 3.00s 🟡 | 2.90s 🟡 | 0.008 🟢 | 0.18s 🟢 | 157KB |
| Jobs listing `/jobs` | 3.55s 🟡 | 2.70s 🟡 | 0.008 🟢 | 0.09s 🟢 | 157KB |
| Job detail | 3.90s 🟡 | 2.42s 🟡 | 0.008 🟢 | 0.10s 🟢 | 157KB |
| **pSEO category** `/jobs/remote` | **5.22s 🔴** | **4.12s 🔴** | 0.013 🟢 | 0.09s 🟢 | 157KB |
| **pSEO state** `/jobs/state/california` | **4.38s 🔴** | **3.88s 🔴** | 0.008 🟢 | 0.20s 🟢 | 158KB |

**Read:** TTFB is excellent everywhere (0.09–0.20s — server/CDN is fast, **not** the bottleneck) and CLS is excellent (no layout shift). The problem is **LCP/FCP**: ~2.3–4s passes between the fast server response and first paint — that's **client-side JS/hydration cost**. It's worst on pSEO pages (LCP 4.4–5.2s = "poor"), which is exactly where the hydration #418 error (S5) fires and where the heavy `'use client'` trees + over-fetch (Perf1/2) live. **These are the highest-traffic SEO pages, so poor mobile LCP directly risks Google rankings.** Fixing S5 + Perf1/2 should pull LCP under the 2.5s "good" bar. *(Lab numbers — field/CrUX may differ; thresholds: LCP 🟢<2.5s 🔴>4s, FCP 🟢<1.8s 🔴>3s, CLS 🟢<0.1, TTFB 🟢<0.8s.)*

## A.10 Supabase RLS / data-API — VERIFIED SECURE ✅

The one true security blind spot, tested directly. Result: **clean.**

- **37/79 public tables have RLS enabled**, but only **2 policies exist** (both on `blog_posts`). RLS-enabled + no-policy = **deny-all** (service-role bypasses it server-side, which is how the app reads).
- The real gate is **GRANT revocation**: the `anon` and `authenticated` Postgres roles have a table grant on **`blog_posts` only**. Every other table is ungranted → unreachable via PostgREST regardless of RLS.
- **Empirical test:** grabbed the public anon key + a real logged-in user's JWT from the live site and queried 18 sensitive tables (`user_profiles`, `candidate_licenses`, `job_applications`, `candidate_embeddings`, `email_sends`, `program_director_leads`, etc.) directly via the Supabase data API → **all returned `403 permission denied`**. No data leaks to anon or authenticated users.
- **Conclusion:** there is **no direct-data-API exposure**. All data access correctly flows through the app's server-side service-role + app-level auth (which page-level testing confirmed holds).
- **One hardening note (LOW, not a vuln):** security relies on grant revocation, not RLS policies. The 42 RLS-**off** tables (e.g. `candidate_embeddings`, `program_director_leads`, `email_sends`) would be instantly exposed if anyone ever ran `GRANT SELECT ... TO authenticated` or flipped Supabase's "enable read access" UI toggle. Enabling RLS on those tables would make a stray grant harmless (defense in depth).

---

# PART B — RUNBOOK (re-run this anytime)

## B.0 Safety rules
1. **Prod DB is READ-ONLY** — `SELECT` only, never mutate. (Scripts enforce this.)
2. **No outward actions on prod** — no applications, job posts, messages, payments, deletions, cron triggers.
3. **Never print secrets.** `.env.prod` holds live keys — keep it gitignored.
4. **Creds via env vars, case-sensitive.** Never hardcode.

## B.1 Setup
```powershell
$env:AUDIT_SEEKER_EMAIL = "dvskr.1234@gmail.com"; $env:AUDIT_SEEKER_PASS = "<seeker-pass>"
$env:AUDIT_EMPLOYER_EMAIL = "test@pmhnphiring.com"; $env:AUDIT_EMPLOYER_PASS = "6174@Sensei"
```
**Gotcha:** the live site is behind Vercel Attack Challenge Mode — `curl`/`fetch` get 429. Always use a real headless browser (all scripts do).

## B.2 Run the phases
```bash
node scripts/audit/crawl-public.mjs > tmp/audit/crawl.log 2>&1   # 1: live pages (soft-404, #418, canonical)
node scripts/audit/db-analysis.mjs                               # 2: prod DB + 🚩 red-flag gauges
node scripts/audit/auth-flows.mjs                                # 3: logged-in flows + authz probes
node scripts/audit/sitemaps.mjs                                  # 4: sitemaps (unpublished-leak check)
# 5: run scripts/audit/code-audit.workflow.js via the Workflow tool (14 agents, ~20 min)
node scripts/audit/parse-findings.mjs <task-output.json> tmp/audit/digest.md   # 6: digest results
```

**Pass/fail checks:**
- DB gauges must show ✅ not 🚩: `job_embeddings`, `candidate_recommendations`, `gsc_snapshots` **>0**; crons-7d **≥15**; dead-links **0**.
- Crawl: `/jobs/<garbage>` must be **404/410**, not 200; no React **#418** page errors.
- Auth: every `authz:*` row must show `<AUTH-REDIRECT>` to `/unauthorized`.
- Sitemap: `/api/sitemaps/jobs/0` URL count must equal the published-job count.

## B.3 Quick weekly health check (one command)
```powershell
node scripts/audit/db-analysis.mjs   # prints 🚩/✅ vs the 2026-05-31 baseline above
```

## B.4 Cadence & tracking
- **Full audit:** quarterly or before a launch / pricing change.
- **Light (phases 1–4, ~10 min):** weekly / post-deploy.
- **After a fix:** re-run the relevant phase to confirm, then tick it off in A.3/A.4.
- **Best end state:** put the cheap checks in CI (fixes T2) so deploys gate on soft-404, #418, canonical, and the reblock test — then this runbook becomes verification, not discovery.

## B.5 Scripts (`scripts/audit/`)
`crawl-public.mjs` (live pages) · `db-analysis.mjs` (read-only DB + gauges) · `auth-flows.mjs` (logged-in + authz) · `sitemaps.mjs` · `rls-audit.mjs` (RLS state + anon data-API exposure) · `rls-authed-test.mjs` (logged-in user data-API exposure) · `cwv.mjs` (Core Web Vitals, mobile throttled) · `code-audit.workflow.js` (14-agent code review) · `parse-findings.mjs` (results → digest). All env-driven; none mutate prod.

Optional deep-dive commands:
```bash
node scripts/audit/rls-audit.mjs                                   # RLS state + anon-key data-API test
AUDIT_SEEKER_EMAIL=.. AUDIT_SEEKER_PASS=.. node scripts/audit/rls-authed-test.mjs   # authenticated data-API test
node scripts/audit/cwv.mjs                                         # measured Core Web Vitals (5 page types)
```
