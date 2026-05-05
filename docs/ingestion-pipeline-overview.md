# Job Ingestion Pipeline — End-to-End Overview

Canonical "how it actually works today" reference for the ingest pipeline.
Written 2026-05-05 as input to a refactor that brings the pipeline to a
standard form.

Companion docs (snapshot-dated, deeper in places):
- [ingestion-pipeline-audit.md](./ingestion-pipeline-audit.md)
- [pipeline-issues-and-crons.md](./pipeline-issues-and-crons.md)
- [job-health-architecture.md](./job-health-architecture.md)
- [job-health-runbook.md](./job-health-runbook.md)

---

## TL;DR mental model

We pull job postings twice a day from 7 third-party APIs, run each posting
through a shared cleaning pipeline, write the survivors to one `jobs`
table, and continuously prune dead links over the next 60–120 days. The
public site reads from that one table.

Three things to know before reading the rest:

1. **One pipeline, many sources.** Every adapter in `lib/aggregators/`
   returns a uniform `RawJobData` shape. Everything downstream (normalize,
   dedup, probe, insert) is source-agnostic.
2. **Renew, don't re-insert.** When the same job re-appears in a later
   ingest, we revive it (if unpublished) and bump `updatedAt` for
   freshness scoring. **`expiresAt` is NEVER extended.** A job's
   absolute lifetime is `originalPostedAt + 60 days` and that's the
   single clock — no compounding.
3. **Conservative health.** A job is only auto-unpublished when there's
   high-confidence evidence it's dead (HTTP 404/410, or vote-confirmed
   over multiple checks). We accept inconclusive signals (403, 5xx,
   timeouts) and re-probe later.

---

## 1. Sources

### Active (in `vercel.json`)

