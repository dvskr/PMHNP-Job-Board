# LLM Gateway — API Reference

> Single entry point for every AI call across the codebase. Built in
> [Phase 0 Sprint 0.1](./ai-implementation-plan.md#sprint-01-week-1-2--llm-gateway)
> of the AI roadmap. See [ai-architecture.md §4.1](./ai-architecture.md#41-llm-gateway-libaigatewayts--todo)
> for the broader rationale.

**The rule:** every AI call goes through `lib/ai/gateway.ts`. Direct imports
of `openai` or `@anthropic-ai/sdk` outside `lib/ai/providers/` should be
rejected in code review.

---

## Why this exists

| Concern | What the gateway does |
|---|---|
| Provider routing | Each task has a primary model + fallback chain. Failed primaries auto-fall through. |
| Cost tracking | Every call writes `ai_call_log` (tokens, $, latency, cache hit, fallback used). |
| Caching | Deterministic prompts hit Redis (`ai:cache:v1:*`). ~70% cost cut on scoring. |
| Rate limiting | Per-tenant caps so one employer can't burn the budget. |
| Output validation | Optional Zod schema parses + validates JSON output before returning. |
| Circuit breaker | Trips after consecutive failures, auto-recovers on cooldown. |
| Cached-input pricing | Captures OpenAI `cached_tokens` so the 90%-off rate is reflected in cost. |

---

## Quick start

```ts
import { z } from 'zod';
import { complete } from '@/lib/ai/gateway';

const resultSchema = z.object({
    score: z.number().min(0).max(100),
    reasons: z.array(z.string()),
});

const result = await complete({
    task: 'candidate_scoring',
    tenant: { type: 'candidate', id: userId },
    messages: [
        { role: 'system', content: SCORING_PROMPT },
        { role: 'user',   content: payload },
    ],
    cacheKey: ['v1', jobId, userId],   // identical inputs → cached for 24h
    outputSchema: resultSchema,         // gateway parses + validates JSON
});

result.parsed;        // typed by the schema
result.usage.costUsd; // per-call cost in dollars
result.cacheHit;      // true if served from Redis
result.fallbackUsed;  // true if a fallback model handled the call
```

---

## Public API

### `complete<T>(req: CompleteRequest<T>): Promise<CompleteResponse<T>>`

| Field | Required | Description |
|---|---|---|
| `task` | yes | Registered task id from `lib/ai/tasks.ts`. The registry is the source of truth for model + fallback chain + cache TTL + rate limit. |
| `tenant` | yes | `{ type: 'employer'\|'candidate'\|'admin'\|'system', id: string }`. Drives rate limits and cost attribution. |
| `messages` | yes | OpenAI-style `{ role, content }` array. The Anthropic provider extracts the system message automatically. |
| `cacheKey` | no | Tuple of stable inputs (will be SHA-256 hashed). Omit to disable caching for the call. **Never include PII** (DEA, NPI, race, gender). |
| `outputSchema` | no | Zod schema. When set, JSON mode is auto-enabled and the response is parsed + validated; `result.parsed` is typed. |
| `options.provider` / `options.model` | no | Override the registry. Use sparingly — bypass loses the fallback chain. |
| `options.temperature` / `options.maxTokens` | no | Per-call overrides for the registry defaults. |
| `options.skipCacheRead` | no | Bypass cache lookup but still write the result. Useful for forced re-runs. |

#### Returns `CompleteResponse<T>`

```ts
{
    content: string;             // raw model output
    parsed?: T;                  // populated when outputSchema was provided
    provider: 'openai' | 'anthropic';
    model: string;
    usage: { inputTokens, cachedTokens, outputTokens, costUsd };
    latencyMs: number;
    cacheHit: boolean;
    fallbackUsed: boolean;
}
```

#### Errors

All errors thrown are `AiGatewayError` with a typed `code`:

| Code | When | Caller action |
|---|---|---|
| `rate_limited` | Per-tenant quota for this task is exhausted. | Surface 429 + retry-after; don't auto-retry. |
| `invalid_output` | Model output failed `outputSchema` validation. | Bug in prompt or schema — alert, don't retry. |
| `provider_not_configured` | Required env (`OPENAI_API_KEY` etc.) is missing. | Static config issue; fix env. |
| `all_providers_failed` | Primary + every fallback threw. | Surface a friendly error; the failure is already logged + persisted. |
| `timeout` | Provider took longer than `timeoutMs`. | Retry-safe (next attempt may succeed). |
| `unknown` | Anything else. | Inspect `err.cause`. |

### `embed(req: EmbedRequest): Promise<EmbedResponse>`

Cheap, single-purpose primitive over `text-embedding-3-small`. Currently
no-fallback-chain (Sprint 0.3 expands this).

```ts
const { embedding } = await embed({
    input: 'PMHNP with 5 years of telehealth experience...',
    tenant: { type: 'system', id: 'embedding-worker' },
});
```

---

## Adding a new task

1. Add a literal to `AiTaskId` in `lib/ai/types.ts`.
2. Register the task in `lib/ai/tasks.ts` with primary + fallbacks + cache TTL + rate limit.
3. (Optional) Add a pricing entry to `lib/ai/pricing.ts` if your model isn't already there.
4. Write the Zod output schema in the calling module.
5. Write tests (see `tests/lib/ai/gateway.test.ts` for patterns).
6. **Sprint 0.2 follow-up** — once the prompt registry lands, move the prompt out of the calling module into `lib/ai/prompts/<id>/v1.json` and add a golden eval set.

---

## Data flow

```
caller
   │
   ▼
gateway.complete()
   │
   ├─► readCache(task, cacheKey)  ────────► HIT  ─► record + return
   │                                          │
   │                                  (MISS)  │
   ▼                                          │
checkAiRateLimit(tenant, task) ──► EXCEEDED ─► throw rate_limited
   │
   ▼
for each target in [primary, ...fallbacks]:
   ├─ skip if !provider.isConfigured()
   ├─ skip if !breaker.isAvailable(provider)
   ├─ provider.complete({...})
   │     │
   │     ├─ success → recordSuccess(provider)
   │     │            outputSchema?.parse()
   │     │            writeCache()
   │     │            recordAiCall()
   │     │            return
   │     │
   │     └─ throw  → recordFailure(provider)  (unless not_configured)
   │                 continue to next target
   │                 (BAIL on invalid_output — caller error, not provider error)
   ▼
recordAiCall(error: 'all_providers_failed')
throw all_providers_failed
```

---

## Operational notes

- **Cost dashboards** read from `ai_call_log` (Sprint 0.4 builds the UI). The
  table is append-only; never delete rows — drift detection depends on
  historical data.
- **Cache invalidation** — bump `CACHE_VERSION` in `lib/ai/cache.ts` from `v1`
  to `v2` to invalidate every cached entry on next deploy. Cheaper than
  scanning Redis for keys to delete.
- **Rate limits** in `lib/ai/tasks.ts` are intentionally generous in Phase 0.
  Tighten in Sprint 0.4 when real cost data is in.
- **Fallback chain** — order matters. Cheaper fallbacks first means cost
  stays bounded under primary outage; quality degradation is the trade.
- **Circuit breaker** — in-memory per process. On Vercel that means each
  serverless instance learns independently. That's intentional for now —
  it scales without adding shared state.

---

## Testing

The gateway is unit-tested in `tests/lib/ai/`:

- `pricing.test.ts` — cost math (cached input discount, unknown model = 0, microcent rounding)
- `circuit-breaker.test.ts` — open/close/half-open transitions, per-provider isolation
- `cache.test.ts` — key derivation determinism + collision properties
- `gateway.test.ts` — provider routing, fallback engagement, schema validation, rate-limit + all-providers-failed paths

To test a new task end-to-end, mock the providers in your feature's test
file using the same pattern as `tests/lib/ai/gateway.test.ts`. Sprint 0.5
will extract a `mockLLMResponse()` helper so this is one line per test.

---

## What this gateway does NOT do (yet)

These ship in later Phase 0 sprints — see [ai-implementation-plan.md](./ai-implementation-plan.md):

- **Prompt registry** (Sprint 0.2) — prompts are still inline in caller modules.
- **Eval harness** (Sprint 0.2) — no golden-set CI gate yet.
- **Vector search** (Sprint 0.3) — `embed()` exists but no `job_embeddings` table consumer.
- **Feature flags** (Sprint 0.4) — gateway calls always run; no per-feature kill switch yet.
- **PII scanner** (Sprint 0.5) — no automated check that prompts exclude DEA/NPI/race fields. Until then, **callers are responsible** for not putting PII in the prompt body or `cacheKey`.
