# AI System Architecture — PMHNP Hiring

> Enterprise-grade design for AI-powered job matching, candidate intelligence,
> employer tooling, and platform automation. Living document — designed to be
> built in phases, not all at once.

## 1. Vision

**Be the smartest psychiatric-NP hiring marketplace.**

Where Indeed competes on volume and LinkedIn on network, we win on **fit
quality** — the right candidate matched to the right job in days, not weeks,
because every interaction is enriched by AI that actually understands
clinical workflows, licensing, and PMHNP career paths.

### North-star metrics
| Metric | Today | Year 1 target |
|---|---|---|
| Time from application to "qualified" decision | unmeasured | < 2 hours (auto-scored) |
| Candidate-to-interview conversion (employer reports) | unknown | 25%+ (vs ~5% on general boards) |
| Application abandon rate after start | unmeasured | < 30% |
| Avg cost per AI interaction | $0.0005 | < $0.01 |
| Days from posting → first qualified applicant | unknown | < 3 days |

---

## 2. Stakeholders & Their Real Jobs-To-Be-Done

### CANDIDATES (PMHNPs)
| JTBD | Today | With AI |
|---|---|---|
| "Find jobs that actually match my license + experience" | Filter by state + jobtype | Semantic match across full profile |
| "Tell me before I apply if I'm wasting my time" | Apply blind, hope for the best | Real-time fit score + missing-skills coaching |
| "Help me write a cover letter without spending an hour" | Copy-paste generic | Tailored draft in 10 sec |
| "Tell me if this offer is fair" | Google salary ranges | Personalized "this is 12% below your worth in this city" |
| "Auto-fill applications on Workday/Greenhouse" | Type the same fields 50× | Chrome extension fills everything |
| "What career moves should I make?" | Ask Reddit | Career-path AI based on similar PMHNPs' trajectories |

### EMPLOYERS (clinics, telehealth, hospitals)
| JTBD | Today | With AI |
|---|---|---|
| "Tell me which applications are worth my time" | Read all 50 cover letters | Auto-scored 0-100, top 3 surfaced |
| "Find candidates I never knew existed" | Browse paginated list | Vector search "find me PMHNPs who did fellowship in geriatric psych" |
| "Write a job posting that converts" | Stare at blank form | Generate from 3-bullet brief, A/B-tested phrasing |
| "Reach out without sounding like a copy-paste bot" | Manually compose every InMail | Personalized outreach drafts referencing candidate's specific work |
| "Predict if a candidate will accept" | Guess | Engagement model trained on past hires |
| "Prep interview questions specific to this role" | Use generic question banks | AI-generated based on job + candidate profile |
| "Fight bias in my JD" | Hope for the best | Auto-flag gendered/exclusionary language |

### PLATFORM (PMHNP Hiring team)
| JTBD | Today | With AI |
|---|---|---|
| "Catch fake job postings before customers see them" | Manual review of N=18 | Multi-signal classifier flags >$5k/wk salary, spam patterns |
| "Block fake/bot applicants" | None — see Anxiety Relief 1.5K views/4 apps anomaly | Application authenticity scorer |
| "Write SEO content at scale" | Manual blog writing | AI-drafted city/state/specialty pages |
| "Answer common support questions automatically" | All goes to support@ | First-line bot, escalate complex |
| "Detect when someone's about to churn" | Manual gut feel | Engagement signals → outreach trigger |
| "Recommend price changes" | Static $199 | Dynamic per niche, demand-driven |

---

