# A/B Experiment Harness — Runbook

Phase 1 Sprint 1.1.6.

## What it is

Two tables + one helper module:

- `experiment_assignment` — sticky per-tenant arm picks. One row per (experiment, tenant) triple, written on first request.
- `experiment_event` — append-only event log (impression / click / apply / etc.) used to compute arm-level conversion math.
- [`lib/ai/experiments.ts`](../lib/ai/experiments.ts) — `getExperimentArm()` + `trackExperimentEvent()`.

The arm picker is a salted FNV-1a hash, so a tenant's arm is deterministic even if a write race loses to a concurrent assignment. Once the row exists, it's authoritative — rollout-percent changes do **not** re-bucket existing tenants.

## Live experiments

### `semantic_search.v1`

Wired into `GET /api/jobs/search/semantic`. Anonymous callers get a sticky 1-year HTTP-only cookie (`pmhnp_exp_anon`) so the arm survives across sessions.

| Arm | Behavior |
|---|---|
| `control` | Keyword-only path. Embed + vector search are skipped. |
| `treatment` | Full hybrid pipeline (embed → vector → RRF with keyword). |

Rollout: 50% to `treatment`. Each search emits one `impression` event.

## Querying arm-level metrics

```sql
-- Impressions per arm over the last 7d
SELECT arm, COUNT(*) AS impressions
FROM experiment_event
WHERE experiment = 'semantic_search.v1'
  AND event_type = 'impression'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY arm;

-- Sticky-assignment count per arm (current population)
SELECT arm, COUNT(*) AS assigned_tenants
FROM experiment_assignment
WHERE experiment = 'semantic_search.v1'
GROUP BY arm;
```

CTR / apply-rate joins land once a `click` and `apply` event source is wired — for `semantic_search.v1` the natural place is the job-detail apply button, not yet instrumented.

## Adding a new experiment

1. Pick a versioned name (`feature_name.vN`). Bumping the version forces re-bucketing.
2. Define arms — first arm is always control.
3. Call `getExperimentArm({ experiment, arms, rolloutPercent }, tenant)` at the entry point.
4. Branch behavior on the returned arm string.
5. Emit `trackExperimentEvent` for each measurable surface (impression, click, apply).

## Failure modes

- **DB read fails** → helper falls back to the deterministic hash. Same tenant gets the same arm regardless. Event writes silently no-op.
- **Race on assignment write** → `upsert` wins; both racers compute the same arm via the salted hash, so the persisted arm matches the in-memory choice.
- **Cookie cleared (anonymous)** → tenant gets a new anonymous id and may land in a different arm. Acceptable cost — they were anonymous anyway.

## Rolling back

Set `rolloutPercent` to 0 in the calling code. Existing assignments still resolve to whatever arm they were given — to force everyone back to control, version the experiment name (e.g., `semantic_search.v2` with rolloutPercent: 0).
