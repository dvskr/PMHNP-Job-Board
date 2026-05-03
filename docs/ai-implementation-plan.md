# AI Implementation Plan — PMHNP Hiring

> Companion to [ai-architecture.md](./ai-architecture.md). The architecture is
> WHAT we're building. This doc is HOW — sprint-sized tickets, dependencies,
> quality gates, rollback paths, eval methodology, and definition-of-done at
> every level. Designed so no piece slips through.

---

## 0. Plan Philosophy

### 0.1 Non-negotiables (the "no quality compromise" rules)

1. **Every AI feature ships behind a feature flag.** Killable in <1 minute without a deploy.
2. **Every AI feature has an eval suite** before it ships. Minimum 30 hand-rated golden cases per feature.
3. **Every AI feature ships with the test pyramid complete** (see Section 1.4): unit + integration + E2E tests for the user flow, in the SAME PR as the feature code. No "tests in a follow-up PR" — that follow-up never lands.
4. **Every AI feature is observable** — cost, latency, error rate, quality drift dashboards exist before launch.
5. **Every prompt change goes through eval-gate CI** — break the eval baseline and you can't merge.
6. **Every user-facing AI output is sanitized + validated** — never trust LLM output as final, especially for HTML, links, JSON, or anything persisted.
7. **Every AI decision affecting customer outcomes is logged** to AuditLog (already in schema). Includes prompt version, model, tokens, latency, cost.
8. **No AI feature replaces compliance-critical logic.** Knockout rules, payment validation, refund processing — all deterministic. AI is supplementary, never load-bearing for compliance.
9. **Two-key for prompt changes that affect production scoring.** Self-review + one other engineer. Same as DB migrations.
10. **All PII is masked or excluded from prompts.** DEA, NPI, race/gender/age never enter LLM context.
11. **No AI feature ships without runbook.** "What to do when this breaks" — written before launch, not after the first incident.

### 0.2 Build sequencing principles

- **Plumbing before features.** Phase 0 (gateway, eval, observability) must land before any new AI feature ships.
- **Cheap before fancy.** Use the smallest model that passes eval. Upgrade only with proof.
- **One audience per phase.** Don't fan out to candidate + employer + platform simultaneously. Focus a quarter on each.
- **Read before write.** Search/recommendations (read-only) before generation (write actions).
- **Observe before optimize.** Don't tune cost or latency until you have 30 days of production data.

### 0.3 What "done" means at every level

| Level | Definition |
|---|---|
| **Ticket** | Code merged, type-check + lint clean, unit tests pass, eval cases added, runbook updated, behind a flag, dashboards extended, code review approved |
| **Feature** | All tickets done, end-to-end test passes, flag enabled for 1+ employer/candidate, eval baseline established, 7-day soak with no incidents |
| **Phase** | All features done, retrospective written, next phase scoped, eval suite covers 100%+ of phase features, cost dashboard shows < projected |
| **Roadmap** | All 4 phases done, AI cost <5% of revenue, no open P0/P1 AI bugs, monthly eval drift report green |

---

## 1. Quality Bar (concrete, measurable)

### 1.1 Eval thresholds (block deploy if not met)

