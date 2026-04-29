# Enterprise Job Health Detection — Architecture

**Status:** PROPOSED — held for review. Not yet implemented.
**Author:** Architecture proposal, 2026-04-28
**Scope:** Replace single-flag `is_published` + `last_link_checked_at` with multi-signal health detection, audit trail, and durable workflow.

---

## 1. Problem Statement

The current job-board system collapses every reason a job might leave the catalog into one binary `is_published` flag, decided by a single sequential cron (`app/api/cron/check-dead-links`) that runs HEAD/GET probes with no retry semantics, no audit history, no false-positive recovery, and no source-aware soft-404 detection.

This is fine for a side project. It is not fine for a paid product where:

- A false-published listing translates directly to user trust loss and SEO penalty.
- A source-side bot block (e.g., Datadome 403) currently looks identical to a real dead URL.
- There is no way to answer "why was my job removed?" — no audit trail.
- A single bad ingest run can mass-flip jobs without anyone noticing.

---

## 2. Define Terms Precisely

The current system has one state. The new system distinguishes five:

| Term | Meaning | Authoritative signal |
|---|---|---|
| **Expired (lifecycle)** | The job's contract with us is over | `expires_at < NOW()` OR `originalPostedAt + maxAge < NOW()` OR source decommissioned OR not renewed in N days |
| **Dead (link)** | The apply URL no longer serves a real job posting | HTTP 404/410, OR HTTP 200 but body matches "this job has been filled" / "no longer accepting" / source-specific 'jobNotFound' DOM markers |
| **Orphaned** | Job exists in our DB but is gone from the source's API/feed | Source returned full listing 3 consecutive cycles and our `external_id` was missing |
| **Suspect** | Behaving abnormally but not provably dead | Apply CTR dropped >90% week-over-week, OR redirect chain >5, OR returns soft-404 (200 + "not found" content), OR source-side flags |
| **Stale** | Posting still works but content is old | `originalPostedAt > 60d` and no renewal seen |

The five states are independent. A job can be both `stale` and `alive`. An `expired` job is not necessarily `dead`.

---

## 3. Data Model

Replace single timestamp with append-only audit history.

```sql
-- Append-only log of every check. Never delete.
CREATE TABLE job_health_check (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT NOW(),
  check_type      text NOT NULL,        -- 'http_probe' | 'source_presence' | 'content_pattern' | 'engagement_anomaly' | 'lifecycle'
  outcome         text NOT NULL,        -- 'alive' | 'dead' | 'suspect' | 'orphaned' | 'inconclusive' | 'false_positive' | 'admin_override'
  http_status     int,
  redirect_chain  jsonb,
  response_ms     int,
  user_agent      text,
  evidence        jsonb,                -- e.g. {"matched_pattern": "no longer accepting"}
  checker_version text NOT NULL         -- bump when rules change so old data is comparable
);
CREATE INDEX ON job_health_check (job_id, checked_at DESC);
CREATE INDEX ON job_health_check (outcome, checked_at DESC) WHERE outcome <> 'alive';

-- Current state, derived from rolling window of checks
ALTER TABLE jobs ADD COLUMN health_state text NOT NULL DEFAULT 'unknown';
  -- 'alive' | 'suspect' | 'dead' | 'expired' | 'orphaned' | 'unknown'
ALTER TABLE jobs ADD COLUMN health_state_reason text;
ALTER TABLE jobs ADD COLUMN health_state_changed_at timestamptz;
ALTER TABLE jobs ADD COLUMN health_consecutive_failures int DEFAULT 0;
ALTER TABLE jobs ADD COLUMN health_last_alive_at timestamptz;
```

Audit trail benefits: GDPR access requests, "why was my job removed" support tickets, SEO appeal evidence, ability to compute *trends* (not just point-in-time facts).

---

## 4. Detection Rules — Five Independent Signals

Run all five **in parallel** per job. Each emits a signal with a confidence. **Never unpublish on a single signal alone.**

| Signal | Method | False-positive guard |
|---|---|---|
| **HTTP probe** | HEAD → fall back to GET. Use rotating real browser UAs. Follow up to 5 redirects. | 403/429/5xx/timeout = `inconclusive`, NOT `dead`. Bot-blockers like Datadome routinely 403 server-to-server. |
| **Soft-404 detection** | Fetch HTML, check for source-specific phrases ("position has been filled", "no longer accepting applications", Greenhouse `<div class="error">`, Lever `Job Not Found`) | Maintain per-source pattern library; review monthly via diff against false-positive log. |
| **Source-presence** | For aggregator sources, after each ingest: jobs whose `external_id` was *not* in the latest fetch increment `health_consecutive_failures`. After 3 consecutive misses → `orphaned`. | Only counts when the source returned a "full" page (>50% of historical avg). Source outages must not flip jobs to orphaned. |
| **Engagement anomaly** | Time-series on view_count + apply_click_count. CTR drops >90% w/w with the source still publishing → `suspect` | Per-source baselines; ignore <5 view weeks (low signal). |
| **Lifecycle** | `expires_at < NOW()` OR `originalPostedAt + 120d < NOW()` (config) OR source removed from `ALL_SOURCES` | Direct/employer-paid posts get extended grace + email warning before flip. |

### State transition rule (the only place that mutates `health_state`)

- 1 dead signal + alive elsewhere → `suspect`
- 2 independent dead signals → `dead`
- Source-presence orphaned + http 404 → `dead` (immediate)
- 3 consecutive `suspect` over 24h → `dead`
- Lifecycle clock alone → `expired` (separate state from `dead`)

### Confidence and recovery