| Provider key | API | Schedule (UTC) | Chunks | Notes |
|---|---|---|---|---|
| `adzuna` | `api.adzuna.com/v1/api/jobs/us/search` | `0 10,16` | 1 | 12 search terms × ~20 pages, 500ms throttle |
| `greenhouse` | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` | `10–45 10,16` | 8 | ~189 verified company boards, sharded |
| `lever` | `api.lever.co/v0/postings/{company}` | `50 10,16` | 1 | ~91 company feeds, no per-feed pagination |
| `workday` | `{slug}.wd{n}.myworkdayjobs.com/wday/cxs/.../jobs` | `5–25 11,17` | 5 | ~131 tenant boards, sharded |
| `fantastic-jobs-db` | `active-jobs-db.p.rapidapi.com/active-ats-7d` | `30 11,17` | 1 | RapidAPI Ultra. 2-pass strategy (title-exact + broad+desc filter). Annual 6m backfill at `0 0 1 1 *` |
| `smartrecruiters` | `api.smartrecruiters.com/v1/companies/{slug}/postings` | `35 11,17` | 1 | 6 company boards |
| `ats-jobs-db` | `ats-jobs-db.p.rapidapi.com/v1/jobs` | `50 11,17` | 1 | RapidAPI. 11 search terms × 15 pages |

`ALL_SOURCES` in [lib/ingestion-service.ts:73](../lib/ingestion-service.ts#L73)
is the single source of truth for which adapters can run.

### Decommissioned (intentionally removed)

| Provider | When | Why |
|---|---|---|
| `jooble` | 2026-04-29 | Quality 24.6/100, blocks server probes (403 always), 93% of historical entries gone from source |
| `jsearch` | 2026-03-11 | $75/mo subscription cancelled — lowest quality of any source (5.8) |
| `usajobs`, `ashby`, `icims`, `jazzhr` | 2026-04-30 | ROI audit: 0–3 adds per source over 30 days |
| `bamboohr` | 2026-02-20 | Endpoints dead, 0 PMHNP adds historically |

The adapter files still exist on disk (e.g. [lib/aggregators/jooble.ts](../lib/aggregators/jooble.ts))
but are not in `ALL_SOURCES` and not in `vercel.json`. Legacy rows from
these sources age out naturally via the 60/120-day expiry policy.

---

## 2. The pipeline, step by step

A single Vercel cron hits `GET /api/cron/ingest?source={src}&chunk={n}`
([app/api/cron/ingest/route.ts](../app/api/cron/ingest/route.ts)). That
route delegates to `ingestJobs()` in
[lib/ingestion-service.ts:654](../lib/ingestion-service.ts#L654), which
walks each source through these steps.

### Step 0 — Auth & setup
- `verifyCronOrAdmin(request)` — accepts Vercel cron header OR admin
  session cookie. Anyone else gets 401.
- Pre-load a global in-memory map of every published job's
  `(externalId, sourceProvider) → {id, originalPostedAt}` and a
  url-pathname map. These power the fast dedup path in step 4.

### Step 1 — Fetch
- Adapter's `fetch{Source}Jobs(options)` runs. Each adapter implements
  its own pagination, search-term loop, and rate-limiting.
- Output: array of `RawJobData` — uniform shape (`title`, `employer`,
  `location`, `description`, `applyLink`, `externalId`, `postedDate`,
  …) so everything downstream is source-agnostic.
- Hard time budget: **240s** (Vercel max is 300s; we leave 60s for
  cleanup). When the budget is hit, we stop fetching and process what
  we have.

### Step 2 — Pre-filter (relevance gate)
- For each raw job, before any expensive work, call `isRelevantJob(title, description)`
  in [lib/utils/job-filter.ts](../lib/utils/job-filter.ts).
- This is keyword-based ("PMHNP", "psychiatric NP", "psych nurse practitioner",
  etc.) with negative keywords for false positives.
- Rejects ~50% of incoming raw jobs at near-zero cost. Logged to
  `rejectedJob` table with reason `'relevance_filter'`.

### Step 3 — Normalize
- `normalizeJob(rawJob, source)` in
  [lib/job-normalizer.ts:489](../lib/job-normalizer.ts#L489) returns a
  uniform `NormalizedJob` or `null`.
- What it derives:
  - **Salary**: regex parse the description for hourly / daily / weekly /
    monthly / annual ranges. Validate (e.g. hourly must be 20–300).
    Convert everything to annual via `normalizeSalary()`.
  - **Location**: `parseLocation()` extracts city, state, stateCode and
    sets `isRemote` / `isHybrid`.
  - **Job type**: try the source's enum first (Workday, Lever often have
    one), fall back to title text scan ("Full-Time", "PRN", "Contract").
  - **Experience level**: regex on title + description ("New Grad",
    "5+ years", "Senior", "Director").
  - **Description summary**: HTML-strip + truncate to 300 chars.
  - **Original post date**: source's claimed date, or `now` if missing.
  - **Initial expiry**: `originalPostedAt + 60 days`.
- Rejection gates inside the normalizer:
  - Missing `title` or `applyLink` → drop.
  - `originalPostedAt > 90 days ago` AND source is non-ATS → drop. (ATS
    sources only return current open positions, so this gate is bypassed
    for them.)

### Step 4 — Dedup (find existing match)
Two paths, in order:

1. **Fast path — exact `externalId` lookup** in the in-memory map from
   step 0. ~99% of dedup hits land here.
2. **Slow path — fuzzy match** via `checkDuplicate()` in
   [lib/deduplicator.ts](../lib/deduplicator.ts). Strategies tried in order:
   - Exact title + employer + location (normalized — drops corporate
     suffixes like "Inc", "LLC", but **preserves** healthcare words like
     "Health", "Medical").
   - Apply URL match (normalized — strips utm/ref params).
   - Levenshtein fuzzy: title>0.85 AND employer>0.80 AND
     (location>0.50 OR both remote). The location gate is critical —
     without it, multi-location employers like LifeStance (500+ offices)
     collapse into one job.

If a match is found → **renew**, don't insert (see step 6). If no match
→ continue to step 5.

### Step 5 — Probe at insert time (dead-on-arrival rejection)
- For new (non-duplicate) jobs only, call `checkJobHealth(applyLink, source)`
  in [lib/health/check-job-health.ts](../lib/health/check-job-health.ts).
- Generic path: HTTP HEAD/GET with redirect-following + soft-404 detection.
- Greenhouse special path: hits the Greenhouse JSON API directly to
  confirm the posting is still live (more reliable than scraping).
- Block insert ONLY on `http_404`, `http_410`, `greenhouse_api_404`
  ([lib/ingestion-service.ts:50](../lib/ingestion-service.ts#L50)).
- Inconclusive signals (`soft_404`, `inconclusive_403/429/5xx`,
  `inconclusive_network`, `inconclusive_3xx_loop`) are accepted — the
  dead-link cron's voting system will catch real corpses with multi-signal
  confirmation later.
- Skipped entirely if `applyLink` is empty (employer-posted apply-on-platform).
- Rejected jobs logged to `rejectedJob` with reason `'dead_at_ingest'`.

This step is the reason `jobs_fetched >> jobs_added` in `source_stats`.
Greenhouse fetches 7,927/day → adds 0 because most of its listings are
stale closed reqs that 404 the moment we probe.

### Step 6 — Insert OR renew
- **Insert (new job)**: write a `jobs` row, generate slug, set
  `expiresAt = originalPostedAt + 60 days`, `isPublished = true`.
- **Renew (matched existing job)** in
  [lib/ingestion-service.ts:249](../lib/ingestion-service.ts#L249):
  - If `isManuallyUnpublished = true` → skip (admin override is sticky).
  - If `originalPostedAt > 60 days ago` → unpublish instead. **Hard cap**.
  - Otherwise: `isPublished = true`, touch `updatedAt`. **`expiresAt`
    is NOT changed** — it was set at insert as
    `originalPostedAt + 60 days` and stays that way.

### Step 7 — Post-insert enrichment (synchronous, per-job)
For inserted jobs only:
- `parseJobLocation(jobId)` — populate `city`, `state`, `stateCode`.
- `linkJobToCompany(jobId)` — fuzzy-match employer to `companies` table,
  set `companyId`.
- `computeQualityScore(jobId)` — 0–100 score based on apply-link presence,
  salary completeness, description length, location specificity, source
  type, freshness.

### Step 8 — Per-source bookkeeping
- Insert/update one `source_stats` row keyed by `(source, date)` with
  `jobsFetched`, `jobsAdded`, `jobsDuplicate`, `jobsExpired`,
  `avgQualityScore`.
- `HealthRecorder` records every probe outcome to `job_health_checks`
  (used for anomaly detection and false-positive auditing).
- For sources with chunked ingestion (Greenhouse, Workday), also update
  the chunked-presence aggregator
  ([lib/health/chunked-presence.ts](../lib/health/chunked-presence.ts))
  — used by `source-presence-unpublish` later.
- Discord webhook fires summary embed
  ([app/api/cron/ingest/route.ts:16](../app/api/cron/ingest/route.ts#L16)).

### Step 9 — End-of-cron cleanup
After all sources for this run finish:
- `cleanupExpiredJobs()` in
  [lib/ingestion-service.ts:814](../lib/ingestion-service.ts#L814) — set
  `isPublished = false` for any job where `expiresAt < now` OR
  `originalPostedAt < now - 60 days`. Submit those URLs to GSC
  (100/day quota) and IndexNow (unlimited) for de-indexing.
- `cleanAllJobDescriptions()` — HTML-to-text + boilerplate strip for
  jobs whose description was just inserted.
- `collectEmployerEmails()` — mine emails out of descriptions, write to
  `employer_lead`.
- `pingAllSearchEnginesBatch()` — submit new URLs to Google/Bing/IndexNow.

### Step 10 — Fail-safe
- Any unhandled exception triggers `sendCronFailureAlert()` to Discord.
- Per-job exceptions are caught and logged, never bubble up — one bad
  posting can't kill the whole run.

---

## 3. Layers in the codebase

```
HTTP/Cron entry        app/api/cron/ingest/route.ts          (170 lines)
       │
       ▼
