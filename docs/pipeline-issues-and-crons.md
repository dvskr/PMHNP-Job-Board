# Pipeline Issues & Maintenance Crons

Snapshot date: **2026-04-30** (refreshed end of day).
Companion to [`ingestion-pipeline-audit.md`](./ingestion-pipeline-audit.md), [`job-health-runbook.md`](./job-health-runbook.md), and [`presence-threshold-rationale.md`](./presence-threshold-rationale.md).

This document catalogs every known issue in the ingest → publish → expire pipeline, and pairs each issue with the cron job(s) that mitigate or could mitigate it.

---

## Issue index

| # | Issue | Severity | Status | Owner cron |
|---|-------|----------|--------|------------|
| 1 | Source-presence threshold not yet tuned | medium | rationale documented; reassess 2026-05-06 with real data | `/api/cron/source-presence-unpublish` |
| 2 | ~~Greenhouse fetch budget (271k/wk → 15 adds)~~ | ~~medium~~ | **resolved 2026-04-30** (622 dead tenants purged, 92% reduction) | `/api/cron/ingest?source=greenhouse&chunk=*` |
| 3 | Catalog staleness — 43% of published jobs > 45 d old | medium | mitigated by ranking, not removal | `/api/cron/freshness-decay` |
| 4 | ~~Mode taxonomy null rate (45% of published)~~ | ~~low~~ | **resolved 2026-04-30** — LLM prompt tightened, write-side canonicalization, detectMode regex expanded (8 → 21 patterns), 130 already-enriched rows backfilled. Remaining nulls (2,050) are structural — descriptions without any mode signal. | `/api/cron/enrich-jobs` |
| 5 | Direct-employer post share (11 vs 5,285) | medium | product/outreach issue | `/api/cron/employer-report` |
| 6 | 2,124 jooble + 1,440 jsearch zombie rows still published | low | aging out via 60-d expiry | `/api/cron/cleanup-expired` |
| 7 | Five low-salary outliers from non-PMHNP roles | low | relevance-filter false-positives | none — relevance filter at ingest |
| 8 | LLM enrichment thin on PMHNP-specific dimensions | medium | open (clinical_setting/patient_population/benefits) | `/api/cron/enrich-jobs` |
| 9 | Renewal model keeps stale jobs alive past their natural shelf life | low | by design (originalPostedAt is preserved for ranking) | `/api/cron/cleanup-expired` + `freshness-decay` |
| 10 | Audit-table partition rollover not yet automated | low | opens 2027-04 | none — manual `CREATE TABLE PARTITION OF` needed annually |
| 11 | Inngest FP-recovery free-tier concurrency cap (5) | low | hit only on outage spikes | indirect — `inngest/fp-recovery.ts` |
| 12 | ~~No automated alerting for cron failures~~ | ~~medium~~ | **resolved 2026-04-30** (`sendCronFailureAlert` wired into all 22 crons) | every cron handler |
| 13 | Source-presence first run produces zero data until next ingest | informational | self-resolves daily | next `/api/cron/ingest` run |

---

## Issue details

### 1. Source-presence threshold not yet tuned

**What:** [`/api/cron/source-presence-unpublish`](../app/api/cron/source-presence-unpublish/route.ts) flips `is_published=false` when `health_consecutive_missing >= 3`. The threshold of 3 was a guess at ship time.

**Why open:** No telemetry yet — the audit table only started flowing 2026-04-30 after the deploy-lag fix landed. Source-presence rows accumulate one increment per ingest cycle for jobs that go missing, so meaningful precision/recall data needs ~5-7 days.

**Cron coverage:** The cron itself runs daily at **12:55 UTC**. It's already wired — just operating at the default threshold. Override via `JOB_HEALTH_MIN_PRESENCE_MISSES` env var on Vercel once tuned.

**Resolution path:** [`scripts/tune-presence-threshold.ts`](../scripts/tune-presence-threshold.ts) cross-validates each presence-miss bucket against HTTP probe outcomes for the same job. Calendared rerun: **2026-05-06**.

---

### 2. Greenhouse fetch budget

**What:** Greenhouse ingests 8 chunks × 2 runs/day, fetching ~271,000 raw jobs per week, of which ~15 are added to the catalog. That's a 0.005% accept rate. Each chunk consumes a Vercel function invocation + outbound fetch quota.

