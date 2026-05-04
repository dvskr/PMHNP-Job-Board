# Runbook — AI Candidate Scoring

> Owner: AI/ML on-call. SLO target: <5% error rate, P95 latency <30s.
> Source code: `lib/candidate-scorer.ts`, `lib/ai/prompts/candidate_scoring/v1.json`.
> Cost dashboard: `GET /api/admin/ai/stats?task=candidate_scoring`.
> Kill switch: env var `KILL_AI_CANDIDATE_SCORING=1` (no DB flag — scoring runs
> async on every application; disabling stops scoring but applications still flow).

---

## What this feature does

When a candidate submits a job application, the API returns 200 immediately
and emits an Inngest event. The scoring worker (`lib/inngest/functions/...`)
picks it up and:

1. Fetches the job + candidate profile + screening answers from the DB.
2. Loads the registered prompt (`candidate_scoring/v1`) from disk.
3. Calls `complete()` from `lib/ai/gateway` with task `candidate_scoring`.
4. Persists `aiMatchScore`, `aiMatchReasons`, `aiMissingItems` on the
   `JobApplication` row.

Employers see the score on their applications dashboard.

---

## Symptoms → diagnosis flowchart

### Symptom: "Employer reports applications are showing no score"

```
1. Check the application row in the DB:
     SELECT id, ai_match_score, ai_match_reasons, ai_missing_items, created_at
     FROM job_applications WHERE id = '<APP_ID>';

   - score=null after >2 min  →  the worker hasn't processed it yet.
                                  Move to "worker stalled" below.
   - score=null + created_at >24h ago  →  worker error path. Check the call log:
        SELECT * FROM ai_call_log
        WHERE task='candidate_scoring' AND created_at > NOW() - INTERVAL '1 day'
        AND error IS NOT NULL ORDER BY created_at DESC LIMIT 20;
   - score is present but zero  →  prompt or model issue (see "scoring quality" below).
```

### Symptom: "Scores look wrong / arbitrary / biased"

1. **First**: confirm the prompt loaded — `npm run prompt:diff candidate_scoring` to see
   what's currently in registry.
2. Pull a representative case and re-run it manually:
   ```
   npm run eval candidate_scoring                # full golden set
   npm run eval candidate_scoring --bias         # bias pair set
   ```
3. If eval fails the baseline → drift cron should already have alerted;
   check #ai-alerts in Discord.
4. If bias suite fails → STOP. Disable scoring (env kill) and open an incident.

### Symptom: "Cost spike alert"

1. Check the dashboard:
   ```
   GET /api/admin/ai/stats?days=7
   ```
2. If `cacheHits/calls` ratio dropped sharply, a prompt change probably
   invalidated the cache. Expected for ~24h after a prompt rollout.
3. If the same `tenant_id` accounts for >50% of calls, suspect abuse:
   ```
   SELECT tenant_id, COUNT(*) as calls, SUM(cost_usd) as cost
   FROM ai_call_log WHERE task='candidate_scoring' AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY tenant_id ORDER BY cost DESC LIMIT 10;
   ```
4. Mitigation: tighten the per-tenant rate limit in `lib/ai/tasks.ts` (currently
   200/hour) and redeploy. The flag system can also block specific tenants.

### Symptom: "Latency spike alert"

1. Check provider health: probably OpenAI is degraded.
2. Confirm fallback engaged:
   ```
   SELECT provider, model, COUNT(*), AVG(latency_ms)
   FROM ai_call_log WHERE task='candidate_scoring' AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY provider, model;
   ```
   Anthropic `claude-sonnet-4-6` rows = fallback firing.
3. If neither provider is responsive, the circuit breaker will eventually open
   and every call will fail with `all_providers_failed`. The application keeps
   working — scores are written as null. No customer-facing breakage.

---

## Mitigations

### Disable scoring entirely (panic stop)

```
# Set in Vercel env, redeploy
KILL_AI_CANDIDATE_SCORING=1
```

Effect: every `complete()` call short-circuits via the flag check
**(NOT YET WIRED — Sprint 0.4.4 ships the flag → call site integration).**
Until then, the workaround is to remove the OPENAI_API_KEY env (drastic; affects
all AI features).

### Force fallback to Anthropic

```
# Set in Vercel env, redeploy
ANTHROPIC_API_KEY=<key>
```

Then trip the OpenAI breaker by sending traffic through it; alternatively, edit
`lib/ai/tasks.ts` `candidate_scoring.primary` to point at anthropic and redeploy.
A full revert is a one-line change.

### Roll back the prompt

The registry is git-versioned. Each prompt change is a single-line edit to a
JSON file. To roll back:

```
git revert <commit-that-shipped-the-prompt-change>
git push
```

After redeploy, the gateway picks up the previous version. The cache key
includes the prompt version, so cached scores from the new version are not
served against the old prompt — no stale scoring.

---

## When NOT to wake someone up

- Scores are missing on applications older than 30 days but present on
  recent ones — backfill, not on-call.
- A single `tenant_id` complains their score "looks wrong". Take it to
  product, not on-call.
- Cost is up but stays within the projected envelope (dashboard's `totalCostUsd`
  vs. projection in `docs/ai-architecture.md` §9).

## When to wake someone up

- Bias eval fails on the latest snapshot.
- Error rate >10% sustained for >15 minutes.
- Cost alert (>200% projected daily spend) with no associated traffic spike.
- A discrimination complaint cites a specific scoring decision.
