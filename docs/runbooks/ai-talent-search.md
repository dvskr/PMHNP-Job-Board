# Runbook — AI Talent Pool Search (Employer)

> Owner: AI/ML on-call. SLO: <10s P95, ≥95% success rate.
> Source: `app/api/employer/talent/search/route.ts`, `lib/ai/prompts/talent_search_rerank/v1.json`.
> Flag: `ai.employer.talent_search` (default OFF). Per-employer override.
> Cap: 10 reranks/employer/day (enforced in route via `ai_call_log` count).
> Cost dashboard: `GET /api/admin/ai/stats?task=talent_search_rerank`.

---

## Relationship to `/api/employer/candidates`

The talent-search endpoint is an AI-ranked **complement** to the existing
filter-based browse at `/api/employer/candidates`. It honors the **same**
gates and shapes the response identically so the same client UI renders both:

- Auth: employer or admin role required (same check).
- Active-posting gate: non-admin without an active posting only sees
  `baseSelect` fields. Same as the filter browse — the AI ranking doesn't
  bypass the unlock paywall.
- Privacy transform: last name → first initial unless admin.
- Field-selection by access level: `baseSelect` / `activeSelect` / `adminSelect`
  match the existing route exactly.

What's different: the ranking algorithm. Filter browse sorts by `updatedAt
desc`; talent-search ranks by vector similarity then re-orders the top-30
through an LLM rerank prompt that writes a one-line "why this candidate"
reason. Same dataset, smarter order.

`/employer/talent-search` is now a redirect to `/employer/candidates?ai=1`.
The Smart Match toggle on that page calls this endpoint.

---

## What it does

Pipeline:
1. Embed the employer's natural-language query.
2. Vector search over `candidate_embeddings` → top 50.
3. Hydrate using the SAME tier-aware select as `/api/employer/candidates`.
4. Send the candidate list + job summary to `gpt-5-mini` via the
   `talent_search_rerank` prompt → top 10 ranked + reasons.
5. Apply the SAME privacy transform as `/api/employer/candidates`.

If the rerank fails, the route degrades to vector-only ordering with a generic
"vector match (rerank unavailable)" reason — never throws to the UI.

---

## Symptoms → diagnosis

### Symptom: "Employer says they hit the daily limit but they didn't"

```
SELECT created_at, model, cost_usd FROM ai_call_log
WHERE task='talent_search_rerank' AND tenant_type='employer' AND tenant_id='<EMPLOYER_USER_ID>'
  AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
ORDER BY created_at DESC;
```

The cap is per UTC day — if it's after midnight Pacific but before midnight
UTC, today's count includes calls from this morning UTC. Confirm before
escalating.

### Symptom: "Rerank reasons are repetitive / low quality"

Run the eval:
```
npm run eval talent_search_rerank
```
If it holds baseline, the issue is probably input quality (employer queries
too vague). If the eval is regressing, check the prompt diff:
```
npm run prompt:diff talent_search_rerank
```

### Symptom: "Cost spike on talent_search_rerank"

The 10/day cap should bound spend per employer. A spike usually means a single
employer hitting the cap repeatedly with cache misses. Check:
```
SELECT tenant_id, COUNT(*), SUM(cost_usd)
FROM ai_call_log WHERE task='talent_search_rerank' AND created_at > NOW() - INTERVAL '1 day'
GROUP BY tenant_id ORDER BY SUM(cost_usd) DESC LIMIT 10;
```

If one tenant dominates, set a tenant-scoped flag override to disable
their access until you've talked to them.

### Symptom: "No candidates returned for a query that should match someone"

```
SELECT COUNT(*) FROM candidate_embeddings
JOIN user_profiles up ON up.supabase_id = candidate_embeddings.supabase_id
WHERE up.profile_visible = true AND up.deleted_at IS NULL;
```

If this is much lower than the active candidate count, the embedding worker
is behind. Re-run the backfill:
`npm run backfill:embeddings -- --candidates`.

---

## Mitigations

- **Disable**: env `KILL_AI_EMPLOYER_TALENT_SEARCH=1` and redeploy, OR insert
  a global flag override.
- **Tighten the cap** (route-level): edit `RERANK_DAILY_CAP` in
  `app/api/employer/talent/search/route.ts`.
- **Force vector-only**: trip the breaker on the rerank chain by setting
  `KILL_AI_TALENT_SEARCH_RERANK=1`. The route catches the gateway failure
  and degrades to vector ordering automatically.

## When to wake someone up

- Bias eval fails on `talent_search_rerank` (rerank starts producing
  candidate orderings that vary on demographic-pair inputs).
- Rerank cost >2× projected for >24h with no traffic explanation.
- A discrimination complaint references a specific candidate ranking.

## When NOT to wake someone up

- A single employer reports the rerank "didn't pick the right person" with
  no specific fact dispute. Take it to product.
- The 10/day cap is hit during normal business hours by a busy employer —
  this is the system working as designed.