**Why open:** The 15 jobs that DO pass have an average quality score of 65.9 (top tier), so we're not killing Greenhouse. But the company-tenant list is likely stale — many of the ~100 companies probably stopped posting PMHNP roles, contributing 0 net adds while still costing fetches.

**Cron coverage:** [`/api/cron/ingest?source=greenhouse&chunk=0..7`](../app/api/cron/ingest/route.ts) — 8 entries in [`vercel.json`](../vercel.json) running 10:10–10:45 + 16:10–16:45 UTC.

**Resolution path:**
1. Audit which Greenhouse tenants contributed zero adds in the last 60 days.
2. Drop those tenants from [`lib/aggregators/greenhouse.ts`](../lib/aggregators/greenhouse.ts).
3. Optionally rebalance chunks (8 → 4) to halve cron slots.

---

### 3. Catalog staleness

**What:** 43% of published jobs (2,262) have `original_posted_at > 45 days ago` and score 0 freshness points. They stay alive only because the renewal mechanism extends `expiresAt` whenever the job's `external_id` is re-seen.

**Why open:** Not a bug — it's the renewal model working as designed. But it skews the catalog toward older content.

**Cron coverage:**
- [`/api/cron/freshness-decay`](../app/api/cron/freshness-decay/route.ts) at **12:20 UTC** — recomputes `qualityScore` so older jobs sink in ranking.
- [`/api/cron/cleanup-expired`](../app/api/cron/cleanup-expired/route.ts) at **12:10 + 18:10 UTC** — handles `expiresAt < now`.
- 120-day renewal cap in [`lib/expiry-checker.ts`](../lib/expiry-checker.ts) — prevents indefinite renewals.

**Resolution path (optional, lower priority):** Could harden the cap to 90 days, or add a "staleness curtain" that unpublishes after N days regardless of renewal. Currently the ranking penalty does most of the work.

---

### 4. Mode taxonomy null rate

**What:** 2,394 of 5,296 published jobs (45%) have `mode = null`. The `detectMode` function in [`lib/job-normalizer.ts`](../lib/job-normalizer.ts) only fires when the job's text contains "remote", "hybrid", "on-site", "in-person", "telehealth", or "work from home". Many descriptions don't include those terms.

**Why open:** Not a bug — text isn't always explicit about work mode.

**Cron coverage:** [`/api/cron/enrich-jobs`](../app/api/cron/enrich-jobs/route.ts) at **12:00 + 18:00 UTC** runs GPT-4o-mini against jobs missing optional fields. It currently fills `clinical_setting`, `patient_population`, `experience_level`, `benefits` — could be extended to `mode`.

**Resolution path:** Add `mode` to the LLM enrichment field list. Confidence thresholds matter — wrong "Remote" labels would harm filter UX more than nulls.

---

### 5. Direct-employer post share

**What:** Of 5,296 published jobs, only 11 are direct-employer posts (`source_type = 'employer'`). Everything else is aggregator-sourced. Employer onboarding is the revenue lever and it's not yet productive.

**Why open:** Product / sales issue, not a pipeline issue.

**Cron coverage:**
- [`/api/cron/employer-report`](../app/api/cron/employer-report/route.ts) at **Mon 14:00 UTC** — weekly digest to engaged employers.
- [`/api/cron/expiry-warnings`](../app/api/cron/expiry-warnings/route.ts) at **22:00 UTC** — pings employers whose direct posts are about to expire.
- [`/api/cron/index-urls`](../app/api/cron/index-urls/route.ts) at **13:15 UTC** — pushes new URLs to Google Indexing API to surface them faster.

**Resolution path:** Outreach mechanics, not pipeline. Out of scope for this document.

---

### 6. Jooble + JSearch zombie rows

**What:** 2,124 published jooble jobs and 1,440 published jsearch jobs remain in the catalog after both sources were decommissioned. JSearch was killed 2026-03-11; Jooble was killed 2026-04-29.

**Why open:** Existing rows aren't deleted on decommission — they age out via the standard 60-day expiry clock so SEO de-indexing happens cleanly through the normal pipeline.