## 3. Architecture (high level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                │
│  Candidate UI    │   Employer Dashboard   │   Admin Console   │ Mobile  │
│  Chrome Ext      │   Public job pages     │   Inngest workers │  PWA    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                          AI SERVICES LAYER                               │
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐ │
│  │ Candidate AI    │  │ Employer AI     │  │ Platform AI              │ │
│  │ ─────────────── │  │ ─────────────── │  │ ───────────────────────  │ │
│  │ • Job matcher   │  │ • Applicant     │  │ • Spam/fraud detection   │ │
│  │ • Cover letter  │  │   scorer (now)  │  │ • Content moderation     │ │
│  │ • Resume parser │  │ • Talent search │  │ • SEO content generator  │ │
│  │ • Salary advisor│  │ • JD generator  │  │ • Support chatbot        │ │
│  │ • Career coach  │  │ • Outreach      │  │ • Pricing intelligence   │ │
│  │ • Interview prep│  │   composer      │  │ • Email subject A/B      │ │
│  └─────────────────┘  │ • Bias auditor  │  └──────────────────────────┘ │
│                       │ • Interview qs  │                                │
│                       └─────────────────┘                                │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                       AI INFRASTRUCTURE LAYER                            │
│                                                                           │
│  ┌────────────────┐   ┌──────────────────┐   ┌────────────────────────┐ │
│  │ LLM Gateway    │   │ Vector Database  │   │ Background Workers     │ │
│  │ ────────────── │   │ ──────────────── │   │ ───────────────────────│ │
│  │ • Provider     │   │ • Job embeddings │   │ • Inngest (have it)    │ │
│  │   routing      │   │ • Candidate      │   │ • Scoring queue        │ │
│  │ • Caching      │   │   embeddings     │   │ • Embedding refresh    │ │
│  │ • Rate limit   │   │ • Search index   │   │ • Bulk re-score        │ │
│  │ • Cost track   │   │ • Cosine search  │   │ • Cron triggers        │ │
│  │ • Fallback     │   │ • pgvector on    │   │                        │ │
│  └────────────────┘   │   Supabase       │   └────────────────────────┘ │
│                       └──────────────────┘                                │
│                                                                           │
│  ┌────────────────┐   ┌──────────────────┐   ┌────────────────────────┐ │
│  │ Eval Framework │   │ Feature Flags    │   │ Observability          │ │
│  │ ────────────── │   │ ──────────────── │   │ ───────────────────────│ │
│  │ • Golden sets  │   │ • Per-tenant     │   │ • Token usage / cost   │ │
│  │ • Human-rated  │   │ • Per-feature    │   │ • Latency P50/P95/P99  │ │
│  │ • Drift alerts │   │ • Gradual rollout│   │ • Hallucination flags  │ │
│  │ • A/B tests    │   │ • Kill switches  │   │ • Sentry + custom logs │ │
│  └────────────────┘   └──────────────────┘   └────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                            DATA LAYER                                    │
│  Postgres (Prisma)  │  Supabase Storage (resumes)  │  Redis (cache)    │
│  + pgvector ext     │  Inngest event store          │  S3 (artifacts)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer Detail

### 4.1 LLM Gateway (`lib/ai/gateway.ts` — TODO)

Single entry point for all AI calls. Wraps multiple providers with one interface.

```typescript
// Conceptual API
const result = await ai.complete({
  task: 'candidate-scoring',     // Routes to right model + prompt
  inputs: { job, candidate },
  cacheKey: `score:${jobId}:${candidateId}`,
  budget: 'low',                  // 'low' | 'standard' | 'premium'
  fallback: 'gpt-4o-mini',
  trace: true,
});
```

Why this matters at scale:
- **Provider routing** — Cheap tasks (scoring) → gpt-4o-mini. Nuanced tasks (cover letter) → gpt-4o or Claude Sonnet 4.6. Heavy reasoning (career path analysis) → Claude Opus or o1.
- **Caching** — Many AI requests are repeatable (same job + same candidate = same score). Redis hit rate >40% target.
- **Cost tracking** — Per-tenant, per-feature, per-day. Bill back if needed.
- **Fallback** — If OpenAI goes down, route to Anthropic. Don't hard-fail user flows.
- **Rate limiting** — Per-employer caps so one company can't burn $10k/day.
- **Prompt registry** — Centralized prompt versioning, hot-swap without deploy.

### 4.2 Vector Database (Supabase + pgvector)

Add `pgvector` extension to existing Postgres. No new database needed.

| Table | Embeddings | Refresh trigger |
|---|---|---|
| `job_embeddings` | title + description + setting + population summarized | Job created/edited |
| `candidate_embeddings` | bio + specialties + work_history summarized | Profile updated |
| `search_query_embeddings` | recent search terms (for query expansion) | Background |
| `application_embeddings` | application narrative for similarity | Application created |

Use `text-embedding-3-small` (OpenAI, $0.00002/1k tokens) for embeddings. Cheap.

Indexes: `IVFFlat` for ANN search at this scale. Switch to `HNSW` past 100k vectors.

### 4.3 Background Workers (Inngest — already in stack)