- A `dead` flip must require **2 independent evidences** (e.g., HTTP 404 *and* missing from source feed).
- Every flip emits an event consumed by an "appeal" job: re-probe in 6h, 24h, and 72h with rotated user-agents and (if available) different egress IP.
- If any re-probe returns alive → automatic resurrection, log to `job_health_check` with `outcome='false_positive'`.
- Track FP rate per rule. If any rule's FP rate > 2%, page on-call.

---

## 5. Execution Architecture

Vercel cron's 300-second budget is fundamentally wrong for this workload. ~8.5k URL probes with retry semantics requires a real workflow runtime.

```
┌─────────────────────────┐
│  Scheduler (Vercel cron)│  fires every 15 min, just enqueues
└──────────┬──────────────┘
           │ enqueue per-job health-check tasks
           ▼
┌─────────────────────────┐
│  Durable workflow queue │  Inngest / Trigger.dev / Temporal / BullMQ+Upstash
│  - exponential backoff  │
│  - dedup window         │
│  - per-domain rate cap  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Health-check workers    │  stateless functions, each runs 1 job's 5 signals
└──────────┬──────────────┘
           │ writes job_health_check row, evaluates rules
           ▼
┌─────────────────────────┐
│ State machine           │  single source of truth for transitions
│ alive → suspect → dead  │  emits domain events
└──────────┬──────────────┘
           │ events
           ▼
┌─────────────────────────┐
│ Reactors                │
│ - Deindex (Google, IndexNow)
│ - Notify employer (paid)│
│ - Sentry alert if >2σ rise in dead rate
│ - Datadog metric        │
└─────────────────────────┘
```

### Recommended runtime: Inngest

Highest fit for the existing stack (Next.js + Vercel + Supabase). Replaces the cron-handler pattern with:

```ts
inngest.createFunction(
  { id: 'job-health-probe', concurrency: { limit: 30, key: 'event.data.domain' } },
  { event: 'job/health.check.requested' },
  async ({ event, step }) => {
    const probe    = await step.run('http-probe',      () => probeHttp(event.data.url));
    const content  = await step.run('content-scan',    () => scanContent(probe.body));
    const presence = await step.run('source-presence', () => checkSource(event.data));
    return decide([probe, content, presence]);  // pure function, fully replayable
  }
);
```

Provides: retry-with-backoff, per-domain concurrency caps (won't hammer Greenhouse), idempotency, replayable audit trail.

Alternatives: Trigger.dev v3 (similar profile), Temporal (heavier, more control), BullMQ + Upstash Redis (lightest).

---

## 6. Observability Layer

The part that makes it "enterprise."

| Surface | What lives there |
|---|---|
| **Metrics** (Datadog/Grafana) | Active jobs, suspect rate, dead rate, FP rate, p50/p95 probe latency — all sliced by `source_provider`. |
| **Dashboards** | "Per-source death curve" — when a source's death rate doubles overnight, that's almost always a source-side bot block, not real dead jobs. |
| **Alerts** | Anomaly detection: dead-rate moves >3σ from 7d baseline → page. Daily dead-link cleanup count moves >2σ → warn. |
| **Tracing** | OpenTelemetry spans across probe → content scan → state transition. Replay every signal that led to a job removal. |
| **Reports** | Weekly auto-email to ops: top 10 sources by FP rate, top 10 by orphan rate, salary-confidence drift. |

---

## 7. Compliance + Audit

- `job_health_check` is append-only, retained ≥ 13 months (covers GDPR access requests + most SEO appeal windows).
- Every state transition records *which checker version* decided it. When you change a rule, old data stays comparable.
- Admin dashboard shows full health timeline per job, plus a "manual override" button that writes its own audit row (`outcome='admin_override'`) — admins can never silently un-publish.

---

## 8. Phased Migration Path

Don't big-bang it.

| Week | Action |
|---|---|
| **1** | Ship `job_health_check` table + start *writing* to it from the existing `check-dead-links` cron in **shadow mode** (no behaviour change). Compare new rule outcomes to current outcomes for 2 weeks; tune thresholds against real data. |
| **3** | Add the 4 missing signals (soft-404, source-presence, engagement anomaly, lifecycle as separate state). Still shadow mode. |
| **5** | Move scheduler off Vercel cron onto Inngest. Put HTTP probes behind per-domain concurrency caps. Still shadow mode for state mutations. |
| **7** | Cut over `is_published` flips to be driven by the new state machine. Old cron runs in dual-write for 1 more week as safety net. |
| **9** | Decommission old cron. Add anomaly alerts to PagerDuty/Sentry. |

---

## 9. Honest Status Quo Until This Ships

What you have today (`last_link_checked_at`, single HTTP probe, no soft-404 detection, no source-presence cross-check, no audit history, no FP recovery) gives a dead-rate estimate within ±15-20% — fine for triage, not fine for a paid product.

---

## 10. Open Questions / Held for Discussion

- Should ingestion-pipeline issues (e.g., Greenhouse 39k fetches with 0 adds, jsearch zombie tail, company-name dedup misses) be addressed in the same project, or split?
- Inngest free tier vs Trigger.dev — final pick affects Sprint 2 interfaces.
- Should the engagement-anomaly signal use Supabase analytics events directly, or pipe through a separate analytics warehouse?
- Soft-404 pattern library: maintain in code, or in a DB table editable via admin UI?

---

## 11. Related Documents

- [Ingestion Pipeline Audit (2026-04-28)](./ingestion-pipeline-audit.md) — current state of the pipeline, prod DB snapshot, identified risks.

---

**Decision needed before implementation begins.** This document is the proposal; nothing is built yet.
