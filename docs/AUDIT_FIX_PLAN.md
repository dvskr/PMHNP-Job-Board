# Audit Fix Plan — Full Completion

**Plan date:** 2026-06-01
**Inputs:**
- `docs/AUDIT_RUNBOOK.md` (2026-05-31 — 4 CRITICAL / 30 HIGH / 61 MEDIUM / 26 LOW)
- `tmp/catalog-audit.log` (2026-06-01 — fresh data-quality findings)
- `scripts/audit-catalog-quality.ts` (re-runnable verification harness)

**Goal:** every issue closed with code change + test + verification. Nothing deferred silently.

---

## Master severity ledger (consolidated)

| Tier | Source | Count | Status |
|---|---|---|---|
| 🔴 CRITICAL | RUNBOOK C1-C4 | 4 | pending |
| 🟠 HIGH | RUNBOOK A.4 + catalog audit | 30 + 4 | pending |
| 🟡 MEDIUM | RUNBOOK A.5 + catalog audit | 61 + 7 | pending |
| ⚪ LOW | RUNBOOK | 26 | pending |
| **TOTAL** | | **132** | |

---

## Execution phases

Work is sequenced so the lowest-risk + highest-leverage fixes ship first, the broadest test net is laid before risky payment/auth changes, and re-verification is automated.

### Phase 1 — Catalog data quality (this week)
*Focus: my fresh audit findings, all data-only or write-time guards.*

| # | Issue | Fix | Test | Verify |
|---|---|---|---|---|
| P1.1 | **1,106 slugs >80 chars (71%)** | **REVISED — not a bug.** Route handler at `app/jobs/[slug]/page.tsx:356` extracts the full 36-char UUID from the slug via regex; shortening would break routing. The 80-char threshold from the audit was naïve; revised to **> 100 chars** (= slugify cap bypass = legacy). Real action: find rows > 100 chars and verify they are pre-cap legacy; don't backfill (SEO equity). Update audit script threshold. | unit test that `slugify(title, uuid)` always returns ≤ 97 chars | Audit Section 4 — > 100 chars count ≤ legacy floor |
| P1.2 | **8 published jobs with NULL applyLink** | One-shot DB fix script (`scripts/fix-null-applylink.ts`) — unpublish or backfill from raw_data; add Prisma `@@check` shape via service-layer guard in ingest + post-free paths | `tests/ingest/publish-invariants.test.ts` — null applyLink rejects publish | Audit Section 3 → 0 |
| P1.3 | **241 jobs (15.5%) missing salary** | Add salary back-fill cron stage (extract from description via LLM); raise salary-missing weight in `qualityScore` | `tests/lib/quality-score.test.ts` updated | Audit Section 4 → < 100 |
| P1.4 | **1 salary inverted (min > max)** | Unpublish that one + add ingest-time swap guard | `tests/lib/job-normalizer.test.ts` — swap-on-invert | Audit Section 3 → 0 |
| P1.5 | **2 salary outliers** | Add `>$500k` or `<$20k` salary clamp at ingest (treat as `unknown`) | unit test in `quality-score` | Audit Section 3 → 0 |
| P1.6 | **NaphCare casing variants (2 → 1)** | Run `scripts/dedup-companies.ts` for NaphCare; tighten normalization in `lib/company-normalizer.ts` to lowercase-strip-on-write | unit test in `company-normalizer` | Audit Section 3 → 0 variants |
| P1.7 | **6 NULL `originalPostedAt` published** | Backfill from `createdAt` (one-shot); add ingest guard that defaults to `Date.now()` instead of NULL | invariant test | Audit Section 3 → 0 |
| P1.8 | **4 jobs <200-char description** | Unpublish them; tighten `SOFT_COMPLETENESS_FLOOR` enforcement at publish time | normalizer test | Audit Section 4 → 0 |
| P1.9 | **10 NULL-source orphans** | Audit + backfill source from externalId pattern; add NOT NULL constraint via migration | migration test | Audit Section 1 → 0 nulls |
| P1.10 | **3 stale `ats-jobs-db` rows** | Unpublish (source decommissioned 2026-05-06) | n/a | Audit Section 1 → 0 |
| P1.11 | **Verify workable/doccafe/usajobs first run** | Watch wave-summary 2026-06-01 12:50 UTC; if zero, debug | smoke test runs in `scripts/check-usajobs-api.ts` | Audit Section 1 → >0 per source |

**Phase 1 deliverable:** `tmp/catalog-audit-post-p1.log` showing all Section 3 + 4 numbers ≤ 5% of pre-fix.

### Phase 2 — Critical runbook bugs  ✅ MERGED 2026-06-01