Orchestrator           lib/ingestion-service.ts              (963 lines)
       │  loops sources, runs steps 0–10 above
       ├──► Adapters   lib/aggregators/*.ts                  (15 files, ~3,800 lines)
       │       fetch + paginate + return uniform RawJobData
       │
       ├──► Filter     lib/utils/job-filter.ts
       │       isRelevantJob(title, description) — keyword gate
       │
       ├──► Normalize  lib/job-normalizer.ts                 (656 lines)
       │       extract salary/location/job-type/experience-level
       │       + lib/salary-normalizer.ts (annual conversion)
       │       + lib/utils/parse-location.ts
       │
       ├──► Dedup      lib/deduplicator.ts                   (378 lines)
       │       externalId (fast) → exact → URL → fuzzy
       │       + lib/company-normalizer.ts (employer name canon)
       │
       ├──► Health     lib/health/                           (~10 files)
       │       check-job-health.ts (decision engine)
       │       probes/greenhouse-api.ts (source-specific)
       │       soft-404-detector.ts
       │       recorder.ts (writes job_health_checks)
       │       chunked-presence.ts (per-chunk source presence)
       │
       └──► Persistence Prisma → jobs, job_health_checks, source_stats,
                          rejected_job, employer_lead
```

Other entry points that hit this same orchestrator (so the layers above
serve everyone):
- `scripts/run-ingestion.ts` — manual local run.
- `app/api/admin/ingest/*` — admin-triggered backfill.
- `lib/inngest/functions/fp-recovery.ts` — false-positive recovery for
  health-check decisions (separate flow, reads the same tables).

---

## 4. Maintenance crons (ingest pipeline only)

These are the crons that touch the lifecycle of `jobs` rows. Excluded:
SEO crons (sitemap, GSC indexing, deindex), employer/candidate alert
crons, social posting, push notifications, user purges. Those are
serving-layer concerns.

| Cron | Schedule (UTC) | Reads | Writes | One-line purpose |
|---|---|---|---|---|
| `ingest` | 6 sources × 2 runs/day | source APIs | `jobs`, `source_stats`, `job_health_checks`, `rejected_job` | Pull, normalize, dedup, insert/renew |
| `cleanup-expired` | runs inside every `ingest` call | `jobs` | `jobs.isPublished` | Unpublish past `expiresAt` (which equals `originalPostedAt + 60d`) |
| `enrich-jobs` | `0 12,18` | `jobs` (descriptions) | `jobs` (salary, city, state, clinical_setting, patient_population, benefits) | LLM-extract structured fields the regex normalizer missed |
| `cleanup-descriptions` | `40 12` | `jobs.description` | `jobs.description`, `jobs.descriptionSummary` | HTML-to-text + boilerplate strip |
| `freshness-decay` | `20 12` | `jobs` (published) | `jobs.qualityScore`, `jobs.isPublished` | Recompute quality score with freshness penalty; unpublish jobs not renewed >120d |
| `check-dead-links` | `30 12,18` | `jobs.applyLink` (1,500/run) | `job_health_checks`, `jobs.isPublished`, `jobs.lastLinkCheckedAt` | Re-probe URLs in batches of 15. Multi-signal voting before flipping `isPublished` |
| `source-presence-unpublish` | `55 12` | `jobs.healthConsecutiveMissing` | `jobs.isPublished` (capped 1,000/run) | Unpublish jobs missing from source for ≥3 consecutive ingest runs (currently shadow-mode) |
| `health-anomaly-check` | `0 13` | `job_health_checks` (24h vs 7d baseline) | Discord/Sentry alerts | Detect σ-deviations in dead-rate / soft-404-rate / flip-rate |

### How they chain together

```
       ingest twice a day
       │
       ├─ inserts/renews         ─┐
       ├─ writes source_stats     │
       └─ writes job_health_checks│
                                  │
                                  ▼
              cleanup-expired (runs inline)
                  → unpublish on expiresAt (= originalPostedAt + 60d)
                                  │
                                  ▼
              cleanup-descriptions   12:40
                  → HTML→text on descriptions touched today
                                  │
                                  ▼
              enrich-jobs            12:00, 18:00
                  → LLM fills missing salary/setting/etc.
                                  │
                                  ▼
              freshness-decay        12:20
                  → recompute qualityScore, unpublish 120d+
                                  │
                                  ▼
              check-dead-links       12:30, 18:30
                  → re-probe 1,500 URLs, vote-flip dead ones
                                  │
                                  ▼
              source-presence-unpub  12:55  (shadow)
                  → unpublish jobs source has stopped returning
                                  │
                                  ▼
              health-anomaly-check   13:00
                  → alert if dead-rate / flip-rate spikes
                                  │
                                  ▼
                       daily-report 13:00 (separate cron)
                       Discord summary to Slack-ish channel
```

All cron schedules live in [vercel.json](../vercel.json).

---

## 5. What users see (the read path)

The read path is small and one-directional: every public job query goes
through one API route, which queries one table.

```
User → /jobs page
       └─ JobsPageClient.tsx fetches /api/jobs?{filters}
              └─ app/api/jobs/route.ts
                     └─ buildWhereClause(filters)  (lib/filters.ts)
                            └─ Prisma SELECT FROM jobs WHERE …
```

### `/api/jobs` request → response
- Accepts: `page`, `limit` (max 50), `sort` (`best`|`newest`|`salary`),
  plus filters (`location`, `workMode`, `jobType`, `minSalary`,
  `postedWithin`, `state`, `isRemote`, `category`, `search`, …).
- Always-applied baseline: `isPublished = true` + `GLOBAL_EXCLUSIONS`
  (drops pure-MD-Psychiatrist roles that match no NP/Nurse/PMHNP/APRN
  keywords — 3 NOT clauses in [lib/filters.ts:290](../lib/filters.ts#L290)).
- Returns: `{ jobs, total, page, totalPages }`.
- **Intentionally excludes `applyLink` from the listing response** to
  prevent mass scraping. The link is only served on the detail page.

### Sort orders
- **`best`** (default): `qualityScore DESC, createdAt DESC` —
  see [lib/utils/job-sort.ts](../lib/utils/job-sort.ts).
- **`newest`**: `originalPostedAt DESC NULLS LAST, createdAt DESC`.
- **`salary`**: `normalizedMaxSalary DESC, normalizedMinSalary DESC, createdAt DESC`.

### What a JobCard shows
From the API response: title, employer, location, jobType, work mode,
salary range, summary excerpt, "Posted N days ago" (computed from
`originalPostedAt`), verified-employer badge, featured badge.

### Filter sidebar pill counts
Counted by [app/api/jobs/filter-counts/route.ts](../app/api/jobs/filter-counts/route.ts).
"Posted within" pills use `freshnessClause(now, windowMs)` from
[lib/filters.ts](../lib/filters.ts) — currently floor=0 (changed
2026-05-05), meaning a job is "fresh in window W" if EITHER source's
`originalPostedAt` OR our `createdAt` is within W. See commit
`b0e269b` for the rationale.

### Other read surfaces fed by the same `jobs` table
- `/jobs/[slug]` — single-job detail page.
- `/jobs/state/[state]`, `/jobs/city/[slug]`, `/jobs/metro/[slug]` —
  pSEO geographic pages.
- `/jobs/{category}` (~25 of them) — pSEO category pages, each backed by
  `CATEGORY_FILTERS` in [lib/filters.ts](../lib/filters.ts).
- `FeaturedJobsSection.tsx` on homepage — pulls top featured jobs.
- Job alert emails — `lib/job-alerts-service.ts` matches saved filters
  against new jobs.

---

## 6. Database tables in scope

| Table | Purpose | Approx size | Retention |
|---|---|---|---|
| `jobs` | The catalog. Aggregator-pulled + employer-posted both live here. | ~3,500 published, ~32k total | Unpublished rows kept for analytics; never hard-deleted |
| `job_health_checks` | Append-only audit log of every probe outcome (HTTP / soft-404 / source-presence / vote) | ~100k/week | Permanent; partitioned monthly (Sprint 5) |
| `source_stats` | Daily roll-up per source: fetched / added / duplicate / expired / avg quality | ~5/day = 1.8k/year | Permanent (analytics) |
| `rejected_job` | Per-rejection log: relevance, normalizer, duplicate, dead-at-ingest | ~10k/week | Reviewed for tuning, then trimmed |
| `companies` | Employer master record — fuzzy-matched on insert | ~2k | Permanent |
| `employer_jobs` | 1:1 sidecar for `sourceType='employer'` rows: payment, logo, dashboard token | ~50 | Permanent |
| `cron_runs` | Cron-execution audit log (started_at, finished_at, success, error, metrics jsonb) | **0 rows last 7d** ← currently broken; see Section 8 | — |

---

## 7. Key constants & thresholds (the magic numbers)

All in [lib/ingestion-service.ts](../lib/ingestion-service.ts) and
[lib/job-normalizer.ts](../lib/job-normalizer.ts):

| Knob | Value | Where |
|---|---|---|
| Vercel cron timeout | 300s | `vercel.json` `maxDuration` |
| Ingest internal time budget | 240s | `lib/ingestion-service.ts:87` |
| Initial job expiry | `originalPostedAt + 60 days` | `lib/job-normalizer.ts` (Gate 3 + expiry rule) |
| Renewal extension | **none — `expiresAt` is set at insert and never extended** | (removed 2026-05-05) |
| Hard max-age cap | **60 days from `originalPostedAt`** (= the same value as initial expiry — single clock) | `lib/ingestion-service.ts` `MAX_JOB_AGE_MS` |
| Normalizer freshness gate (all sources) | 60 days | `lib/job-normalizer.ts` Gate 3 |
| Dedup fuzzy thresholds | title>0.85, employer>0.80, location>0.50 (or both remote) | `lib/deduplicator.ts:288–298` |
| Dead-link batch size | 15 concurrent, 1,500 max/run | `app/api/cron/check-dead-links/route.ts` |
| Source-presence miss threshold | ≥3 consecutive misses | `app/api/cron/source-presence-unpublish/route.ts` |
| Probe-blocking reasons | `http_404`, `http_410`, `greenhouse_api_404` | `lib/ingestion-service.ts:50` |
| Description summary length | 300 chars | `lib/job-normalizer.ts` |

---

## 8. Known gaps & areas worth standardizing

For the refactor — these are the rough edges showing up in the current shape:

1. **Adapters are not uniform.** Each one in `lib/aggregators/` has its own
   pagination loop, rate-limit, error handling, search-term iteration.
   Some throttle, some don't. Some chunk, some don't. Some emit Discord
   diagnostic dumps, most don't. Standardizing on a single
   `Aggregator` interface (`fetch()`, `paginate()`, `health()`) would
   unblock generic test infrastructure and remove ~2,000 lines of dup.

2. **Chunking lives in `vercel.json`, not in code.** Greenhouse's 8 chunks
   and Workday's 5 chunks are a deployment-config concern, not a
   business-logic concern. The adapter doesn't know how many chunks
   exist; it just trusts the `chunk` query param. If we add a 2nd
   workday tenant or remove one, the chunk count in `vercel.json` is
   wrong. A `getChunkCount()` method on the adapter + a build step
   that emits `vercel.json` from code would fix this.

3. **`cron_runs` table is broken.** 0 rows in the last 7 days even though
   crons are clearly running (per `source_stats`). Whatever wrapper was
   supposed to record cron executions has stopped firing. Without it,
   cron-level failures are invisible — we found out greenhouse was
   adding 0 jobs/day for a week purely by inspecting `source_stats`.

4. **No retry / partial-progress recovery.** If a chunk's run hits the
   240s budget halfway through its company list, the remaining
   companies just don't get processed that run — they wait 6h for the
   next scheduled run. A queue-backed model (Inngest is already in the
   repo for FP recovery) would let us pick up where we left off.

5. **Probe-at-insert silently rejects 80% of fetches.** Today we have no
   visibility into *why* rejected. `rejected_job` records the reason,
   but it's not aggregated into `source_stats` and there's no per-source
   rejection-rate alert. A "Greenhouse: 7,927 fetched / 6,670 rejected
   as 404" daily summary would have caught the dead-tenant problem
   weeks earlier.

6. **The "jobs source has stopped returning this row" signal exists but
   is shadow-mode.** `source-presence-unpublish` is wired but commented
   as "until tuned after 1–2 weeks of baseline data." It's been months.
   Either ship it or remove it.

7. **Daily ingest is concentrated in two narrow time windows** (10–11
   UTC and 16–17 UTC). All 25+ ingest crons fire in these two 1-hour
   slots. Spreading them across the day would reduce the chance of
   simultaneous Vercel-function-concurrency limits.

8. **Quality score is computed but barely used as a gate.** It's used
   for `sort=best` ordering, but there's no min-quality threshold for
   being published. A `qualityScore < 10` filter on the homepage might
   meaningfully clean up the floor.

9. **Salary normalization is regex-only at ingest, LLM-only in
   `enrich-jobs`.** Two different code paths producing different
   salaries for the same job depending on which ran. Should be one
   pipeline (regex → LLM fallback).

10. **No integration test covers the full ingest path.** Unit tests
    cover normalizer, dedup, health probes individually, but there's
    no test that takes a fixture `RawJobData[]` → expects `jobs` table
    deltas. A refactor without one is risky.

---

## 9. Where to start a refactor

Suggested incremental order — each step is shippable on its own:

1. **Define the standard `Aggregator` interface.** Implement it for one
   adapter (probably `lever` — simplest). Don't migrate the others yet.
   Verify the orchestrator still works with the old + new mixed.
2. **Migrate the remaining adapters one at a time.** Each migration is
   an isolated PR.
3. **Move chunk config into adapters.** Generate `vercel.json` from a
   build script.
4. **Fix `cron_runs` recording.** Wrap `ingestJobs()` and every other
   cron handler in a single `recordCronRun()` helper.
5. **Add per-source rejection-rate metrics to `source_stats`** + a
   daily Discord summary.
6. **Build a `tests/integration/ingest.test.ts`** using a fixture corpus.
7. **Decide on `source-presence-unpublish`**: ship live or remove.
8. **Unify salary normalization** — single path with regex → LLM fallback.

Each of these is 1–3 days of work and makes the next one easier.
