# Runbook — AI Semantic Job Search

> Owner: AI/ML on-call. SLO: <3s P95, ≥95% success rate.
> Source: `app/api/jobs/search/semantic/route.ts`, `lib/ai/vector-search.ts`.
> Flag: `ai.search.semantic` (default OFF). Per-tenant override via admin UI.
> Cost dashboard: `GET /api/admin/ai/stats?task=embeddings_generic`.

---

## What it does

`/jobs/search` page → embeds the user's query → vector search over
`job_embeddings` → keyword search via Postgres ILIKE → reciprocal-rank
fusion → top-K with similarity-derived "% match" badge.

When the gateway throws (provider outage, breaker open, rate limit), the
route returns `degraded: true` and serves keyword-only results. The UI shows
a small banner explaining the degradation; no 5xx ever surfaces to the user.

---

## Symptoms → diagnosis

### Symptom: "Search returns no results / degraded banner is always on"

1. Check the gateway:
   ```
   SELECT created_at, error, latency_ms FROM ai_call_log
   WHERE task='embeddings_generic' ORDER BY created_at DESC LIMIT 20;
   ```
2. If recent rows show `error='all_providers_failed'` → both providers down,
   wait it out (UI is already serving keyword results).
3. If no rows exist at all → embeddings task isn't being called. Most likely
   the flag is off; verify with the admin flags endpoint.

### Symptom: "% match badge always shows 0%"

This is by design when `degraded: true` (no vector data available, only
keyword rank). If it's happening on healthy traffic, check:

```
SELECT COUNT(*), MIN(updated_at), MAX(updated_at) FROM job_embeddings;
```

If the count is much lower than `published jobs`, run the backfill:
`npm run backfill:embeddings -- --jobs`.

### Symptom: "Cost spike on embeddings"

Each query embeds once → ~$0.00002. A spike usually means a bot is hitting
the search endpoint. Mitigations in order:

1. Tighten the rate limit on `/api/jobs/search/semantic` (currently 60/min).
2. Add an `ai.search.semantic` global override: `enabled=false` for 1 hour.
3. If the abuser is a known tenant, set a `tenant`-scoped override.

---

## Mitigations

- **Disable**: env `KILL_AI_SEARCH_SEMANTIC=1` and redeploy, OR insert a
  global flag override with `enabled=false` (faster, no deploy).
- **Force degraded mode**: insert a global override with `enabled=true` but
  also set `KILL_AI_EMBEDDINGS_GENERIC=1` to disable embedding calls only.
  The route catches the gateway error and serves keyword results
  transparently.
- **Re-embed everything**: `npm run backfill:embeddings -- --jobs` is
  idempotent; safe to re-run after any prompt or job-text format change.

## When to wake someone up

- Search 5xx rate >5% sustained for >15 minutes.
- Cost dashboard shows embeddings cost >10× projected (likely bot or worker
  loop; tighten rate limit immediately).
- pgvector index returns wrong results after a Postgres upgrade.

## When NOT to wake someone up

- Single user reports "search results are weird" without specifics. Take it
  to product, not on-call.
- Degraded banner appears briefly during a known provider incident — the
  fallback is doing exactly what it should.