| # | Issue | Fix | Test | Status |
|---|---|---|---|---|
| P2.1 (**C2**) | Stripe webhook can take money without publishing | Per-error-path `cleanupDedupe()` + outer-catch rollback via `dedupedEventId` tracking. (Full $transaction refactor would touch 300 LOC for equivalent correctness.) | `tests/api/webhooks-stripe-c2.test.ts` — 4 tests | ✅ |
| P2.2 (**C3**) | Account-delete leaks PII | Purge cron now: deletes resume + avatar storage files, deletes `CandidateEmbedding`, anonymizes `email_sends.to`, then drops profile + Supabase auth identity. Defensive: each step is loud-on-failure but continues. | `tests/api/purge-soft-deleted-c3.test.ts` — 4 tests | ✅ |
| P2.3 (**C4**) | Autofill sends EEO data to OpenAI | EEO block in `buildProfileContext()` now gated on `profile.sensitiveDataConsent === true`. System prompt updated to handle absent profile data via "Decline to self-identify" or empty value. | `tests/api/autofill-eeo-c4.test.ts` — 6 tests | ✅ |
| P2.4 (**C1**) | AI layer dead — `job_embeddings = 0` | `embedding.refresh.job` now dispatched from ingest insert (`lib/ingestion-service.ts`), post-free create (`app/api/jobs/post-free/route.ts`), and admin edit when an embed-field changes (`app/api/admin/jobs/[id]/route.ts`). New backfill script for existing 1,557 jobs at `scripts/backfill-job-embeddings.ts`. | Manual: emit-or-noop verified by reading code; backfill counter run pending INNGEST_EVENT_KEY | ✅ code, ⏸ backfill run |

### Phase 3 — High-priority SEO + Security

| # | Issue | Fix | Test |
|---|---|---|---|
| P3.1 (S1) | `/jobs/<garbage>` returns 200 "Page Not Found" | Replace `renderGonePage()` with `notFound()` in `app/jobs/[slug]/page.tsx:653` | `tests/seo/job-page-not-found.e2e.ts` — assert HTTP 404 + no soft-404 marker |
| P3.2 (S2) | Any DB error renders job as "removed" → can deindex live jobs | `app/jobs/[slug]/page.tsx:100` re-throw on DB error to trigger 500, never noindex | mocked DB error test |
| P3.3 (S5) | Hydration #418 from server-vs-client date diff | `JobCard.tsx:94` mount-guard the "posted X ago" label or use stable ISO | Playwright check for no console error |
| P3.4 (S6) | 145 dead-link jobs still published | Switch `app/sitemap.ts` and detail page to skip when `healthConsecutiveMissing > 3` | E2E: dead-link job → 410, no in sitemap |
| P3.5 (S3) | Auth pages still crawlable | Remove `console.warn` past `AUTH_REBLOCK_DATE`; force-reblock in `app/robots.ts:19` | existing `sitemap-budget.test.ts` un-skipped |
| P3.6 (S4) | Thin pSEO doorway pages | Gate category × city render on ≥3 jobs (already at 0) | snapshot test |
| P3.7 (Sec1) | Stored-XSS surface in JD | Run `sanitize-html` at WRITE-time, not just render; migration to re-sanitize existing rows | `tests/lib/sanitize.test.ts` — XSS payloads |
| P3.8 (Sec2) | Open redirect in password-reset | Validate `redirectTo` origin in `app/api/auth/forgot-password/route.ts:51` against allow-list | unit + E2E |
| P3.9 (Sec3) | Renewal token leak | Cookie-bind the management token in `app/api/verify-renewal-session/route.ts:73` | unit test on `verifySessionId` |

### Phase 4 — Tests + CI (the safety net)

| # | Issue | Fix |
|---|---|---|
| P4.1 (T1) | CI red (reblock test) | Fix per P3.5 |
| P4.2 (T2) | No CI runs Vitest/Playwright | Add `.github/workflows/test.yml` — `vitest run` + `playwright test --grep @smoke` on PR |
| P4.3 (T3) | Zero tests on Stripe/apply/IDOR/soft-404 | Tests written as part of P2.1, P3.1, P3.8, etc. — meta-issue closes when listed tests merge |

### Phase 5 — Medium issues (batched)

The 61 MEDIUM items group into 7 sub-batches. Each sub-batch ships as a single PR.