| Workflow | Trigger | What it does |
|---|---|---|
| `candidate.score` | `application.created` | Score 0-100 (today's existing) |
| `embedding.refresh.candidate` | `profile.updated` | Re-embed candidate, update vector |
| `embedding.refresh.job` | `job.created`/`job.edited` | Re-embed job, update vector |
| `recommendations.daily` | cron 2am | Generate top-10 jobs per active candidate |
| `outreach.suggest` | `employer.viewed_candidate` | Pre-draft InMail in background |
| `quality.audit` | `job.created` | Spam/quality check on new job posts |
| `bulk.rescore` | manual | Re-score all open applications with new prompt |

### 4.4 Eval Framework (`lib/ai/evals/` — TODO)

How do we know if our AI is getting better or worse?

- **Golden sets** — 100 hand-rated (job, candidate, score) tuples. Run on every prompt change.
- **Drift detection** — Compare distribution of today's scores vs last week. Alert on big shifts.
- **Human review queue** — Random 1% sample sent to admin for thumbs-up/down. Feeds re-prompting.
- **A/B testing** — Two prompts, route 50/50, measure downstream metric (employer interview rate).

### 4.5 Feature Flags (use existing `lib/config.ts` or LaunchDarkly/Statsig)

Every AI feature ships behind a flag. Per-tenant rollout:
- `ai.candidate.cover_letter` — enabled for all
- `ai.employer.outreach_composer` — enabled for paid only
- `ai.platform.spam_detection` — enabled for admins only (until tuned)

---

## 5. Feature Catalog

### 5.1 CANDIDATE-FACING

#### Tier 1 (ship next quarter)
1. **Smart Job Matching** — replace today's keyword search with vector + filter hybrid. Show "82% match" badge.
2. **Application Coach** — pre-submit, "Your application is strong on X, weak on Y. Add Z to improve fit."
3. **Cover Letter Assistant** — one-click "Generate draft" using job + profile. User can edit.
4. **Resume Parser & Auto-Profile** — upload PDF/DOCX → extract structured data → pre-fill profile fields. (Already have `resumeParseStatus` field — just need to wire it.)

#### Tier 2 (quarter 2)
5. **Salary Intelligence** — "This $185k offer is 8% above market for IL telehealth PMHNP with 5y exp."
6. **Career Path Coach** — "PMHNPs like you who moved into telehealth saw 22% salary growth in 2 years."
7. **Job Recommendations Feed** — daily personalized list, email digest.
8. **Interview Prep Pack** — auto-generated likely Qs based on the specific job.

#### Tier 3 (quarter 3)
9. **Email Composer** — draft messages to employers ("Following up on my application…").
10. **Application Status Predictions** — "Based on similar roles, expect a response in 7-10 days."

### 5.2 EMPLOYER-FACING

#### Tier 1 (incremental on existing)
1. **AI Candidate Scoring** — already shipped. Improve prompt, add explainability, surface in more places.
2. **Talent Pool Search** — vector search over candidate base. "Find PMHNPs in CA with telehealth + adolescent experience."
3. **Job Description Generator** — wizard: 3 bullets in → polished JD out.
4. **Bias Auditor** — flag exclusionary phrases ("ninja", gendered language) before publish.

#### Tier 2
5. **Outreach Message Composer** — drafts personalized InMails referencing candidate's specific work.
6. **Candidate Comparison** — side-by-side AI summary of top 3 applications.
7. **Interview Question Generator** — questions specific to job + candidate.
8. **Pipeline Insights** — "Your job will likely fill in 12 days based on similar roles."

#### Tier 3
9. **Reject Letter Composer** — kind, specific rejections at scale.
10. **Salary Recommendations** — "Pay $185k to fill in <14 days based on market data."
11. **Pre-screening Bot** — automated chat with applicants for basic screening Qs.

### 5.3 PLATFORM/ADMIN

#### Tier 1
1. **Spam Job Detector** — multi-signal: salary anomaly, duplicate text, suspicious URLs, throwaway employer email.
2. **Fake Applicant Detector** — bot signal, identical cover letters across many jobs, DEA/NPI validation.
3. **Content Moderation** — flag inappropriate cover letters/profiles for admin review.

#### Tier 2
4. **SEO Content Generator** — auto-draft city/state/specialty pages. Human review before publish.
5. **Customer Support Chatbot** — first-line for FAQ-style questions, escalate hard cases to humans.
6. **Quality Score Engine** — score every job/profile 0-100 for completeness; rank in search by quality.

#### Tier 3
7. **Pricing Intelligence** — "Charge $249 for IL/CA postings — willingness-to-pay data shows you're under-priced."
8. **Email Subject Optimizer** — A/B test subject lines, pick winners.
9. **Churn Prediction** — flag customers about to drop off, trigger outreach.

---

## 6. Data Flow Examples

### Example A: Candidate applies to a job (scoring)

```
1. Candidate clicks "Apply" → /api/applications/apply-direct
2. Synchronously: create JobApplication row, return 200
3. Async: emit Inngest event `application.created`
4. Worker `candidate.score`:
   a. Fetch job + candidate + screening answers
   b. Check cache (jobId + candidateId hash)
   c. If miss: call LLM Gateway
      i.   Gateway routes to gpt-4o-mini
      ii.  Renders prompt from registry
      iii. Tracks tokens / cost / latency
      iv.  Returns score + reasons
   d. Persist aiMatchScore, aiMatchReasons, aiMissingItems
   e. Update candidate_embeddings (their profile + new application context)
5. Employer dashboard polls or websocket-pushes new application with score
```

### Example B: Employer searches "experienced telehealth PMHNP for OCD"

```
1. Employer types query in dashboard search
2. Frontend → /api/employer/talent/search
3. Server:
   a. Embed query → vector
   b. Hybrid search:
      - Vector cosine similarity against candidate_embeddings
      - Filters: state in license_states, years_exp >= N, profile_visible = true
      - Combine via reciprocal rank fusion
   c. Top 50 → LLM re-ranker (passes top 10 with full context to gpt-4o-mini for fine-grained ranking)
   d. Return ranked list with "why this candidate" explanations
4. Employer clicks profile → triggers outreach.suggest worker pre-drafts InMail
5. Employer sees "Suggested message" already populated
```

### Example C: New job posted (quality + embedding)

```
1. Employer submits job → /api/jobs/post-free or /api/create-checkout flow
2. Synchronously: persist Job row, return success
3. Async: emit `job.created`
4. Parallel workers fan out:
   - quality.audit → spam check, completeness check, suggest improvements
   - embedding.refresh.job → embed title+desc+setting → upsert into job_embeddings
   - recommendations.invalidate → mark recommendation cache stale for matching candidates
5. If quality fails → admin notification, job hidden from search until reviewed
6. If embedding succeeds → candidates with matching profiles get push notification
```

---

## 7. Tech Stack Decisions

| Concern | Choice | Why |
|---|---|---|
| LLM provider | OpenAI primary, Anthropic fallback | Already using OpenAI. Anthropic is best-in-class for nuanced reasoning (cover letters). Multi-provider = no single point of failure. |
| Embedding model | `text-embedding-3-small` | $0.00002/1k tokens, 1536 dims, plenty for this domain. |
| Vector DB | pgvector on Supabase | Already on Postgres. No new infra. Scales fine to ~1M vectors. |
| Background jobs | Inngest | Already in stack. Native Next.js, retries built in. |
| Cache | Upstash Redis | Already configured (rate limit). Reuse for AI cache. |
| Eval | Custom + Anthropic Eval Tools | Build minimum viable harness in-house. |
| Observability | Sentry + custom metrics in Postgres | Already on Sentry. Custom metrics for AI-specific KPIs. |
| Feature flags | Start with config.ts, move to LaunchDarkly/Statsig if >10 flags | YAGNI. |

---

## 8. Phased Rollout (12-month plan)

| Phase | Months | Goal | Ship list |
|---|---|---|---|
| **0 — Foundation** | 0-2 | Build the plumbing | LLM Gateway, prompt registry, eval harness, observability dashboards, pgvector setup |
| **1 — Core matching** | 2-4 | Make matching qualitatively better | Vector search, recommendations, hybrid search rerank |
| **2 — Candidate copilot** | 4-6 | Help candidates apply better | Cover letter assistant, application coach, resume parser → profile |
| **3 — Employer power tools** | 6-9 | Help employers screen + reach faster | Talent search UI, JD generator, outreach composer, candidate comparison, bias auditor |
| **4 — Platform intelligence** | 9-12 | Quality, fraud, growth | Spam detection, support bot, SEO content generator, pricing intelligence |

---

## 9. Cost Model (rough estimates)

Assume 1,000 active candidates + 100 active employers + 100 jobs/month + 5,000 applications/month.

| Workload | Volume/mo | Unit cost | Monthly cost |
|---|---|---|---|
| Candidate scoring | 5,000 | $0.0005 | **$2.50** |
| Cover letter generation | 1,500 (30% of apps) | $0.005 | **$7.50** |
| Talent search (LLM rerank) | 500 | $0.01 | **$5** |
| JD generation | 200 | $0.01 | **$2** |
| Outreach composer | 1,000 | $0.005 | **$5** |
| Embeddings (refresh) | 10k embeds | $0.00002 | **$0.20** |
| Spam audit | 100 jobs | $0.001 | **$0.10** |
| **Total LLM cost** | | | **~$22/month** |

Even at 100× scale (real enterprise), AI costs are <$2,500/month. Negligible vs Vercel/Supabase/Resend bills. **Build aggressively — cost is not the bottleneck. Quality is.**

---

## 10. Privacy & Compliance

### Hard rules
- ✅ **NO PHI** ever sent to LLM providers (we don't have any anyway, but enforce via prompt-construction tests)
- ✅ **DEA/NPI numbers** never exposed in LLM prompts (mask before sending)
- ✅ **Candidate consent** required to use their profile data for AI features (already have `sensitiveDataConsent` field)
- ✅ **Employer cannot see** raw AI prompts/responses for other employers' postings
- ✅ **OpenAI Zero Data Retention** mode for any prompts containing identifiable candidate data
- ✅ **Audit log** every AI decision that affects a customer-visible outcome (scoring, ranking, auto-rejection)

### Anti-discrimination
- AI scoring NEVER uses: race, ethnicity, gender, age, veteran status, disability, religion, national origin, marital status
- These fields exist in UserProfile (for EEO reporting only) and MUST be filtered in `candidate-scorer.ts:74` SELECT — verify before launch
- Bias eval set: synthetic candidates with identical resumes but different demographic markers should produce identical scores

---

## 11. Open Questions for Decision

1. **Build vs buy embeddings?** OpenAI embeddings vs self-hosted (BGE, etc.)? Verdict: OpenAI for now, switch if cost becomes issue.
2. **Real-time scoring vs batch?** Current is real-time async. Batch would save 3x cost via batch API. Verdict: keep real-time for UX.
3. **Single LLM provider vs multi?** Multi adds complexity; single = lock-in risk. Verdict: multi via gateway from day 1.
4. **Employer-tunable prompts?** Let enterprise customers customize scoring criteria? Verdict: defer to phase 4.
5. **Open up AI features to free tier?** Vector matching = yes. Cover letter generation = paid only. Verdict: gate generative features.
6. **Where does Claude Code SDK fit?** For internal tooling (admin chatbots, content gen) — yes. For customer-facing — OpenAI primary.
7. **Do we need a dedicated MLOps person?** Not until phase 3. Until then, eng team owns it.

---

## 12. Anti-Patterns to Avoid

- ❌ **Don't hand-build features that LLMs can do** (e.g. "tag this resume" — let the model do it)
- ❌ **Don't expose raw LLM output to users** (always validate, sanitize, format)
- ❌ **Don't trust LLMs for compliance-critical decisions** (auto-rejection MUST be a knockout-rule trigger, not an AI hunch)
- ❌ **Don't store LLM responses as ground truth without human review** (especially for SEO content)
- ❌ **Don't skip eval** ("we'll tune the prompt later" → never happens → silent quality drift)
- ❌ **Don't ignore latency** (anything user-facing >2s feels broken)

---

## 13. Success Criteria

We've succeeded when:
- 80%+ of paid employers describe AI scoring as "saves me real time" (NPS-style)
- Candidate self-reported "found this job because of AI match" >40%
- Time-from-apply-to-employer-decision drops by 50%+
- Application abandon rate <30%
- AI cost stays below 5% of revenue
- Zero discrimination complaints traceable to AI decisions
- Admin support tickets about "wrong score" <1% of scorings

---

## 14. Next Steps

1. Review this doc, mark sections as approved / needs-rework
2. Pick Phase 0 ship list, scope into sprint-sized tickets
3. Decide on feature flag system (config.ts vs Statsig)
4. Set up LLM Gateway scaffold
5. Add pgvector extension migration
6. Define eval golden set (100 candidate-job pairs, hand-scored)

Once Phase 0 lands we have the runway to ship Phases 1-4 in parallel.