**Cron coverage:**
- [`/api/cron/cleanup-expired`](../app/api/cron/cleanup-expired/route.ts) at **12:10 + 18:10 UTC** — flips to unpublished when `expiresAt < now`.
- [`/api/cron/check-dead-links`](../app/api/cron/check-dead-links/route.ts) at **12:30 + 18:30 UTC** — for jsearch URLs that are now genuinely dead, the dead-link cron unpublishes them.
- [`/api/cron/deindex-expired`](../app/api/cron/deindex-expired/route.ts) at **12:45 + 18:45 UTC** — pings Google + IndexNow with `URL_DELETED` after unpublish.

**Resolution path:** Could one-shot purge with `scripts/audit-and-prune-dead-jobs.ts --source=jooble --apply` if the natural 60-day fade is too slow. Already have the script.

---

### 7. Low-salary outliers

**What:** Five published jobs report normalized annual salaries below $50k. These are not period-detection bugs (those were fixed today) — they're non-PMHNP roles that escaped the relevance filter:
- "Peer Specialist - Crisis Stabilization Unit" (greenhouse)
- "Behavioral Health Coordinator" (workday)
- Two part-time NP roles at jsearch
- "Psychiatric Nurse" at UnitedHealth (jsearch)

**Why open:** Relevance filter is conservative by design — it lets borderline titles through and trusts post-ingest signals. Five edge cases out of 5,296 published is acceptable noise.

**Cron coverage:** None. The relevance filter runs at ingest time only ([`lib/utils/job-filter.ts`](../lib/utils/job-filter.ts)).

**Resolution path:** Either tighten relevance regex (risk: filter out legitimate part-time PMHNP roles) or accept the noise.

---

### 8. LLM enrichment thin on PMHNP dimensions

**What:** Per the original audit, only 31% of published jobs have `clinical_setting` filled, 26% have `patient_population`, and 15% have `benefits`. These are PMHNP-specific filters that drive UX.

**Why open:** GPT-4o-mini extraction is conservative — it returns null when descriptions don't explicitly mention the dimension.

**Cron coverage:** [`/api/cron/enrich-jobs`](../app/api/cron/enrich-jobs/route.ts) at **12:00 + 18:00 UTC**.

**Resolution path:**
1. Audit which descriptions DO mention setting/population terms but the LLM missed them — possible prompt-engineering issue.
2. Consider a secondary regex pass for high-confidence cases (e.g. "outpatient clinic" → `clinical_setting='outpatient'`).

---

### 9. Renewal model retains old jobs

**What:** A job's `expiresAt` is bumped each time its `external_id` is re-seen during ingestion. So a job posted 6 months ago can still be live if the source keeps returning it.

**Why open:** Intentional — many ATS sources never explicitly close postings, so we'd otherwise unpublish actively-recruiting roles.

**Cron coverage:**
- The 120-day renewal cap in [`lib/expiry-checker.ts`](../lib/expiry-checker.ts) hard-stops at 4 months from `created_at`.
- `originalPostedAt` is preserved (never updated on renewal) so freshness scoring penalizes correctly.

**Resolution path:** Healthy as-is. The cap + freshness ranking handle the trade-off.

---

### 10. Audit-table partition rollover

**What:** [`prisma/migrations/20260429_partition_job_health_checks`](../prisma/migrations/20260429_partition_job_health_checks/migration.sql) created 14 monthly partitions running through 2027-05. After that, writes go to the default catch-all partition (works, but defeats the partitioning benefits).

**Why open:** No automation for monthly `CREATE TABLE ... PARTITION OF` exists yet. Plenty of runway before this matters.

**Cron coverage:** None.

**Resolution path:**
- Cron approach: monthly job that runs:
  ```sql
  CREATE TABLE job_health_checks_YYYY_MM PARTITION OF job_health_checks
      FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY+1-MM-01');
  DROP TABLE job_health_checks_YYYY_MM_old;  -- 13 months back
  ```
- Calendar reminder for **2027-03** to add 12 more months manually if no cron is built by then.

---

### 11. Inngest FP-recovery free-tier concurrency cap

**What:** [`lib/inngest/functions/fp-recovery.ts`](../lib/inngest/functions/fp-recovery.ts) is capped at `concurrency: { limit: 5 }`. Inngest free tier limit. If a single ingest run produces a flood of dead-flips (hundreds at once), recovery probes serialize behind the cap.

