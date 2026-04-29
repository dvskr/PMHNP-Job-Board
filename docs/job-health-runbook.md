# Job Health Detection — Runbook

**Status:** Sprint 1 (foundation) shipped on `feature/job-health-priority-1`. Sprint 2 (Greenhouse direct-API probe + source-presence shadow mode) shipped on `feature/job-health-priority-2`. Sprint 3 (Inngest queue, presence-driven auto-unpublish, observability) pending.

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

## Sprint 2 changes — Greenhouse direct-API probe + source-presence shadow mode

### Slice A — Greenhouse direct-API probe

The Greenhouse JSON API at `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs/<id>` returns a clean `404` when a listing is closed. This is dramatically more reliable than HTML scraping (no soft-404 to detect, no bot-block).

| Area | Before | After |
|---|---|---|
| Greenhouse jobs | Generic HTML probe + soft-404 pattern matching (caught ~92 % of dead but with pattern-FP risk) | **Direct API probe first**, falls back to generic probe only when the API returns `unknown` (5xx/timeout/non-greenhouse URL) |
| Reasons | `http_404` / `soft_404` / `alive_2xx` | Adds `greenhouse_api_404` and `alive_greenhouse_api` for unambiguous Greenhouse signal |
| External ID flow | Cron didn't pass `externalId` to checker | Cron now passes `externalId`; the probe uses it to derive `(boardSlug, jobId)` even when apply URLs use the embedded `gh_jid` form (e.g. `https://riviamind.com/careers?gh_jid=…`) |

**Files:**
- `lib/health/probes/greenhouse-api.ts` — parser (`parseGreenhouseExternalId`, `parseGreenhouseApplyUrl`, `resolveGreenhouseRef`) + probe (`probeGreenhouseApi`).
- `lib/health/check-job-health.ts` — routes greenhouse jobs through the API probe first; preserves the existing decision policy as a fallback.
- `app/api/cron/check-dead-links/route.ts` — selects `externalId`, threads it into `checkJobHealth`.
- `tests/lib/greenhouse-api-probe.test.ts` — 19 tests (parser + probe + fallback).
- `tests/lib/check-job-health.test.ts` — 4 new integration tests.

### Slice B — Source-presence tracking (shadow mode)

After every successful, non-chunked, non-truncated ingest run, we compare the set of `external_id`s the source returned against the set of currently-published jobs from that source. Jobs that re-appeared get `health_consecutive_missing=0` + `health_last_seen_at=NOW()`. Jobs that didn't get `health_consecutive_missing += 1`.

**Sprint 2 ships shadow-mode only** — these columns are written but never used to flip `is_published`. Sprint 3 adds the auto-unpublish cron after we've collected ~1 week of telemetry and tuned the partial-fetch threshold.

| Area | Before | After |
|---|---|---|
| Sources without HTTP signal (Jooble = 100 % blanket-403) | No way to tell if a job was orphaned at source | `health_consecutive_missing` increments each ingest run when the external_id is absent from the fetch |
| Source outages | Risk of mass-marking jobs missing during a flaky day | **Partial-fetch guard**: presence check skipped when `fetchedCount < 0.5 × historicalAvgFetched` (7-day rolling average from `source_stats`) |
| Chunked sources (greenhouse, workday) | N/A | Skipped from per-run presence (cross-chunk visibility incomplete). Sprint 3 will add an aggregated presence cron that runs after all chunks land. |
| Truncated runs | N/A | Skipped when `stoppedEarly=true` (the existing time-budget exit) |

**Schema migration** (`prisma/migrations/20260429_add_source_presence_tracking/migration.sql`):
```sql
ALTER TABLE jobs
  ADD COLUMN health_consecutive_missing INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN health_last_seen_at TIMESTAMP(3);
CREATE INDEX jobs_source_provider_health_consecutive_missing_idx
  ON jobs(source_provider, health_consecutive_missing);
```

**Files:**
- `prisma/schema.prisma` — adds `healthConsecutiveMissing` / `healthLastSeenAt` + composite index.
- `lib/health/source-presence.ts` — `recordSourcePresence`, `loadHistoricalAvgFetched`, `computePresenceDiff`, `PRESENCE_CHECKER_VERSION`.
- `lib/ingestion-service.ts` — hooks the presence check at the end of `ingestFromSource` for non-chunked, non-truncated runs only. Logs outcome under `[SOURCE] Source-presence:` and is wrapped in try/catch (non-fatal).
- `tests/lib/source-presence.test.ts` — 11 tests (computeDiff + recordSourcePresence + partial-fetch guard + maxUpdates cap + checker version).

