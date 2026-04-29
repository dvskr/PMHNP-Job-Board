# Job Health Detection — Runbook (Sprint 1)

**Status:** Sprint 1 (foundation) shipped on `feature/job-health-priority-1`. Sprints 2–3 (Inngest queue, observability) pending.

This document tells operators **what was changed, what to monitor after deploy, and how to roll back**.

## Background

The 2026-04-29 diagnostic probe of 300 random published jobs found:

- **25.3 %** of the published catalog is verifiably dead (44 hard-404, 32 soft-404).
- The legacy `check-dead-links` cron had a **25.3 % false-positive rate** — every dead job had been "checked alive" by the cron within the last 7 days.
- Three structural bugs in [app/api/cron/check-dead-links/route.ts](../app/api/cron/check-dead-links/route.ts):
  1. Treated any 2xx response as alive — missed Greenhouse soft-404s (~92 % of Greenhouse published).
  2. Followed redirects silently — soft-404 landing pages after 3xx looked alive.
  3. No source-aware patterns — blanket logic missed source-specific signals.

Full analysis: [docs/ingestion-pipeline-audit.md](./ingestion-pipeline-audit.md)
Architecture target: [docs/job-health-architecture.md](./job-health-architecture.md)

## What Sprint 1 changes

| Area | Before | After |
|---|---|---|
| HTTP probe | HEAD-only, `redirect: 'follow'`, no body inspection | HEAD→GET fallback, **manual redirect tracking**, optional body fetch (200 KB cap) |
| Decision logic | Boolean alive/dead | `HealthDecision { alive, reason, evidence }` with 10 reason codes |
| Soft-404 detection | None | Curated pattern library (universal + per-source patterns) |
| Conservative defaults | Network errors → alive (kept) | Same — plus `403/429/5xx/3xx-loop/timeout` → `inconclusive_*` (alive). FP guard: never declares dead based on absent body. |
| Logging | `console.log` strings | Structured `logger.info` with `jobId / source / reason / finalStatus / softPattern` per dead job |

**No schema changes**. No new dependencies. Behaviour change is gated only by the new detection logic; the `is_published=false` flip path is unchanged.

## Files

- `lib/health/probe.ts` — primitive: HTTP probe with manual redirects.
- `lib/health/soft-404-detector.ts` — pattern library + matcher. Bump `SOFT_404_CHECKER_VERSION` when patterns change.
- `lib/health/check-job-health.ts` — high-level decision (`decide` + `checkJobHealth`).
- `lib/health/index.ts` — public exports.
- `app/api/cron/check-dead-links/route.ts` — refactored to use the above.
- `scripts/purge-jsearch-zombies.ts` — one-off cleanup tool, dry-run by default.
- `tests/lib/health-probe.test.ts` — 11 tests.
- `tests/lib/soft-404-detector.test.ts` — 12 tests.
- `tests/lib/check-job-health.test.ts` — 13 tests.

## Pre-deploy checklist

- [x] `npm run test -- tests/lib/health-probe.test.ts tests/lib/soft-404-detector.test.ts tests/lib/check-job-health.test.ts` → 36/36 passing
- [x] `npm run type-check` → clean
- [x] `npm run lint` (touched files only) → clean
- [ ] Manually invoke the cron in staging: `curl -H "Authorization: Bearer $CRON_SECRET" https://staging.example.com/api/cron/check-dead-links` and confirm response body has `deadByReason` populated.
- [ ] Confirm Discord/Sentry notification volume is acceptable on the first run (expect a one-time spike — see "Expected impact").

## Expected impact on first production run

Based on the 2026-04-29 sample, extrapolated to the full 8,446-job published catalog:

- **First run (~1,500 jobs):** expect **300–400 net unpublishes** (vs ~20–50 historically per run).
- **Greenhouse:** expect ~91 % of its 331 published jobs to be flagged as `soft_404`. Gradual drain across ~3 cron runs.
- **Adzuna:** expect ~48 % flagged. Mix of `http_404` and `http_410`.
- **JSearch:** expect ~45 % flagged. Recommend running the purge script (below) instead.
- **Jooble:** unchanged behaviour — 100 % blanket-403, all stay published as `inconclusive_403`. Sprint 2 needs a different strategy for jooble.

The unpublish spike is **expected and correct**. The catalog will be ~3,000 jobs smaller after ~3 cron runs, then return to normal churn.

## Manual purge: JSearch zombies

```bash
# Dry-run first (default)
ts-node --project scripts/tsconfig.json scripts/purge-jsearch-zombies.ts

# After reviewing dry-run output:
ts-node --project scripts/tsconfig.json scripts/purge-jsearch-zombies.ts --apply
```

Recommended: run dry-run, eyeball the count and sample, then apply. The script only flips `isPublished=false` — fully reversible by SQL update.

## Monitoring after deploy

Watch for ~48h after deploy:

1. **Cron summary log lines** — `[Dead Link Check] Sweep complete` should now include `deadByReason`. Expected reasons in order of volume: `soft_404`, `http_404`, `http_410`. If `inconclusive_other` shows up significantly, investigate.
2. **Sentry / Discord** — any error rate increase from the cron route? The cron should not throw any new exceptions.
3. **Total published count** — query `SELECT COUNT(*) FROM jobs WHERE is_published=true;`. Expect drop from ~8,446 to ~5,500-5,700 over 2-3 days, then stabilize.
4. **False-positive watch** — re-run the diagnostic probe (the same one used in the audit) against a fresh sample of 300 jobs. Target FP rate < 5 %. If it stays > 10 %, hold Sprint 2 until tuned.

## Rollback

Single revert. The new code is additive (no DB schema changes, no removed APIs).

```bash
git revert <merge-sha>
git push origin dev
```

To restore individual unpublished jobs (if a soft-404 pattern caused FPs):

```sql
-- Inspect first
SELECT id, title, source_provider FROM jobs
WHERE is_published = false
  AND updated_at > NOW() - INTERVAL '24 hours'
  AND source_provider = 'greenhouse'
LIMIT 50;

-- Bulk restore for one source if needed
UPDATE jobs SET is_published = true
WHERE is_published = false
  AND updated_at > NOW() - INTERVAL '24 hours'
  AND source_provider = 'greenhouse';
```

## Known limitations (deferred to Sprint 2)

- **Jooble blanket-403** — server-to-server probes always 403. No ground truth. Need either headless browser probe sample, or source-presence cross-check (mark jooble jobs `orphaned` if missing from 3 consecutive ingest fetches).
- **No audit history** — the `job_health_check` append-only table from the architecture doc is not yet built. Currently we lose the per-check evidence after the cron logs; only the final `is_published` flip is recorded.
- **Single-signal kills** — the architecture doc requires 2 independent dead signals before flipping. Sprint 1 still allows a single soft-404 match to unpublish. The FP risk is mitigated by curated patterns + URL-fragment first ordering, but proper multi-signal voting is Sprint 2.
- **No FP recovery loop** — the architecture doc specifies a re-probe after 6h/24h/72h with rotated UAs. Not in Sprint 1.

## Pattern library maintenance

Edit [lib/health/soft-404-detector.ts](../lib/health/soft-404-detector.ts) — patterns are top-of-file. Each entry has an `id` used in audit logs and Sentry. **Bump `SOFT_404_CHECKER_VERSION` when adding/changing patterns.**

To audit FP rate of a specific pattern, grep the cron logs for `softPattern: "<id>"` and spot-check the corresponding `jobId`s. If a pattern's FP rate is > 2 %, narrow it and bump version.