| Batch | RUNBOOK A.5 items | Effort |
|---|---|---|
| P5.A | **Security**: edit-token expiry, employer ownership impersonation, cron-auth bypass, SSRF prober, Resend webhook idempotency, sanitize-html style attr | 2 days |
| P5.B | **Data quality**: 508 thin-description jobs (LLM rescue + raise floor), 235 no-salary backfill, company logos backfill, dead-link unpublish, dead-row cleanup | 1 day |
| P5.C | **DB perf**: `originalPostedAt` + `stateCode` indexes, replace `ILIKE` category filters with pre-computed slugs, pSEO stats `cache()`, freshness-decay batch UPDATE, employer-report N+1 | 1 day |
| P5.D | **Crons**: wrap remaining 24 crons in `withCronTracking`; fix `gsc-health-check` skipped-when-unset; deliver the legally-promised warning email from `purge-inactive-users`; schedule `social-post`/`instagram-post`/`enrich-thin-jds`; LLM-enrichment failure handling | 1 day |
| P5.E | **Email**: `EmailSend.status` history table; visible footer unsubscribe-link handler; central suppression enforcement | 0.5 day |
| P5.F | **Code quality**: split files >800 LOC (middleware.ts, ingestion-service.ts, jobs/[slug]/page.tsx); remove 206 console.log; replace 30 `as any` on Prisma writes; turn on `noUnusedLocals/Parameters`; reduce pSEO drift; standardize API error envelope | 2 days |
| P5.G | **A11y / privacy / payments**: SalaryCalculator/LicensureChecker labels, drawer focus trap, contrast fixes, `prefers-reduced-motion`, ARIA on login error; remove phantom `ENABLE_PAID_POSTING`; consent-gated GA | 1 day |

### Phase 6 — LOW + verification

26 LOW items batched into 1 PR. Then re-run the full audit and update RUNBOOK with green checks per A.3/A.4 row.

---

## Test strategy

Each fix lands with at minimum one test of each applicable type:

| Test type | Tool | Where | Trigger |
|---|---|---|---|
| Unit | Vitest | `tests/lib/`, `tests/utils/` | Every pure-function fix |
| API contract | Vitest + supertest | `tests/api/` | Every route change |
| E2E | Playwright | `tests/e2e/` | Every user-visible change |
| Visual regression | Playwright screenshot | `tests/visual/` | Every UI fix |
| Migration | `prisma migrate diff` | `prisma/migrations/` | Every schema change |
| Cron invariant | Vitest mock | `tests/cron/` | Every cron handler change |

**CI gate (Phase 4):**
```yaml
# .github/workflows/test.yml — runs on every PR
- npm run typecheck
- npm run vitest run --coverage  # fail if coverage of changed files <80%
- npm run playwright test --grep @smoke
- npm run audit:catalog          # runs scripts/audit-catalog-quality.ts; fail if any Section 3 count > baseline
```

---

## Re-verification protocol (after each phase)

```powershell
# 1. Catalog data quality
.\scripts\run-prod-audit.ps1
# Compare tmp/catalog-audit.log against the baseline 2026-06-01 numbers in this doc.

# 2. Full audit suite (after major phases)
node scripts/audit/crawl-public.mjs > tmp/audit/crawl.log 2>&1
node scripts/audit/db-analysis.mjs
node scripts/audit/auth-flows.mjs
node scripts/audit/sitemaps.mjs
node scripts/audit/parse-findings.mjs <task-output.json> tmp/audit/digest.md

# 3. Code review (the 14-agent workflow that originally found these)
# Run scripts/audit/code-audit.workflow.js via the Workflow tool.
```

**Pass criteria for closing the plan:**
- `tmp/catalog-audit.log` Section 3 counts = 0 for all schema bugs
- `tmp/catalog-audit.log` Section 4 — slug avg ≤ 65, max ≤ 70, no-salary < 100
- `db-analysis.mjs` red flags → green: `job_embeddings > 0`, `candidate_recommendations > 0`, `crons_7d ≥ 25`, `dead_links = 0`
- All RUNBOOK C1-C4 / S1-S6 / Sec1-3 / T1-T3 / E1-E3 / F1-F2 / P1-P2 / Perf1-3 rows green
- CI workflow runs Vitest + Playwright smoke on every PR
- This document updated with completion dates per row

---

## Branching strategy

| Branch | Scope | Merge to |
|---|---|---|
| `fix/catalog-p1` | Phase 1 (catalog data) | dev |
| `fix/critical-c1-c4` | Phase 2 | dev |
| `fix/seo-sec-high` | Phase 3 | dev |
| `chore/ci-tests` | Phase 4 | dev |
| `fix/medium-p5a` … `fix/medium-p5g` | Phase 5 (per batch) | dev |
| `fix/low-batch` | Phase 6 | dev |

Each branch must pass CI before merging. After Phase 6, `dev` is promoted to `main` for production rollout.

---

## Tracking

This document is the source of truth. Each row in the phase tables gets a **status + completion date** column once execution starts:

| status | meaning |
|---|---|
| pending | not started |
| in-progress | branch open |
| review | PR open |
| merged | landed on dev |
| verified | re-audit confirms green |