### Pre-deploy checklist for Sprint 2

- [x] `npm run test -- tests/lib/health-probe.test.ts tests/lib/soft-404-detector.test.ts tests/lib/check-job-health.test.ts tests/lib/greenhouse-api-probe.test.ts tests/lib/source-presence.test.ts` → 70/70 passing
- [x] `npm run type-check` → clean
- [x] `npx eslint <touched files>` → clean (pre-existing errors in ingestion-service.ts unchanged)
- [ ] **Run the migration** in your Supabase project: `supabase db push` (or `prisma migrate deploy`). Recommended timing: off-peak window. Forward-only — adds nullable column + non-null with default, safe for live writes.
- [ ] After 24 h: inspect `SELECT source_provider, COUNT(*) FILTER (WHERE health_consecutive_missing >= 1) FROM jobs WHERE is_published GROUP BY source_provider;` — confirm Jooble starts populating non-zero counts.
- [ ] After 7 days: review the distribution to set the Sprint 3 auto-unpublish threshold (target: 3 consecutive misses with FP rate < 5 %).

### Expected behavior after Sprint 2 deploys

**Greenhouse:**
- Most published Greenhouse jobs will be classified `greenhouse_api_404` on next cron run and unpublished.
- Of the 331 currently-published Greenhouse jobs, expect **~300+** to flip dead within 2 cron runs.

**Source-presence (shadow mode):**
- No jobs unpublished by the presence check itself.
- New columns (`health_consecutive_missing`, `health_last_seen_at`) populated for every non-chunked source after each ingest.
- For Jooble specifically (3,871 published, our largest blind spot), expect a slow build of `health_consecutive_missing` values: jobs genuinely closed at source will hit 3+ misses within ~2 days; jobs still listed will reset to 0 each run.

### Sprint 2 monitoring queries

```sql
-- Source-presence telemetry by source (run daily after Sprint 2 lands)
SELECT
  source_provider,
  COUNT(*) AS published_total,
  COUNT(*) FILTER (WHERE health_consecutive_missing = 0) AS seen_recently,
  COUNT(*) FILTER (WHERE health_consecutive_missing = 1) AS missing_1,
  COUNT(*) FILTER (WHERE health_consecutive_missing = 2) AS missing_2,
  COUNT(*) FILTER (WHERE health_consecutive_missing >= 3) AS missing_3plus,
  AVG(health_consecutive_missing)::numeric(5,2) AS avg_missing
FROM jobs
WHERE is_published = true AND source_provider IS NOT NULL
GROUP BY source_provider
ORDER BY published_total DESC;

-- Greenhouse-API decision audit (greenhouse_api_404 → unpublished within last 24h)
SELECT id, title, employer, apply_link, updated_at
FROM jobs
WHERE source_provider = 'greenhouse'
  AND is_published = false
  AND updated_at > NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC LIMIT 50;
```

## Known limitations (deferred to Sprint 3)

- **No audit history** — the `job_health_check` append-only table from the architecture doc is not yet built. Currently we lose the per-check evidence after the cron logs; only the final `is_published` flip is recorded.
- **Single-signal kills** — the architecture doc requires 2 independent dead signals before flipping. Sprints 1 + 2 still allow a single soft-404 match (or a single Greenhouse-API 404) to unpublish. The Greenhouse-API 404 is high-confidence enough that single-signal kill is defensible; soft-404 single-signal kill is the bigger residual risk.
- **No FP recovery loop** — the architecture doc specifies a re-probe after 6h/24h/72h with rotated UAs. Not in Sprints 1 or 2.
- **Source-presence shadow only** — the presence columns are written but not used to auto-unpublish. Sprint 3 adds the cron with `health_consecutive_missing >= 3` threshold (gated on telemetry).
- **Chunked source presence** — Greenhouse and Workday are excluded from per-run presence checks. Sprint 3 adds an aggregated presence cron that runs after the last chunk completes.

## Pattern library maintenance

Edit [lib/health/soft-404-detector.ts](../lib/health/soft-404-detector.ts) — patterns are top-of-file. Each entry has an `id` used in audit logs and Sentry. **Bump `SOFT_404_CHECKER_VERSION` when adding/changing patterns.**

To audit FP rate of a specific pattern, grep the cron logs for `softPattern: "<id>"` and spot-check the corresponding `jobId`s. If a pattern's FP rate is > 2 %, narrow it and bump version.