| Metric | Threshold | Tool |
|---|---|---|
| **Candidate scoring agreement with human raters** | ≥80% within ±10 points of human score on 100-case golden set | Custom eval harness |
| **JSON output validity** | 100% (zero parse failures across 1000 sample runs) | Schema validation in test |
| **Hallucination rate on factual claims** | <1% (e.g. claims about candidate's experience) | Manual review of 100 random outputs/wk |
| **Bias on synthetic-pair test** | Score variance ≤2 points across demographic-pair candidates | Bias eval set (50 pairs) |
| **PII leakage** | Zero detections (DEA, NPI, race, gender) in any prompt | Prompt-construction tests + production scanner |
| **Latency P95** | <3s for sync flows, <30s for async flows | OpenTelemetry metrics |
| **Cost per call** | Within 20% of projection | Real-time cost dashboard |

### 1.2 Code quality bar

| Standard | Enforced by |
|---|---|
| TypeScript strict mode | `tsc --noEmit` in CI |
| Zero `any` types in AI code paths | ESLint rule + manual review |
| No hardcoded prompts in route files | Architecture rule, ESLint custom rule |
| All AI calls go through `lib/ai/gateway.ts` | Code review checklist |
| 100% of AI features behind feature flags | Integration test |

### 1.3 User experience bar

| Standard | Test |
|---|---|
| AI outputs surfaced in UI must be loading-state-aware | Manual UX review |
| AI features degrade gracefully if LLM down | Chaos test: kill LLM provider, verify UI doesn't break |
| User can opt out of AI features per their account settings | Required field in user settings UI |

### 1.4 Test Pyramid (required for every AI feature)

Every feature ships with all 4 layers in the SAME PR. No skipping the bottom of the pyramid because "the integration test covers it."

```
              ┌─────────────────┐
              │  Eval Tests     │   Quality of LLM output
              │  (30+ cases)    │   "Does the AI do the right thing?"
              ├─────────────────┤
              │   E2E Tests     │   User flow through browser
              │   (1-3 critical │   "Can the user complete the journey?"
              │    paths)       │
              ├─────────────────┤
              │  Integration    │   Server flow with mocked LLM
              │  Tests (5-10)   │   "Does the API + DB + cache work?"
              ├─────────────────┤
              │  Unit Tests     │   Pure functions in isolation
              │  (15+ cases)    │   "Is each piece correct?"
              └─────────────────┘
                  Test Pyramid
```

#### Layer-by-layer requirements

| Layer | Tool | Required scope per AI feature | Coverage threshold |
|---|---|---|---|
| **Unit** | Vitest | Prompt construction, schema validation, sanitizers, score-clamping, parsers, helpers | ≥80% line coverage on `lib/ai/<feature>/**` |
| **Integration** | Vitest + mocked LLM | Full server-side flow: API receives input → calls gateway (mocked) → persists to DB → returns expected response | All happy paths + 3 error paths (LLM timeout, schema-invalid response, rate-limit) |
| **E2E** | Playwright | User clicks button → AI feature runs → result appears in UI → side effects visible (e.g. dashboard updates) | At least 1 happy-path scenario per user-facing feature |
| **Eval** | Custom harness | LLM output quality on golden set | ≥30 cases, baseline score must improve or hold per release |

#### What MUST be tested in each layer

**Unit tests (every feature):**
- Prompt template renders correctly with various inputs
- Output schema validation rejects malformed responses
- Score/output clamping (e.g., score capped 0-100)
- Sanitizers strip PII, HTML, prompt-injection patterns
- Cache key derivation is deterministic
- Pure helper functions (no LLM calls)

**Integration tests (every feature):**
- API endpoint returns 200 with valid input (mocked LLM response)
- API rejects invalid input (400)
- LLM timeout → falls back to secondary provider
- LLM returns malformed JSON → graceful error
- Rate limit hit → 429 with helpful message
- DB persistence verified (row created/updated as expected)
- Feature flag OFF → AI code path skipped, fallback used
- Cost tracking entry written to `ai_call_log`

**E2E tests (every user-facing feature):**
- Critical happy path: user triggers feature → loading state → result rendered
- Auth gate enforced (logged-out user redirected)
- Feature flag respected (off = UI hidden or non-AI fallback shown)
- Error path: LLM unavailable → user sees friendly error, not 500

**Eval tests (every feature with LLM output):**
- Golden set in `tests/ai/golden/<feature>.json` with ≥30 cases
- Bias eval pair set if feature affects ranking/scoring
- Baseline tracked; regressions blocked in CI

#### Test infrastructure requirements (build once, reuse)

| Helper | Location | Purpose |
|---|---|---|
| `mockLLMResponse()` | `tests/helpers/ai.ts` | Stub gateway calls in integration tests with deterministic responses |
| `seedTestJob()`, `seedTestCandidate()` | `tests/helpers/db.ts` | Create realistic fixtures for integration + E2E |
| `runEvalCase()` | `lib/ai/eval/runner.ts` | Execute single golden case, return score |
| `evalSuite()` | `lib/ai/eval/suite.ts` | Run all golden cases for a feature, return aggregate |
| `playwrightAuth()` | `tests/e2e/helpers/auth.ts` | Sign in as test user with predictable role + state |
| `assertNoPIIInPrompt()` | `tests/helpers/pii.ts` | Scan rendered prompt for forbidden patterns |

#### CI gates (runs on every PR touching AI code)

```
PR opened/updated
   │
   ├─► Unit tests        (must pass — fast, ~30 sec)
   ├─► Integration tests (must pass — medium, ~2 min)
   ├─► PII scanner        (must pass — instant)
   ├─► Eval suite        (must not regress >5% — slow, ~5 min)
   ├─► E2E smoke         (must pass on Chrome — slow, ~3 min)
   └─► Bias eval         (must hold variance ≤2pt — fast, ~1 min)
```

If any gate fails → PR is blocked from merge. No exceptions.

---

## 2. Phase 0 — Foundation (Months 0-2)

**Goal:** Build the plumbing so subsequent phases ship fast and safe. NO user-facing features in this phase. Just infrastructure.

### Sprint 0.1 (Week 1-2) — LLM Gateway

| Ticket | Description | Acceptance criteria | Owner | Est |
|---|---|---|---|---|
| 0.1.1 | Create `lib/ai/gateway.ts` skeleton | Module exports `complete()`, `embed()`, `stream()` functions with provider-agnostic types | Eng | 1d |
| 0.1.2 | Wrap OpenAI as default provider | `complete({task, inputs, options})` routes to OpenAI based on task config | Eng | 1d |
| 0.1.3 | Wrap Anthropic as fallback | Same interface, swap-in via `provider: 'anthropic'` option | Eng | 1d |
| 0.1.4 | Cost tracker — per call, per feature, per tenant | Persists to new `ai_call_log` table with tokens, cost, latency, model | Eng | 1.5d |
| 0.1.5 | Cache layer (Upstash Redis) | TTL-configurable, key = hash(prompt + inputs), default 24h, hit-rate metric | Eng | 1d |
| 0.1.6 | Rate limiter per tenant (per employer/candidate) | Returns 429 + helpful message when exceeded | Eng | 1d |
| 0.1.7 | Fallback chain | If primary fails N times, route to fallback. Auto-recovery after circuit-breaker cooldown | Eng | 1.5d |
| 0.1.8 | Cached-input pricing optimization | Auto-detect repeat prompt prefixes, use OpenAI prompt caching API | Eng | 1d |
| 0.1.9 | Migrate `lib/candidate-scorer.ts` to use gateway | Existing tests pass; cost dashboard shows entries | Eng | 0.5d |
| 0.1.10 | Documentation: `docs/ai-gateway.md` with API reference | Other engineers can use the gateway without reading source | Eng | 0.5d |

**Sprint 0.1 done when:** Existing scoring uses gateway, dashboard shows real cost data, killing OpenAI in dev fails over to Anthropic without user-visible error.

#### 0.1.A — Task → Model Routing Table (config to seed in Sprint 0.1.2)

The gateway routes by `task` string, NOT by hard-coded model. Engineers building Sprint 0.1.2 should seed `lib/ai/gateway/task-config.ts` (or equivalent) with this exact mapping. Single source of truth for "which model handles which workload" — change the table, not the call sites. Mirrors [ai-architecture.md Section 7.1](./ai-architecture.md#71-model-selection-per-feature).

| Task ID | Primary model | Fallback model | Output mode | Why |
|---|---|---|---|---|
| `candidate_scoring` | `gpt-5-mini` | `claude-sonnet-4-6` | JSON | Drives employer-visible decisions; needs reasoning quality |
| `resume_parsing` | `gpt-5-mini` | `claude-sonnet-4-6` | JSON | Structured extraction |
| `spam_fraud_detection` | `gpt-5-nano` | `gpt-5-mini` | JSON | High volume, binary classification, cost-sensitive |
| `bias_audit` | `gpt-5-mini` | `claude-sonnet-4-6` | JSON | Pattern detection across phrases |
| `talent_search_rerank` | `gpt-5-mini` | `claude-sonnet-4-6` | JSON | Cost matters per search; rank quality matters more than scoring |
| `application_coach` | `gpt-5-mini` | `claude-sonnet-4-6` | JSON | Pre-submit feedback, structured suggestions |
| `support_bot` | `gpt-5-mini` | `claude-sonnet-4-6` | text | Conversational, must follow instructions reliably |
| `cover_letter` | `gpt-5.4` | `claude-opus-4-7` | text | Creative writing, paid-tier, quality directly perceived |
| `jd_generator` | `gpt-5.4` | `claude-opus-4-7` | text | Creative writing, employer-visible quality |
| `outreach_composer` | `gpt-5.4` | `claude-opus-4-7` | text | Personalization is the value prop |
| `seo_content` | `gpt-5.4` | `claude-opus-4-7` | text | Long-form, infrequent. `gpt-5.5` reserved for hero pages — opt-in via `priority: 'premium'` |
| `career_path_analysis` | `gpt-5.4` | `claude-opus-4-7` | JSON | Multi-hop reasoning over candidate trajectory |
| `embeddings_generic` | `text-embedding-3-small` | (no fallback — rare) | vector | All embedding workloads (jobs, candidates, queries) |

**Routing API contract** — call sites pass the task, not the model:

```typescript
// Correct — call site picks the task, gateway picks the model
await complete({ task: 'candidate_scoring', messages: [...], cacheKey: [...] });

// Wrong — never hardcode model at call site (ESLint rule will catch this in Sprint 0.4.7)
await complete({ task: 'candidate_scoring', model: 'gpt-5-mini', messages: [...] });
```

**Override paths (rare, but explicit):**
- `priority: 'premium'` → routes to higher-tier model (e.g., `seo_content` → `gpt-5.5`). Used for hero content only.
- `provider: 'anthropic'` → forces fallback provider. Used in chaos tests.
- `model: '<exact>'` → escape hatch for one-off A/B experiments. Requires explicit `// eslint-disable-next-line ai/no-direct-model` comment.

**Migration path when models update (e.g., gpt-5.5 → gpt-5.6):**
1. Update one row in `task-config.ts`
2. Eval suite runs in CI on the affected task(s) — must hold baseline
3. Bias eval runs — variance still ≤2pt
4. Cost dashboard alert if unit cost drifts >20% post-deploy
5. Single-line change ships, no call sites touched

### Sprint 0.2 (Week 3-4) — Prompt Registry + Eval Harness

| Ticket | Description | Acceptance criteria | Est |
|---|---|---|---|
| 0.2.1 | Create `lib/ai/prompts/` directory with prompt-as-data structure | `{ id, version, system, user_template, model, output_schema }` | 1d |
| 0.2.2 | Move `SCORING_PROMPT` from candidate-scorer.ts into registry | Versioned `candidate_scoring/v1.json`; old hardcoded prompt removed | 0.5d |
| 0.2.3 | Eval harness scaffolding | `npm run eval candidate_scoring` runs golden set, prints pass/fail | 1.5d |
| 0.2.4 | Define candidate-scoring golden set | 100 hand-rated (job, candidate, expected_score_range, must_mention, must_not_mention) tuples in `tests/ai/golden/candidate-scoring.json` | 2d |
| 0.2.5 | Eval CI gate — fail PR if eval regresses >5% | GitHub Actions runs eval on every PR touching `lib/ai/**` | 1d |
| 0.2.6 | Bias eval pair set (50 pairs) | Synthetic profiles identical except demographics; max 2pt score variance | 1.5d |
| 0.2.7 | Drift detection cron — daily snapshot of eval scores | Alert in Slack/Discord when 7-day moving avg drops >10% | 1d |
| 0.2.8 | Prompt diff tooling | `npm run prompt:diff <id>` shows token-level diff, eval delta | 0.5d |

**Sprint 0.2 done when:** PR that worsens scoring eval is auto-blocked. Drift detection has been running for 7 days and produces a clean baseline.

### Sprint 0.3 (Week 5-6) — Vector DB + Embedding Pipeline

| Ticket | Description | Acceptance criteria | Est |
|---|---|---|---|
| 0.3.1 | Migration: enable `pgvector` extension on Supabase | `CREATE EXTENSION vector;` in new migration; type-check passes | 0.5d |
| 0.3.2 | Add `job_embeddings` table | `(job_id, embedding vector(1536), updated_at)` with IVFFlat index | 0.5d |
| 0.3.3 | Add `candidate_embeddings` table | Same shape, keyed on `user_profile.id` | 0.5d |
| 0.3.4 | Embedding worker (Inngest) — `embedding.refresh.job` | Triggered by `job.created`/`job.updated` events; uses `text-embedding-3-small`; idempotent | 1d |
| 0.3.5 | Embedding worker — `embedding.refresh.candidate` | Same pattern, triggered on profile update | 1d |
| 0.3.6 | One-shot backfill script | `node scripts/backfill-embeddings.mjs` embeds all existing jobs+candidates | 1d |
| 0.3.7 | Vector search helper `lib/ai/vector-search.ts` | `searchSimilarJobs(embedding, filters, k)` returns ranked results | 1d |
| 0.3.8 | Hybrid search (vector + filters + text rank) | Reciprocal rank fusion; tested on golden query set | 1.5d |
| 0.3.9 | pgvector index tuning | Benchmark IVFFlat vs HNSW at current scale; pick winner | 1d |

**Sprint 0.3 done when:** All 18 prod jobs and all candidate profiles have embeddings. Vector search returns sensible results on a hand-curated query set.

### Sprint 0.4 (Week 7-8) — Observability + Feature Flags + Runbooks

| Ticket | Description | Acceptance criteria | Est |
|---|---|---|---|
| 0.4.1 | Observability dashboard (Vercel Analytics + Sentry custom metrics) | Per-feature: requests/min, P95 latency, error rate, cost/day | 1.5d |
| 0.4.2 | Cost alerting | Slack/Discord alert if any feature exceeds 200% of projected daily spend | 0.5d |
| 0.4.3 | Feature flag system (config.ts based for now) | `isFeatureEnabled('ai.candidate.cover_letter', user)` with per-user, per-tenant overrides | 1d |
| 0.4.4 | Kill-switch UI in admin panel | Admin can flip any AI feature off in <30 sec without deploy | 1d |
| 0.4.5 | Runbook template + first runbook (candidate scoring) | `docs/runbooks/ai-candidate-scoring.md` covers: symptoms, diagnostics, mitigation, rollback | 1d |
| 0.4.6 | Chaos test: kill OpenAI in staging | Verify gateway falls back to Anthropic; UI shows graceful degradation | 0.5d |
| 0.4.7 | PII scanner (CI step) | Greps prompts for SSN, DEA, NPI, race/gender field references; fails build | 1d |
| 0.4.8 | Phase 0 retrospective doc | What went well, what to improve, baseline metrics for phase 1 to compare against | 0.5d |

**Sprint 0.4 done when:** Dashboard exists, cost alerts trigger correctly, first runbook is reviewed by another engineer, chaos test passes.

### Sprint 0.5 (Week 9) — Test Infrastructure (the foundation for every later test)

This sprint builds reusable test helpers + CI gates so every Phase 1+ feature can ship with the full test pyramid in days, not weeks.

| Ticket | Description | Acceptance criteria | Est |
|---|---|---|---|
| 0.5.1 | `tests/helpers/ai.ts` — `mockLLMResponse()` helper | Mocks gateway calls in integration tests with deterministic responses; supports streaming + non-streaming | 1d |
| 0.5.2 | `tests/helpers/db.ts` — `seedTestJob()`, `seedTestCandidate()`, `seedTestApplication()` | Realistic fixtures spanning the full schema; idempotent | 1d |
| 0.5.3 | `tests/helpers/pii.ts` — `assertNoPIIInPrompt()` | Scans rendered prompts for SSN, DEA, NPI, race/gender field names; throws on detection | 0.5d |
| 0.5.4 | `tests/e2e/helpers/auth.ts` — `playwrightAuth()` | Programmatic sign-in for Playwright tests, supports candidate/employer/admin roles | 1d |
| 0.5.5 | Vitest CI step in GitHub Actions | Runs unit + integration on every PR; blocks merge on failure | 0.5d |
| 0.5.6 | Playwright E2E CI step | Runs E2E smoke on Chrome on every PR; blocks merge on failure; uploads traces on failure | 1d |
| 0.5.7 | Eval CI step (uses harness from 0.2.5) | Runs full eval suite; comments delta on PR; blocks merge if regression >5% | 0.5d |
| 0.5.8 | PII scanner CI step | Greps prompt files for forbidden patterns; blocks merge | 0.5d |
| 0.5.9 | Bias eval CI step (uses pair set from 0.2.6) | Runs bias eval; blocks if variance >2pt across demographic pairs | 0.5d |
| 0.5.10 | Test coverage report (Vitest + Codecov or similar) | Posts coverage delta on PR; visible in dashboard | 0.5d |
| 0.5.11 | Document the test patterns in `docs/ai-testing-guide.md` | Cookbook for engineers: "to add a new AI feature, copy this template" | 1d |

**Sprint 0.5 done when:** A new engineer can clone the repo, copy a feature template, and have unit + integration + E2E + eval tests scaffolded in <1 hour. CI gates are all green.

### Phase 0 exit criteria (gate to Phase 1)

- [ ] LLM Gateway in use by all AI code paths (zero direct `openai` imports outside the gateway)
- [ ] Eval harness runs in CI and blocks regressions
- [ ] pgvector live, all current jobs+candidates embedded
- [ ] Observability dashboard shows real cost data for 7+ days
- [ ] Feature flag system live, kill-switch tested
- [ ] All Phase 0 runbooks written and reviewed
- [ ] Cost dashboard shows actual usage <$5/mo (matches projection)
- [ ] **Test infrastructure complete**: unit (Vitest), integration (Vitest + mocks), E2E (Playwright), eval (custom harness), PII scanner, bias eval — all wired into CI gates
- [ ] **Test helpers documented** in `docs/ai-testing-guide.md` so adding tests for new features is templated work
- [ ] Phase 0 retro shipped, Phase 1 scoped

---

## 3. Phase 1 — Core Matching (Months 2-4)

**Goal:** Make matching qualitatively better. Replace keyword-based job search with vector search. Generate personalized recommendations. Hybrid rerank for relevance.

> **Testing note for all Phase 1+ sprints:** Every ticket's estimate INCLUDES the time to write its required unit + integration + E2E + eval tests (per Section 1.4). Sprint 1.1 below shows test requirements per ticket as the canonical example; the same expectations apply to every subsequent sprint even when not spelled out per-line. The Definition of Done (Section 9) is enforced on every PR.

### Sprint 1.1 — Smart Job Matching (vector + filter hybrid)

Each ticket includes its required tests. Test estimates are NOT optional — they're shipped in the same PR as the feature code.

| Ticket | Description | Acceptance (incl. tests) | Est |
|---|---|---|---|
| 1.1.1 | API: `/api/jobs/search/semantic` accepts query string + filters | Returns top-N jobs ranked by hybrid score. **Unit:** query embedding + filter merging logic. **Integration:** API → mocked vector search → DB → response, plus error paths (LLM timeout, malformed query). | 1.5d |
| 1.1.2 | Frontend: search box on `/jobs` triggers semantic search behind flag | Flag off = current keyword search; flag on = hybrid. **E2E:** Playwright test for both flag states; user types query, sees results, clicks job. | 1.5d |
| 1.1.3 | Display "X% match" badge on each job card | Computed from cosine similarity, presented as percentile. **Unit:** percentile calculation against fixture set. | 1d |
| 1.1.4 | Eval set: 30 query→relevant-jobs golden tuples | Manual curation from prod data. Stored in `tests/ai/golden/job-search.json`. | 1d |
| 1.1.5 | Eval gate: NDCG@10 must beat keyword search by 15%+ | CI step runs on every PR; blocks merge on regression. | 0.5d |
| 1.1.6 | A/B test infrastructure (10% rollout) | Track CTR + apply rate per arm. **Integration:** assignment is sticky per user across sessions. | 1d |
| 1.1.7 | Runbook: AI search fails → automatic fallback to keyword | `docs/runbooks/ai-job-search.md`. **E2E:** chaos test — kill LLM mid-request, verify keyword fallback engages. | 1d |

### Sprint 1.2 — Personalized Job Recommendations

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 1.2.1 | Daily cron: `recommendations.generate` for active candidates | Top-10 jobs per candidate, persisted to `recommendations` table | 1d |
| 1.2.2 | Frontend: "For you" section on candidate dashboard | Behind flag, shows latest recommendations | 1d |
| 1.2.3 | Email digest variant: "5 new jobs match your profile" | Triggered weekly, off by default opt-in | 1d |
| 1.2.4 | Eval: human-rated 50 candidate-recommendation tuples | Hit rate on "would apply" >40% | 1.5d |
| 1.2.5 | Recommendation diversity check | Top-10 must include ≥3 distinct employers (no clumping) | 0.5d |
| 1.2.6 | Click feedback loop | Track which recs got clicked; use as future training signal | 1d |

### Sprint 1.3 — Hybrid Search Rerank for Talent Pool

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 1.3.1 | API: `/api/employer/talent/search` (vector + filter + rerank) | Returns ranked candidates with "why this match" explanation | 1.5d |
| 1.3.2 | Frontend: talent search UI in employer dashboard | Search box + filters + result list with explanations | 2d |
| 1.3.3 | LLM rerank step using gpt-5-mini | Top-50 vector results → top-10 reranked with reasoning | 1d |
| 1.3.4 | Eval: 30 employer-query → expected-candidates tuples | Manual curation; rerank must beat pure vector by 20% | 1d |
| 1.3.5 | Cost guard: max 10 reranks/employer/day | Rate limit returns "upgrade for unlimited" CTA | 0.5d |

### Phase 1 exit criteria (gate to Phase 2)

- [ ] Semantic job search live for 100% of users (after A/B win)
- [ ] Recommendations email opt-in available
- [ ] Talent search live for paid employers
- [ ] All Phase 1 features have eval suites with green baselines
- [ ] No P0/P1 AI bugs in 30-day window
- [ ] Phase 1 cost <$15/mo at current scale

---

## 4. Phase 2 — Candidate Copilot (Months 4-6)

**Goal:** Help candidates apply better. Cover letter assistant, application coach, resume parser → profile.

### Sprint 2.1 — Resume Parser → Profile Auto-fill

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 2.1.1 | PDF/DOCX → text extraction (existing `pdf-parse`, `mammoth`) | Stable extraction across 50 sample resumes | 1d |
| 2.1.2 | LLM extraction: text → structured ProfileFields JSON | 90%+ field accuracy on golden 30-resume set | 2d |
| 2.1.3 | UI: candidate uploads resume → preview parsed fields → edit → save | Confirmation step before persisting | 2d |
| 2.1.4 | Validation: certifications match known PMHNP cert list | Reject obviously wrong (e.g. "MCSE") | 1d |
| 2.1.5 | Eval: 30 resumes hand-labeled with expected fields | Field-level F1 ≥0.85 | 1.5d |
| 2.1.6 | Update existing `resumeParseStatus` field flow | Async job updates field; UI polls | 0.5d |

### Sprint 2.2 — Application Coach (pre-submit feedback)

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 2.2.1 | API: `/api/applications/preview-feedback` accepts draft application + jobId | Returns `{strengths: [], gaps: [], suggestions: []}` | 1.5d |
| 2.2.2 | UI: "Check my fit" button on apply form | Modal shows feedback; user can edit before submit | 2d |
| 2.2.3 | Cache per (candidate, job) since profile-driven | Saves cost on repeat clicks | 0.5d |
| 2.2.4 | Eval: 30 application-coach golden cases | Feedback must mention top-3 expected gaps in ≥80% of cases | 1.5d |
| 2.2.5 | Track: did candidate edit + resubmit after feedback? | Conversion metric for the feature | 0.5d |

### Sprint 2.3 — Cover Letter Assistant

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 2.3.1 | API: `/api/applications/cover-letter` generates draft from job + profile | Returns markdown text, max 500 words | 1d |
| 2.3.2 | UI: "Generate cover letter" button in apply form | Inserts into textarea; user can edit | 1.5d |
| 2.3.3 | Style/tone presets: "Professional", "Warm", "Direct" | User picks; passes to prompt | 0.5d |
| 2.3.4 | Eval: 30 cover-letter golden cases | Manual rating: tone match, factual accuracy, length | 1.5d |
| 2.3.5 | Anti-spam guard: reject identical letters across multiple jobs | Detect via hash, flag for review | 1d |
| 2.3.6 | Paid-tier gate (optional): premium candidates only | Per-account flag; free tier sees CTA | 0.5d |

### Phase 2 exit criteria

- [ ] Resume parser auto-fills 80%+ of profile fields correctly
- [ ] Application coach used by ≥30% of applicants
- [ ] Cover letter assistant generates ≥1k drafts/mo
- [ ] All features behind their own flag, killable independently
- [ ] No bias regressions on weekly drift check
- [ ] Phase 2 cost <$30/mo at current scale

---

## 5. Phase 3 — Employer Power Tools (Months 6-9)

**Goal:** Help employers screen + reach faster. JD generator, outreach composer, candidate comparison, bias auditor, interview question generator.

### Sprint 3.1 — JD Generator + Bias Auditor

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 3.1.1 | API: `/api/employer/jd-draft` from 3-bullet brief | Returns full JD: title, description, requirements, benefits | 1.5d |
| 3.1.2 | UI: "Generate JD" wizard on post-job page | 3 inputs → preview → edit → use | 2d |
| 3.1.3 | Bias auditor middleware on JD submit | Flags exclusionary words, gendered language | 1.5d |
| 3.1.4 | UI: inline highlights for biased phrases with suggested rewrites | Click suggestion to apply | 2d |
| 3.1.5 | Eval: 30 brief→JD golden cases | Output JD must match expected structure + tone | 1.5d |
| 3.1.6 | Bias eval: 50 known biased phrases | All caught with suggestions | 1d |

### Sprint 3.2 — Candidate Comparison

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 3.2.1 | API: `/api/employer/candidates/compare` accepts up to 3 candidate IDs + job | Returns side-by-side AI summary of strengths/weaknesses | 1.5d |
| 3.2.2 | UI: select 2-3 candidates → "Compare" → side-by-side view | Renders matrix with AI-written cell content | 2d |
| 3.2.3 | Eval: 20 comparison golden cases | Human-rated quality ≥4/5 | 1.5d |

### Sprint 3.3 — Outreach Message Composer (InMail drafting)

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 3.3.1 | API: `/api/employer/outreach/draft` accepts candidate + job | Returns personalized message draft, ≤300 words | 1.5d |
| 3.3.2 | Pre-compute drafts on candidate profile view (background) | Inngest worker fires; UI shows draft instantly | 1d |
| 3.3.3 | UI: "Suggested message" prefilled in compose modal | User can edit before send | 1d |
| 3.3.4 | Anti-spam: reject identical messages to >5 candidates/day | Flag in admin queue | 1d |
| 3.3.5 | Eval: 30 outreach golden cases | Personalization accuracy ≥85% (mentions specific candidate detail) | 1.5d |

### Sprint 3.4 — Interview Question Generator + Pipeline Insights

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 3.4.1 | API: `/api/employer/interview-prep` for job + candidate | 10 questions: 4 technical, 3 behavioral, 3 candidate-specific | 1.5d |
| 3.4.2 | UI: "Prep interview" button on candidate profile | Generates pack, downloadable as PDF | 1.5d |
| 3.4.3 | Pipeline insights: "Job will fill in N days" prediction | Based on historical similar jobs (simple regression for now, ML later) | 1d |
| 3.4.4 | UI: insights card on each job in dashboard | Shows ETA + confidence | 1d |

### Phase 3 exit criteria

- [ ] JD generator drafts ≥50% of new posts
- [ ] Bias auditor catches all known-biased samples
- [ ] Outreach composer drafts ≥1 message per active employer per week
- [ ] Interview prep used by ≥10% of employers viewing candidates
- [ ] Phase 3 cost <$50/mo at current scale

---

## 6. Phase 4 — Platform Intelligence (Months 9-12)

**Goal:** Quality, fraud, growth automation. Spam detection, content moderation, support bot, SEO content, pricing intelligence.

### Sprint 4.1 — Spam / Fraud Detection

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 4.1.1 | Spam job classifier (gpt-5-nano) | Score 0-100 on every new job; flag >70 | 1.5d |
| 4.1.2 | Fake applicant classifier | Bot signals + DEA/NPI validation + identical-cover-letter detection | 2d |
| 4.1.3 | Admin moderation queue UI | List flagged items with AI reasoning + action buttons | 2d |
| 4.1.4 | Auto-hide flagged jobs pending review | Don't show in search until admin clears | 1d |
| 4.1.5 | Eval: 50 known-spam, 50 known-legit jobs | Precision ≥90%, recall ≥80% | 1.5d |

### Sprint 4.2 — SEO Content Generator (admin tool, human-in-loop)

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 4.2.1 | API: generate city/state/specialty page draft | Markdown output, structured per template | 2d |
| 4.2.2 | Admin UI: pick city/state → preview → edit → publish | Required human review before published | 2d |
| 4.2.3 | Bulk-generate 50 priority pages, queue for review | Async batch | 1d |
| 4.2.4 | Eval: 20 generated pages reviewed by SEO/content lead | Quality bar: publish-ready with <30 min editing | 1d |

### Sprint 4.3 — Customer Support Bot

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 4.3.1 | RAG over `/faq`, `/terms`, `/pricing`, runbooks | Embed all docs, retrieve top-5 chunks per query | 1.5d |
| 4.3.2 | Chat UI on `/contact` page | Behind flag; supports text input, threaded reply | 2d |
| 4.3.3 | Escalation logic: confidence <0.7 → "let me get a human" | Routes to support@ with conversation context | 1d |
| 4.3.4 | Eval: 50 known-support questions | Bot must answer correctly OR escalate appropriately on 90%+ | 1.5d |

### Sprint 4.4 — Pricing Intelligence (analytical, not user-facing yet)

| Ticket | Description | Acceptance | Est |
|---|---|---|---|
| 4.4.1 | Internal dashboard: per-niche willingness-to-pay analysis | Uses search + view + checkout data | 2d |
| 4.4.2 | Recommendation engine: suggest price changes per state/specialty | Output: ranked list of "raise these / lower these" | 1.5d |
| 4.4.3 | A/B test framework for price changes | Per-domain pricing variance | 2d |

### Phase 4 exit criteria

- [ ] Spam catch rate ≥90% (audited weekly)
- [ ] Support bot handles ≥40% of inbound questions without escalation
- [ ] 50+ AI-drafted SEO pages live (after human review)
- [ ] Pricing dashboard producing weekly recommendations
- [ ] No discrimination complaints traceable to AI decisions

---

## 7. Cross-Cutting Concerns

### 7.1 Observability stack (built once in Phase 0, used across all phases)

| Layer | Tool | What it tracks |
|---|---|---|
| Cost | Custom Postgres `ai_call_log` + dashboard | tokens, $/call, $/day, $/feature |
| Latency | OpenTelemetry → Vercel Analytics | P50/P95/P99 per endpoint |
| Errors | Sentry | LLM call failures, schema validation failures, gateway errors |
| Quality | Custom eval harness + drift cron | Weekly eval scores, drift alerts |
| Bias | Bias eval pair runner | Score variance across demographic pairs |
| User satisfaction | Inline thumbs up/down on AI outputs | Per-feature acceptance rate |

### 7.2 Eval-driven development workflow

```
Engineer wants to change a prompt
         │
         ▼
1. Add or update eval cases for the change
         │
         ▼
2. Run eval locally: `npm run eval <feature>`
         │
         ▼
3. Commit prompt change + eval cases together
         │
         ▼
4. PR triggers CI: runs full eval suite
         │
         ▼
5. CI fails if eval regresses >5% on baseline
         │
         ▼
6. Merge → deploy → drift cron monitors live
```

### 7.3 Rollback procedure (per feature)

```
Production AI feature is misbehaving
         │
         ▼
1. Admin opens kill-switch UI
         │
         ▼
2. Toggle feature flag OFF
         │
         ▼
3. Within 30 sec, all calls bypass the AI feature
         │ (clients fallback to non-AI path or hide UI element)
         ▼
4. Engineer investigates without time pressure
         │
         ▼
5. Fix prompt / model / code
         │
         ▼
6. Re-run eval suite
         │
         ▼
7. Deploy fix, gradually re-enable (10% → 50% → 100%)
```

### 7.4 PII handling rules (enforced everywhere)

| Field | Allowed in prompt? | Mitigation |
|---|---|---|
| Candidate email | NO | Strip before sending |
| DEA number | NO | Strip before sending; use boolean "has DEA" |
| NPI number | NO | Same |
| Race / ethnicity | NO | Filter at SELECT time, never reach prompt |
| Gender | NO | Same |
| Age / DOB | NO | Same |
| Veteran status | NO | Same |
| Disability status | NO | Same |
| Job title, company, dates | YES | Public-ish info, OK to send |
| Cover letter content | YES | But scan for embedded PII like phone numbers |

CI step: `npm run lint:pii-prompts` greps prompt construction for forbidden field names. Fails build.

### 7.5 Documentation requirements (per feature)

Before any feature ships:

- [ ] Code-level docstrings on every exported function in `lib/ai/<feature>/`
- [ ] `docs/features/<feature>.md` describing what it does, who can use it, how to invoke it
- [ ] `docs/runbooks/ai-<feature>.md` — what to do when it breaks
- [ ] Update `docs/ai-architecture.md` if architecture changed
- [ ] Update `docs/ai-implementation-plan.md` to mark sprint as done

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Eval baseline drifts silently | Med | High | Daily drift cron + Slack alert at >10% drop |
| LLM provider outage | Med | High | Multi-provider gateway with fallback + circuit breaker |
| Cost runaway from a bug | Low | High | Per-tenant rate limits + 200% daily-spend alerts |
| PII leak in prompt | Low | Critical | CI scanner + pre-commit hook + manual review on AI changes |
| Bias regression after model update | Med | Critical | Bias eval set runs in CI; model upgrades blocked if regression |
| Hallucinated facts presented as truth | Med | High | Always show "AI-generated, please verify" disclaimers; never persist as ground truth |
| Customer churn over rejected-by-AI applications | Low | High | AI never auto-rejects; only scores. Knockout = explicit employer rule. |
| Prompt injection by malicious users | Med | Med | Sanitize all user inputs in prompts; sandbox known-injection patterns |
| Vendor lock-in to OpenAI | High | Med | Multi-provider gateway from day 1; quarterly portability test |
| Discrimination lawsuit | Low | Critical | Demographic fields filtered at SELECT; bias eval baseline; legal review of AI flows |

---

## 9. Definition of Done — Master Checklist

A feature is NOT done until ALL of these are true:

### Code
- [ ] TypeScript strict, no `any`, lint clean
- [ ] All AI calls go through `lib/ai/gateway.ts`
- [ ] Prompts live in `lib/ai/prompts/<id>/v<n>.json`, not inline
- [ ] User inputs sanitized before reaching prompt
- [ ] Output validated against schema (JSON mode + Zod)

### Tests (full pyramid — required in same PR as feature code)
- [ ] **Unit tests** — ≥80% line coverage on `lib/ai/<feature>/**`
   - [ ] Prompt construction with multiple input shapes
   - [ ] Output schema validation (valid + malformed)
   - [ ] Score/output clamping
   - [ ] PII sanitizer
   - [ ] Cache key derivation
- [ ] **Integration tests** — happy paths + 3 error paths
   - [ ] API → mocked LLM → DB persistence
   - [ ] LLM timeout falls back to secondary provider
   - [ ] LLM returns malformed JSON → graceful error
   - [ ] Rate limit returns 429
   - [ ] Feature flag OFF → AI path skipped
   - [ ] Cost tracking row written
- [ ] **E2E tests** — at least 1 happy-path Playwright scenario
   - [ ] User triggers feature → loading state → result renders
   - [ ] Error path: LLM unavailable → friendly UI, no 500
- [ ] **Eval tests** — quality of LLM output
   - [ ] Golden set of ≥30 cases in `tests/ai/golden/<feature>.json`
   - [ ] Bias eval cases if feature affects ranking/scoring
   - [ ] CI runs eval on every PR touching the feature
   - [ ] Baseline metrics established (paste into PR description)
- [ ] **Test helpers used** — reuse `mockLLMResponse()`, `seedTestJob()`, etc. from `tests/helpers/`

### Observability
- [ ] Per-call cost tracked in `ai_call_log`
- [ ] Dashboard tile exists for the feature
- [ ] Alerting configured (cost spike, error rate, latency)
- [ ] User feedback signal collected (thumbs up/down)

### Operational
- [ ] Behind a feature flag, default off
- [ ] Kill-switch tested in staging
- [ ] Runbook in `docs/runbooks/ai-<feature>.md`
- [ ] Fallback behavior defined and tested

### Compliance
- [ ] PII scanner passes
- [ ] No discriminatory fields in prompts
- [ ] AuditLog entries for any customer-affecting decisions
- [ ] User can opt out of feature in settings

### Communication
- [ ] Feature documented in `docs/features/`
- [ ] Architecture doc updated if architecture changed
- [ ] Implementation plan marks sprint as done
- [ ] Code review approved by at least one other engineer (or self-review checklist applied for solo work)

---

## 10. Sequencing Constraints (Things You CANNOT Skip)

| You can't ship... | Until you've shipped... | Why |
|---|---|---|
| Any Phase 1+ feature | Phase 0 LLM Gateway | Direct API calls bypass cost tracking, fallback, caching |
| Any feature with persisted output | Eval harness | No way to detect quality drift |
| Any user-facing AI feature | Feature flag system | No way to kill it if broken |
| Any scoring/ranking feature | Bias eval pair set | Discrimination risk |
| Any Phase 2 candidate feature | Phase 1 vector search | Recommendations depend on embeddings |
| Any Phase 3 employer feature | Phase 1 talent search | Comparison + outreach reuse vector infra |
| Any Phase 4 platform feature | All earlier phases | Spam/quality classifiers depend on AI infra being mature |

---

## 11. Phase-Gate Review Process

At the end of each phase:

1. **Quantitative review** — All exit criteria met? Show data.
2. **Eval baseline review** — All features still passing baseline?
3. **Cost review** — Actual spend vs projected. Investigate gaps >20%.
4. **Incident review** — Any P0/P1 in the phase? Postmortems written?
5. **User feedback review** — Thumbs up/down ratios per feature.
6. **Retro** — What worked, what to change in next phase.
7. **Next-phase scoping** — Concrete tickets in backlog, owners assigned.

Phase advances only if all 7 are satisfied.

---

## 12. What This Plan Doesn't Cover (Deliberate Out-of-Scope)

These are real concerns but out of scope for this plan:

- **Hiring decision automation** — AI never makes a hiring decision. Period.
- **Auto-rejection** — Knockout rules only, never AI-based.
- **Voice/video AI** — Not on roadmap. Speech-to-text for interviews could be Phase 5+.
- **Recruiter/sourcing automation** — Different product line. Out of scope.
- **Multi-tenancy beyond domain-quota** — White-label / multi-account model is out of scope.
- **On-premise / self-hosted LLMs** — All AI calls are to managed providers. Compliance allows this.
- **Custom model fine-tuning** — No data volume to justify this yet. Revisit at 100k+ scorings/mo.

---

## 13. Quick-Start: This Week

If you want to start RIGHT NOW, here's the first 5 days:

**Day 1**
- Create `lib/ai/gateway.ts` skeleton (Ticket 0.1.1)
- Wrap OpenAI as default provider (Ticket 0.1.2)

**Day 2**
- Add cost tracker + Redis cache (Tickets 0.1.4, 0.1.5)
- Migrate `candidate-scorer.ts` to use gateway (Ticket 0.1.9)

**Day 3**
- Create `lib/ai/prompts/` directory + move SCORING_PROMPT (Tickets 0.2.1, 0.2.2)
- Eval harness scaffolding (Ticket 0.2.3)

**Day 4-5**
- Hand-curate 100 candidate-scoring golden cases (Ticket 0.2.4) — biggest single effort, but unlocks everything

End of week 1: gateway live, scoring on it, eval suite running. From here, every change is safer and more measurable.

---

## 14. Appendix — Tooling Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Eval framework | Custom (in-repo) | Existing tools (Anthropic Workbench, OpenAI Evals) lock you in. Custom is a few hundred LOC, total flexibility. |
| Vector DB | Supabase pgvector | Already have Postgres; no new infra; scales to 1M+ vectors |
| Cost tracking | Custom Postgres table + Vercel Analytics | Off-the-shelf options (Helicone, Langfuse) overkill for Phase 0 |
| Prompt storage | JSON files in repo | Versioned via git, no separate DB, easy diff |
| Feature flags | `lib/config.ts` + per-user override table | Fine until >20 flags, then revisit Statsig/LaunchDarkly |
| Observability | Sentry + custom dashboard | Sentry already in stack; custom dashboard for AI-specific KPIs |
| Background jobs | Inngest | Already in stack; native Next.js |

---

## Status Tracker

| Phase | Status | Started | Done | Owner |
|---|---|---|---|---|
| Phase 0 — Foundation | 🟡 In progress (Sprint 0.1 done) | 2026-05-02 | — | — |
| Phase 1 — Core Matching | 🔵 Not started | — | — | — |
| Phase 2 — Candidate Copilot | 🔵 Not started | — | — | — |
| Phase 3 — Employer Power Tools | 🔵 Not started | — | — | — |
| Phase 4 — Platform Intelligence | 🔵 Not started | — | — | — |

Update this table as phases progress. Every phase-end retro updates the table.

### Sprint-level status

| Sprint | Status | Notes |
|---|---|---|
| 0.1 — LLM Gateway | ✅ Done (2026-05-02) | Gateway live at `lib/ai/gateway.ts`. OpenAI primary + Anthropic fallback (via fetch, no SDK dependency). Cost tracking writes to `ai_call_log`. Redis cache + per-tenant rate limit + circuit breaker. `candidate-scorer.ts` and `resume-parser.ts` migrated. 28 unit tests, all passing. Docs at `docs/ai-gateway.md`. |
| 0.2 — Prompt registry + eval harness | 🔵 Not started | Prompts still inline in caller modules. Move to `lib/ai/prompts/<id>/v1.json` next. |
| 0.3 — Vector DB + embedding pipeline | 🔵 Not started | `gateway.embed()` exists but no consumer yet. Needs pgvector migration. |
| 0.4 — Observability + feature flags + runbooks | 🔵 Not started | `ai_call_log` populates from Sprint 0.1 — dashboards on top come later. |
| 0.5 — Test infrastructure | 🔵 Not started | First helpers will land here (`mockLLMResponse`, etc.). |
