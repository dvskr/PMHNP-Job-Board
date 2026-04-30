# Source-Presence Threshold Rationale

Last updated: **2026-04-30**.

## Decision

**Keep `JOB_HEALTH_MIN_PRESENCE_MISSES = 3`** (the current default in [`app/api/cron/source-presence-unpublish/route.ts`](../app/api/cron/source-presence-unpublish/route.ts)) **until at least 5 days of accumulated data exists**, then reassess.

Rationale below.

## What "threshold N" means

The auto-unpublish cron flips `is_published=false` on any job whose `health_consecutive_missing >= N` and which is otherwise eligible (`source_type='external'`, not manually-unpublished). The counter:

- Starts at 0.
- Increments by 1 each time the source's ingest run completes and the job's `external_id` is **not** in the fetched results (subject to the partial-fetch guard which skips increments when the fetch is < 50% of the 7-day rolling average).
- Resets to 0 the moment the job appears again in any ingest run.

Each source ingests **twice daily** (10:00 + 16:00 UTC). So a counter of 3 means "missing from the source for ~3 consecutive runs across ~24 hours". A counter of 6 means "missing for ~3 days".

## Trade-offs at each threshold

| N | Time to flip | Risk profile |
|---|---|---|
| 1 | ~6h after first miss | High false-positive rate — any source hiccup, pagination drift, or keyword reshuffle will instantly unpublish jobs |
| 2 | ~12h | Moderate FP risk — still catches transient outages |
| **3** | **~24h** | **Balanced — survives one missed run but flips on consistent absence** |
| 4 | ~36h | Conservative — slow to remove dead jobs |
| 5+ | ~48h+ | Too slow for the 60-day expiry window we already have |

## Why 3 is defensible without telemetry

1. **Partial-fetch guard already covers source-outage FPs.** If an ingest run returns < 50% of the source's 7-day average, no counters increment. So a Workday 500 error or Greenhouse rate-limit doesn't strike valid jobs as missing.
2. **Multi-signal voting sits in front of HTTP-probe flips.** A separate code path. Source-presence is the only signal for sources we can't HTTP-probe (Jooble before decom, some ATS-restricted endpoints), so it's the *only* hands-on-deck for those. Threshold 3 means we wait for two confirming signals from the source's own search — equivalent to the dead-link cron's "require 2 signals" voting model.
3. **120-day renewal cap is the safety net.** Even if presence-unpublish is wrong, jobs are bounded to 120d max age via [`lib/expiry-checker.ts`](../lib/expiry-checker.ts). Worst case false-positive: we unpublish a job that was truly alive but missing from search results for 24h. The dead-link cron's FP-recovery loop (Inngest, 6h/24h/72h re-probes) catches genuine FPs and resurrects.

## When to revisit

After the audit table accumulates ≥ 1 week of source-presence rows, run [`scripts/tune-presence-threshold.ts`](../scripts/tune-presence-threshold.ts) and look at:

- **Precision at threshold N**: of jobs flipped, what fraction had a confirming HTTP signal (`http_404`, `soft_404`, `greenhouse_api_404`) vs an `alive_2xx` signal in the same window?
  - Target: ≥ 85% precision.
- **False-positive resurrections**: how many flipped jobs did Inngest's FP-recovery loop resurrect within 72h? If > 5%, threshold is too aggressive.
- **Coverage**: are we missing dead jobs the HTTP probe catches? If the source-presence pipeline only catches a tiny share, the threshold can be lowered without much risk because the HTTP probe is the primary detector.

## Current-state observations

As of **2026-04-30 03:30 UTC**:
- `job_health_checks` rows: 1,500 (one full dead-link cron run)
- `source_presence` rows: 0 (next ingest cycle is 10:00 UTC)
- Jobs with `health_consecutive_missing > 0`: 0
- Dead-suspected (>=3 misses): 0

**HTTP probe outcome distribution from the latest run:**

| Outcome | Count | Note |
|---|---|---|
| inconclusive_403 | 787 | 52% — Sources blocking server-to-server probes (mostly Jooble URLs) |
| alive_2xx | 601 | 40% |
| alive_greenhouse_api | 86 | 6% |
| http_410 | 7 | confirmed dead → flipped |
| http_404 | 6 | confirmed dead → flipped |
| soft_404 | 2 | deferred (low-conf, awaits second signal) |
| greenhouse_api_404 | 1 | confirmed dead → flipped |
| inconclusive_other / network | 10 | retried |

The 52% inconclusive_403 share is exactly why source-presence matters — for those URLs we can't tell alive from dead via HTTP, and the only signal available is "did the source's own keyword search keep returning the job?".

## Action items

1. **No env-var change today.** Keep threshold at 3.
2. **Watch [`/admin/health`](http://localhost:3000/admin/health)** after the 10:00 UTC ingest run tomorrow — `presenceBuckets.count` for `1 missing` and `2 missing` should populate.
3. **Re-run analysis 2026-05-06 onward** — calendar entry already set.
