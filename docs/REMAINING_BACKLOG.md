# Remaining Backlog — post-audit triage

**As of:** 2026-06-04 · **Branch:** `dev` (deploy via `dev → main`)

The 2026-05-31 audit's critical + high + the three "real" medium batches are **closed, tested, and deployed** (or one merge away). What remains is **optional**: hygiene, low-exposure edges, and a few ops tasks. Nothing here is user-breaking or a security/data risk.

This doc is the honest map of what's left, **why it's low-priority**, and the **safe way** to do each — so it's tracked for whenever, not lost.

> Reality check from this session: re-measuring prod showed the audit **overstated** the data/perf backlog. P5.B (data) is pipeline-maintained; P5.C (perf) queries are 3–5ms index-backed (proven by `EXPLAIN ANALYZE`). Don't trust the audit's stale numbers — **re-measure before "fixing."**

---

## 1. Operational follow-ups (not code — highest leverage)

| Task | Effect | Where |
|---|---|---|
| Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` in Vercel | Turns on **ongoing** embedding freshness for new/edited jobs. Emits are wired (C1) but silently no-op without the key. Existing catalog already backfilled directly. | Vercel env |
| Configure `GSC_SERVICE_ACCOUNT_KEY` | Turns on GSC monitoring → `gsc_snapshots` stops being empty; `gsc-health-check` stops skipping. | Vercel env |
| Confirm the 24 newly-tracked crons in `cron_runs` after ~24h | Verifies P5.D end-to-end (they fire on schedule; couldn't force-trigger — CRON_SECRET is Vercel-only). Use `scripts/audit/cron-runs-status.ts` or the daily-report. | — |

---

## 2. Code hygiene (P5.F) — low value, do incrementally

| Item | Why low-priority | Safe way to tackle |
|---|---|---|
| Split oversized files — `middleware.ts`, `lib/ingestion-service.ts` (~1.3k), `app/jobs/[slug]/page.tsx` (~1.2k) | **Zero functional gain; real regression risk** on prod-critical code. This is the one batch where doing it carelessly is *negative* value. | Extract **pure** helpers one at a time, each with a unit test, behind a green `tsc` + full suite. Never one big move. Not worth it unless a file is actively being changed anyway. |
| Remaining `console.log` noise (~200) | The **only one that mattered (PII) is fixed** + locked by a test. The rest are harmless server logs. | Add an ESLint `no-console` rule (allow `warn`/`error`), fix the surfaced hot paths. Mechanical. |
| ~30 `as any` on Prisma writes | Type-safety smell, not a runtime bug. | Replace one at a time with the generated Prisma input type; `tsc` guards each. |
| Enable `noUnusedLocals` / `noUnusedParameters` | Surfaces dead code, but flips on a wave of fixes at once. | Enable in a dedicated branch, fix the surfaced items, expect churn; land separately from feature work. |
| Standardize API error envelope (~160 routes) | Inconsistent shapes, but nothing breaks. | Define one `apiError(code, message)` helper; migrate routes opportunistically as they're touched, not in a big sweep. |
| 28 copy-paste pSEO pages with drift | Maintenance smell. | Reuse the **drift-guard test pattern** already established in `tests/seo/jobs-segments-drift.test.ts` (assert the set matches the filesystem) to catch divergence in CI. |

---

## 3. Deferred SEO edges — low exposure (fix at the middleware layer)

> In this app, a page-route `notFound()` renders **HTTP 200** (middleware owns `/jobs/*` status). So any SEO status fix must go in `middleware.ts`, and must be **re-verified in a live browser after deploy** — a passing test alone won't prove it (that's how the original S1 "fix" looked done but wasn't).

| Edge | Exposure | Safe fix |
|---|---|---|
| **#2** — valid-but-thin city pages (`<3 jobs`) may still 200 soft-404 | Low: already out of the sitemap + no internal links after the related-cities filter (#4). Reachable only by direct guess / old links. | Needs a known thin-city URL to confirm in prod first; if it 200s, gate it in middleware like the other `/jobs/*` 410s. |
| **#6** — unknown query params on pSEO pages indexable (e.g. `?sort=newest` on `/jobs/state/*`) | Low/speculative — verify it's actually duplicated-and-indexed before acting. | Middleware `X-Robots-Tag: noindex` for non-canonical params on pSEO prefixes. |
| **#7** — `JobStructuredData` could render on an unpublished job if the expired branch is ever refactored | Latent only (not currently reachable). | One-liner belt-and-suspenders: `if (!job.isPublished) return null` at the top of `components/JobStructuredData.tsx`. |
| **#8** — paginated `/jobs?page=N` relies on a two-layer noindex | Low (defense already adequate). | Add `canonical: /jobs` as a tertiary fallback on paginated non-filtered views. |
| `social-post` / `instagram-post` record cron `success` even if the post returns 500 | Minor observability granularity; "did it run" is now answered. | Make the failure branch `throw` (so `withCronTracking` records a failed run) instead of returning a 500 response. |

---

## 4. Structural / won't-fix (with rationale)

| Item | Why not |
|---|---|
| 261 published jobs with no salary | **Unfixable** — the source postings don't include salary; the extractor already ran and found none. Inventing salaries on real jobs = fabrication/legal risk. |
| ~35k dead/unpublished rows retained | Bloat only. Hard-deleting is **irreversible** for marginal value; the pipeline already excludes them from every user-facing query. Leave unless storage becomes a real cost. |
| `originalPostedAt` / `stateCode` indexes | **Not needed** — `EXPLAIN ANALYZE` shows 3–5ms index-backed queries, zero seq scans at 2k published rows. Adding them = write overhead for no read gain. Revisit only past ~25k published. |

---

## 5. Privacy / legal follow-ups (small, your call)

- **DSAR form** (`/data-request`) now correctly requires auth, so the public form surfaces "Authentication required." Gate it behind login (redirect) for clean UX.
- **Anthropic** is a fallback AI provider but isn't in the sub-processor disclosure (OpenAI/Upstash/Inngest were added). Decide whether to disclose it.
- **Sec1 historical pass** — the write-time JD sanitizer shipped; a one-time re-sanitize of *existing* job descriptions in the DB is still pending (deserves its own reviewed migration script).

---

## 6. In-progress (operator's own WIP — not mine to touch)

- **AC-1** edit-token PII/expiry hardening
- **AC-3** cron dev-bypass tightening

---

## 7. LOW backlog (26 items)

The audit's `A.5` tail / `tmp/audit/digest.md` — style/minor items. Batch into one PR whenever; none are urgent. Re-measure against current prod first (several may already be moot, like the data-quality ones were).