**Why open:** Free-tier constraint, not a bug.

**Cron coverage:** Indirect — the FP-recovery probes themselves run via Inngest events, not Vercel cron. Triggering event is the `job.health.flipped` send from [`/api/cron/check-dead-links`](../app/api/cron/check-dead-links/route.ts).

**Resolution path:** Upgrade Inngest plan if recovery latency becomes an issue. Currently flips are tens-per-day at most so the cap is academic.

---

### 12. No automated alerting for cron failures

**What:** [`/api/cron/health-anomaly-check`](../app/api/cron/health-anomaly-check/route.ts) at **13:00 UTC** detects anomalies in the *data* the crons produce (z-score on dead rate, soft_404 pattern shifts, etc.) and pages via Sentry. But if a cron itself fails (timeout, 500 error, OOM), nothing pages.

**Why open:** Vercel surfaces cron failures in its dashboard but doesn't push them anywhere. The recently-discovered "Vercel deployment lag silently breaking the audit recorder" is a perfect example of why we need cron-level alerting.

**Cron coverage:** None. The anomaly cron monitors *output*, not *invocation*.

**Resolution path:**
1. Quick fix: wire each cron's response (success / fail) into the Discord notifier we already have.
2. Better: GitHub Action that hits the Vercel cron logs API daily and reports any 4xx/5xx.
3. Best: Datadog/Grafana with synthetic checks. (Out of scope for now.)

---

### 13. Source-presence first run produces zero data until next ingest

**What:** Right now (2026-04-30 03:05 UTC) `health_consecutive_missing > 0` count is 0 for all jobs. The audit table only contains `http_probe` + `greenhouse_api` rows from the dead-link cron. Source-presence rows haven't appeared yet because the next ingest cron runs at 10:00 UTC.

**Why open:** Not really an issue — self-resolves at the next ingest cycle. Documented here only because a fresh observer would otherwise wonder "why is source-presence broken".

**Cron coverage:** [`/api/cron/ingest?source=adzuna`](../app/api/cron/ingest/route.ts) at **10:00 + 16:00 UTC** is the next trigger that calls `recordSourcePresence`.

**Resolution path:** Wait. Spot-check `/admin/health` after 12:00 UTC tomorrow.

---

## Cron-by-cron coverage summary

How many issues each maintenance cron is responsible for:

| Cron | Schedule | Issues addressed |
|---|---|---|
| `check-dead-links` | 12:30, 18:30 | 6 (zombie rows), 12 (data anomalies) |
| `source-presence-unpublish` | 12:55 | 1 (threshold), 6 (zombies once tuned) |
| `cleanup-expired` | 12:10, 18:10 | 6 (zombies), 9 (renewal), 3 (staleness) |
| `freshness-decay` | 12:20 | 3 (staleness — ranking penalty) |
| `deindex-expired` | 12:45, 18:45 | 6 (SEO de-index after unpublish) |
| `enrich-jobs` | 12:00, 18:00 | 4 (mode null), 8 (PMHNP fields thin) |
| `health-anomaly-check` | 13:00 | 12 (partial — data only, not cron health) |
| `daily-report` | 13:00 | 12 (manual eyeballing) |
| `expiry-warnings` | 22:00 | 5 (employer outreach) |
| `employer-report` | Mon 14:00 | 5 (employer outreach) |

Total active maintenance crons: **18** (excluding ingest crons themselves).

---

## Verification

```bash
# Snapshot current state
npx ts-node -r tsconfig-paths/register --project scripts/tsconfig.json scripts/full-pipeline-snapshot.ts

# Per-issue audits
npx ts-node ... scripts/audit-mode-jobtype.ts        # issue 4
npx ts-node ... scripts/audit-employer-dupes.ts      # company dedup verification
npx ts-node ... scripts/audit-salary-outliers.ts     # issue 7
npx ts-node ... scripts/audit-quality-distribution.ts
npx ts-node ... scripts/audit-source-roi.ts          # issue 2
npx ts-node ... scripts/tune-presence-threshold.ts   # issue 1 (after 5-7 days)
npx ts-node ... scripts/diagnose-health-pipeline.ts
```

Live snapshot data referenced throughout this doc was produced by `scripts/full-pipeline-snapshot.ts` against prod on 2026-04-30.
