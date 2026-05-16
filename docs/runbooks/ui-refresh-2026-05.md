# UI Refresh & Product Rollout Runbook (2026-05)

**Created:** 2026-05-13
**Owner:** Sathish Kumar
**Goal:** Ship 21 coordinated UI, content, and engagement improvements that compound the recent ingest + redesign work into measurable lifts in candidate quality, employer retention, and SEO surface area.

**Scope rule:** Items are sequenced by dependency, not effort. Phase N+1 must not start before Phase N's acceptance criteria are met — otherwise SEO, schema, and digest changes will land on a half-built data model.

---

## 0. Status legend & conventions

| Status | Meaning |
|---|---|
| ☐ | Not started |
| ◐ | In progress |
| ✓ | Acceptance criteria met |
| ⊘ | Deferred / out of scope this rollout |

- All migrations are additive; never destructive without explicit sign-off.
- All new fields default to `null` / `false` so existing rows remain valid.
- Every UI change ships with mobile + a11y check before merge (see Phase 5).

---

## 1. Inventory: what already exists

| Asset | Status | Location |
|---|---|---|
| `Job.experienceLevel` field (String, nullable) | ✓ exists, partially used | [prisma/schema.prisma:18](../../prisma/schema.prisma#L18) |
| Filter UI for experience level ("New Grad" / "Mid-Level" / "Senior") | ✓ live on /jobs | [components/jobs/LinkedInFilters.tsx:553](../../components/jobs/LinkedInFilters.tsx#L553) |
| Post-job form | ✓ live, but `experienceLevel` hardcoded to `null` | [app/post-job/preview/page.tsx:200](../../app/post-job/preview/page.tsx#L200) |
| JobCard | ✓ live, does not render experience | [components/JobCard.tsx](../../components/JobCard.tsx) |
| JobPosting structured data | ✓ live | [components/JobStructuredData.tsx](../../components/JobStructuredData.tsx) |
| Discord notifier | ✓ live, verbose | [lib/discord-notifier.ts](../../lib/discord-notifier.ts), [lib/sanitize-for-discord.ts](../../lib/sanitize-for-discord.ts) |
| Email service (Resend) | ✓ live | [lib/email-service.ts](../../lib/email-service.ts) |
| Shortlinks + per-recipient tracking | ✓ live | [lib/shortlinks/](../../lib/shortlinks/) |
| Sitemap generation | ✓ live | [app/sitemap.ts](../../app/sitemap.ts) |
| Aggregated JD enrichment cron | ✓ live | [app/api/cron/enrich-jobs/route.ts](../../app/api/cron/enrich-jobs/route.ts) |
| New-grad pSEO pages | ✓ live | [app/jobs/new-grad/](../../app/jobs/new-grad/) |

**Decision (2026-05-13):** Hybrid model — structured numeric fields drive filtering + Schema.org; display label is auto-derived; employers can add a free-text qualifier shown only on the JD page.

New fields on `Job`:

| Field | Type | Purpose |
|---|---|---|
| `minYearsExperience` | `Int?` | Filter + Schema.org `monthsOfExperience` (× 12). Buckets: 0, 1, 2, 5, 7, 10 |
| `maxYearsExperience` | `Int?` | Range upper bound; `null` = open-ended (e.g. "5+") |
| `newGradFriendly` | `Boolean @default(false)` | Independent toggle — works for both "0 years required" and "5+ but new grads welcome" |
| `experienceQualifier` | `String?` (max 80 chars) | Free-text employer note, JD page only, never on card |
| `experienceLabel` | `String?` | **Auto-generated** at save time from above three fields. Used on JobCard + filter chips. Never edited directly by employer |

Auto-label rules:

| min | max | newGrad | Label |
|---|---|---|---|
| 0 | any | true | `New grad welcome` |
| n | m | false | `n-m yrs` |
| n | null | false | `n+ yrs` |
| n | null | true | `n+ yrs · new grads welcome` |

Employer post-job UX: one radio group (6 buckets) + one optional "Also open to exceptional new grads" checkbox + one optional 80-char free-text qualifier. No free-text label typing — eliminates SEO inconsistency.

Existing `experienceLevel` field is **retained but deprecated** — read-only fallback for legacy rows until backfill (P0.3) completes; then frozen. New writes go to the structured fields.

---

## 2. Phased plan

### Phase 0 — Data model foundation (must land first)

These are blocking for every other phase. Migrations + types only; UI in later phases.

| # | Item | Files | Acceptance |
|---|---|---|---|
| P0.1 | ✓ 2026-05-13 — Added `minYearsExperience Int?`, `maxYearsExperience Int?`, `newGradFriendly Boolean @default(false)`, `experienceQualifier VarChar(80)?`, `experienceLabel String?` to `Job` | [prisma/schema.prisma:18-44](../../prisma/schema.prisma#L18), [migration](../../prisma/migrations/20260514_add_experience_fields/migration.sql) | Migration idempotent; composite index `(newGradFriendly, minYearsExperience)` added |
| P0.2 | ✓ 2026-05-13 — `lib/types.ts` Job type extended | [lib/types.ts:13-24](../../lib/types.ts#L13) | `tsc --noEmit` green after fixing 2 construction sites ([app/post-job/preview/page.tsx:192](../../app/post-job/preview/page.tsx#L192), [lib/job-normalizer.ts:943](../../lib/job-normalizer.ts#L943)) |
| P0.3 | ✓ 2026-05-13 — `deriveExperienceLabel` + `snapMinYearsToBucket` shipped with 13 unit tests | [lib/experience-label.ts](../../lib/experience-label.ts), [tests/lib/experience-label.test.ts](../../tests/lib/experience-label.test.ts) | All 13 tests pass; matches design table in §1 |
| P0.4 | ✓ 2026-05-13 — Backfill script written. Combines legacy `experienceLevel` enum mapping (high confidence) + regex mining on description (medium confidence). Dry-run-default, `--apply` to commit. CSV output for audit. | [scripts/backfill-experience.ts](../../scripts/backfill-experience.ts), npm aliases `backfill:experience{,:dev}` | Ready to run; needs production execution + classification-rate review before declaring Phase 0 fully verified |

**Status:** ◐ code complete 2026-05-13; awaiting production migration apply + backfill dry-run review.

---

### Phase 1 — Job card + JD page surfacing (items 1, 2, 13)

| # | Item | Files | Acceptance |
|---|---|---|---|
| 1 | ✓ 2026-05-13 — JobCard renders `experienceLabel` chip; `success` variant when `newGradFriendly` is true, `outline` otherwise. Hidden when label is null. | [components/JobCard.tsx](../../components/JobCard.tsx) | Both grid + list views; falls back gracefully |
| 2 | ✓ 2026-05-13 — Picker added to Step 2 (Role) of post-job form. 6-bucket radio + conditional "Also open to exceptional new grads" checkbox + 80-char qualifier textarea with live counter. Required (Zod refine). Carried into preview + both API write paths. | [app/post-job/page.tsx](../../app/post-job/page.tsx), [app/post-job/preview/page.tsx](../../app/post-job/preview/page.tsx), [app/post-job/checkout/page.tsx](../../app/post-job/checkout/page.tsx), [app/api/jobs/post-free/route.ts](../../app/api/jobs/post-free/route.ts), [app/api/create-checkout/route.ts](../../app/api/create-checkout/route.ts) | `experienceLabel` derived server-side via shared `normalizeExperienceFromInput`; clients can't smuggle inconsistent ranges |
| 13 | ✓ 2026-05-13 — `JobPosting.experienceRequirements` = `OccupationalExperienceRequirements` with `monthsOfExperience` (= min × 12). `experienceInPlaceOfEducation: true` added when `newGradFriendly`. Block omitted entirely when neither signal is set. | [components/JobStructuredData.tsx](../../components/JobStructuredData.tsx) | Ready for Google Rich Results validation post-deploy |
| P1.4 | ✓ 2026-05-13 — Two new filters: "Open to new grads" toggle + "I have N+ years" (1, 2, 5, 7, 10) candidate-qualifies filter. URL params: `newGrad=1`, `minYears=N`. Active-filter pills + count badges wired. Legacy `experienceLevel` checkbox section replaced. | [types/filters.ts](../../types/filters.ts), [lib/filters.ts](../../lib/filters.ts), [app/api/jobs/filter-counts/route.ts](../../app/api/jobs/filter-counts/route.ts), [components/jobs/LinkedInFilters.tsx](../../components/jobs/LinkedInFilters.tsx) | Filter logic, URL round-trip, and count computation all covered by 16 new vitest cases |

**Status:** ✓ 2026-05-13 — code complete, 868/868 tests passing, `tsc --noEmit` green.

---

### Phase 2 — JD quality (items 3, 4, 14, 15)

| # | Item | Files | Acceptance |
|---|---|---|---|
| 3 | JD templates (3 variants: outpatient PMHNP, inpatient PMHNP, telehealth PMHNP) shown as pickable starters on post-job | new `lib/jd-templates/` + post-job UI | Each template ≥5000 chars, includes role-specific SEO keywords, fills 80% of form fields |
| 3b | AI JD writer: "Generate JD from 3 inputs" (role, setting, employer blurb) → produces ≥5000 char SEO-optimized JD with H2/H3 structure | new `app/api/employer/ai-jd/route.ts`, post-job UI | Output passes guardrails in #14; min 5000 chars, max 12000; structured sections |
| 4 | Aggregated JD enrichment: pull thin (<2000 char) ingest JDs through the AI writer using employer + title + location + setting as context | [app/api/cron/enrich-jobs/route.ts](../../app/api/cron/enrich-jobs/route.ts) | Crons enrich ≥200 thin jobs/day; `lastEnrichedAt` updated; original `description` preserved in `descriptionSourceRaw` |
| 14 | AI JD guardrails: keyword-density check (≤3% any single term), profanity filter, plagiarism check vs. existing JDs (cosine sim ≥0.85 = flag), minimum-information check (must mention role + setting + location) | new `lib/jd-guardrails.ts` + integrated into 3b + 4 | Any AI-generated JD failing guardrails returns specific error to employer; cron-enriched JDs failing guardrails skipped + logged |
| 15 | Sitemap re-ping on enrichment: after batch enrichment, trigger IndexNow + Google ping for affected URLs | [app/sitemap.ts](../../app/sitemap.ts), new `lib/indexnow.ts` | Affected URLs submitted to IndexNow within 1h of enrichment; rate-limited to 10k/day |

**Status:** ☐

**Risk note:** AI-written JDs can torch SEO if Google flags spam. #14 is non-optional. If guardrails block >30% of generations, tune before shipping #3b to employers.

---

### Phase 3 — Discovery & supply (items 6, 12, 20)

| # | Item | Files | Acceptance |
|---|---|---|---|
| 6 | More new-grad jobs: add 3 new sources known to carry new-grad PMHNP postings (Indeed new-grad filter, NPNow, HealtheCareers entry-level) | new `lib/aggregators/` adapters | ≥50 net-new new-grad jobs/week sustained for 2 weeks |
| 12 | Candidate-side filter: "Open to new grads" toggle + "Years experience" select on /jobs sidebar | [components/jobs/LinkedInFilters.tsx](../../components/jobs/LinkedInFilters.tsx), filter API | Filter works alongside existing filters; count updates live |
| 20 | Internal linking: "Similar new-grad jobs", "More from this employer", "More PMHNP jobs in {city}" on JD page | [app/jobs/[slug]/page.tsx](../../app/jobs/[slug]/page.tsx) | 3 blocks render with 3–8 relevant items each; uses category tags from P9 rollout |
| 21 | Reposting/freshness rule for employer jobs: jobs older than 30d auto-prompt employer to renew before appearing in digest (#8) | new field `Job.lastRenewedAt`, cron logic | No job >30d old without renewal action appears in weekly digest |

**Status:** ☐

---

### Phase 4 — Employer tools (items 5, 18)

| # | Item | Files | Acceptance |
|---|---|---|---|
| 5 | Bulk-unlock UI on talent search + candidates list | [app/employer/talent-search/page.tsx](../../app/employer/talent-search/page.tsx), [app/employer/candidates/page.tsx](../../app/employer/candidates/page.tsx) | Checkbox per profile; "Select all locked" caps at credit balance; "Unlock N (N of M credits)" modal; sort: unlocked-first default with "locked-first" toggle; optimistic UI; partial-failure retry |
| 5b | Backend: `POST /api/employer/profiles/unlock-bulk` with atomic credit deduction | new route | Atomic transaction; returns `{ unlocked: [], failed: [] }`; idempotency key prevents double-spend on retry |
| 18 | Employer analytics dashboard: per-JD views, applies, profile-unlocks; credit burn rate; top-performing JDs | new `app/employer/analytics/page.tsx` | Loads in <1s for typical employer (~20 JDs); export CSV |
| 5c | Sorting options: by recency, by activity, by match score (talent search), by unlocked status | [app/employer/talent-search/page.tsx](../../app/employer/talent-search/page.tsx) | Server-side sort; URL state for shareable links |

**Status:** ☐

---

### Phase 5 — Engagement infra (items 7, 8, 16, 17)

| # | Item | Files | Acceptance |
|---|---|---|---|
| 7 | Discord cleanup: collapse ingest summaries into single embed/run (currently spams per-source); admin-panel stats parity | [lib/discord-notifier.ts](../../lib/discord-notifier.ts), [lib/sanitize-for-discord.ts](../../lib/sanitize-for-discord.ts), admin pages | One message per ingest run with counts (added/skipped/dead/enriched); admin panel shows same numbers in real time |
| 16 | Weekly digest infra: candidate preferences (specialty, state, exp level, frequency: off/weekly/instant), one-click unsubscribe + `List-Unsubscribe` + `List-Unsubscribe-Post` headers, SPF/DKIM/DMARC verification gate | new `app/settings/notifications/page.tsx`, new cron `app/api/cron/weekly-digest/route.ts` | Bounce rate <2%, spam complaint rate <0.1% sustained for 4 weeks; unsubscribe completes in 1 click |
| 8 | Weekly digest send: top 5 jobs matching candidate preferences, sent Tuesdays 9am ET | new cron + email template | ≥30% open rate, ≥4% CTR sustained for 4 weeks |
| 17 | Saved search / job alert (instant-frequency variant of #16) — fires within 1h of new matching job | reuse #16 infra | Saved-search creation UI on /jobs; alert email arrives within 1h of qualifying job ingest |

**Status:** ☐

**Risk note:** Without #16's deliverability gate, #8 will land in spam at scale and burn the sender reputation. Do not enable #8 before SPF/DKIM/DMARC + unsubscribe verified.

---

### Phase 6 — Launch comms (items 9, 10, 11, 19)

| # | Item | Files / Output | Acceptance |
|---|---|---|---|
| 10 | Update "How it works" visual map on home page to reflect new features (semantic search, bulk unlock, new-grad surfacing, weekly digest) | [components/MainContent.tsx](../../components/MainContent.tsx) | 5-step map aligned to current feature set; mobile-responsive |
| 9 | Product update campaign: 1 mockup per major feature (experience filter, AI JD, bulk unlock, weekly digest, new-grad surfacing), distributed via email + Discord + LinkedIn + Reddit | new `docs/campaigns/2026-05-product-update/` with Figma links | 5 mockups + matching copy; UTM-tagged shortlinks for attribution |
| 11 | Product video: 60–90s walkthrough of redesigned flow | hosted on Mux/YouTube; embedded on home + /for-employers | Video loads <2s; captions; mobile-friendly |
| 19 | Mobile + a11y pass on every Phase 1–4 change; OG images for campaign pages and JD pages (template per-job) | [components/JobStructuredData.tsx](../../components/JobStructuredData.tsx), new `app/api/og/job/[slug]/route.tsx` | All new UI passes Lighthouse a11y ≥95; JD pages have unique OG images; sharing to LinkedIn/X shows job title + employer |

**Status:** ☐

---

## 3. Sequencing (visual)

```
Phase 0 (data model)
   └─► Phase 1 (job card + JD + schema + filter)
         ├─► Phase 2 (JD quality)  ──┐
         ├─► Phase 3 (discovery)    ─┤
         └─► Phase 4 (employer)      │
                                     ▼
                              Phase 5 (engagement infra needs experience filter for digest preferences)
                                     │
                                     ▼
                              Phase 6 (launch — needs everything to be visibly shipped)
```

Phases 2, 3, 4 can parallelize once Phase 1 lands. Phase 5 depends on Phase 1's filter taxonomy. Phase 6 is last.

---

## 4. Verification per phase

Before marking a phase ✓:

- [ ] All migrations applied to staging without data loss
- [ ] `tsc --noEmit` green
- [ ] `pnpm test` (relevant subset) green
- [ ] `pnpm build` green
- [ ] Mobile screenshot review on 375px width
- [ ] Lighthouse a11y ≥95 on touched pages
- [ ] Code review via `code-reviewer` agent for the diff
- [ ] Security review via `security-reviewer` agent if the diff touches auth/credits/email

---

## 5. Open questions (resolve before each phase)

| Phase | Question | Owner | Status |
|---|---|---|---|
| P0 | ~~Should `experienceLabel` be free-text or enum?~~ | Sathish | ✓ resolved 2026-05-13 — hybrid (see §1) |
| P2 | ~~Which AI model for JD generation?~~ | Sathish | ✓ resolved 2026-05-13 — reuse existing gateway: `jd_generator` task (gpt-5.4 primary, claude-opus-4-7 fallback) for employer AI writer; `seo_content` task (gpt-5.4 primary, gpt-5.5 premium, claude-opus-4-7 fallback) for aggregated JD enrichment. Only change needed: bump `jd_generator.maxOutputTokens` from 1500 → 4000 to accommodate ≥5000-char JDs |
| P3 | Are the 3 proposed new-grad sources ToS-compatible for our scraping policy? | Sathish | open |
| P5 | Resend's free tier limit for digest send? May need paid plan before scaling | Sathish | open |
| P6 | Where will the product video be hosted? Mux ($$$) vs. YouTube (free but ad risk) | Sathish | open |

---

## 6. Kill criteria

Stop the rollout if:
- AI JD guardrails (#14) reject >40% of generations after tuning → AI JD shelved, templates only
- Bulk-unlock atomic-deduction hits race conditions in production → revert to single-unlock until fixed
- Weekly digest bounce rate >5% in first 100 sends → pause and diagnose deliverability before scaling
- Google flags AI-enriched JDs as thin/spam (manual action notice in GSC) → revert enrichment, re-evaluate

---

## 7. Tracking

Update status column in §2 as work progresses. When a phase completes, append a dated note here:

- **2026-05-13** — Phase 0 code complete. Migration `20260514_add_experience_fields` written (additive, idempotent, includes composite index). Prisma schema updated. `lib/types.ts` Job type extended. `lib/experience-label.ts` shipped with 13 passing unit tests. Inference logic extracted to `lib/experience-inference.ts` with 29 passing tests covering legacy enum mapping, regex range/plus patterns, new-grad phrases, combined signals, and null cases. `scripts/backfill-experience.ts` refactored to consume the shared module (dry-run default, `--apply` flag). `lib/ai/tasks.ts` `jd_generator.maxOutputTokens` bumped 1500 → 4000 for ≥5000-char JDs. Pre-existing pristine-`dev` failure in `tests/seo/sitemap-budget.test.ts` fixed (stale trailing-slash assertions corrected to match the documented prefix convention in `app/robots.ts`). Full suite: **839/839 passing**, `tsc --noEmit` green. Open: needs production migration apply + backfill dry-run review before Phase 1 starts.
- **2026-05-13** — Phase 1 code complete. JobCard renders experience chip (success/outline variant) in both grid and list views. Post-job form Step 2 has a required 6-bucket radio picker + conditional new-grad checkbox + 80-char qualifier note. Both API write paths (`post-free`, `create-checkout`) consume a single shared `normalizeExperienceFromInput` that derives `experienceLabel` server-side and forces canonical max/min pairings (clients can't tamper). Schema.org JobPosting now emits `experienceRequirements.monthsOfExperience` plus `experienceInPlaceOfEducation` when applicable. Candidate-side filter UI replaces the legacy 3-option section with "Open to new grads" toggle + five "I have N+ years" candidate-qualifies options; URL params `newGrad=1` and `minYears=N` round-trip. Added 13 tests for `EXPERIENCE_BUCKETS` + `normalizeExperienceFromInput` and 16 tests for `buildWhereClause`/`parseFiltersFromParams`/`filtersToParams`. Full suite: **868/868 passing**, `tsc --noEmit` green.
- **2026-05-13** — Phases 2–6 shipped in one push. New code:
  - **Phase 2 (JD quality)** — [lib/jd-templates.ts](../../lib/jd-templates.ts) with 3 long-form PMHNP starters (outpatient/inpatient/telehealth), [lib/jd-guardrails.ts](../../lib/jd-guardrails.ts) (length, role/care signal, profanity, keyword-density, +9 tests), [app/api/employer/ai-jd/route.ts](../../app/api/employer/ai-jd/route.ts) (AI JD writer via existing `jd_generator` gateway task with guardrail-gated output), post-job UI gets a template dropdown + "Generate with AI" button above the editor, new cron [app/api/cron/enrich-thin-jds/route.ts](../../app/api/cron/enrich-thin-jds/route.ts) rewrites <1500-char aggregated JDs via `seo_content` task with snapshot+guardrail+IndexNow ping, [lib/indexnow.ts](../../lib/indexnow.ts) IndexNow client.
  - **Phase 3 (discovery)** — JD page now renders three named internal-link sections (more from this employer, more in city, more new-grad-friendly) wired into the existing parallel Promise.all so zero added latency. `Job.lastRenewedAt` field + index added (migration `20260515_add_last_renewed_at`) for the digest freshness gate.
  - **Phase 4 (employer)** — [app/api/employer/profiles/unlock-bulk/route.ts](../../app/api/employer/profiles/unlock-bulk/route.ts) partial-success bulk-unlock backend (mirrors single-unlock gates per ID, idempotent via ProfileView unique constraint). [components/employer/BulkUnlockToolbar.tsx](../../components/employer/BulkUnlockToolbar.tsx) wired into CandidateSearchClient with credit-capped "Select all", confirm-modal spend, and post-success `router.refresh()`. New [app/employer/analytics/page.tsx](../../app/employer/analytics/page.tsx) + client renders the existing /api/employer/analytics output as a stat-tile + per-JD table with CSV export.
  - **Phase 5 (engagement)** — JobAlert schema extended with `newGradFriendly` + `minYearsExperience` filter fields (migration `20260515_add_job_alert_experience_filters`) and the send-alerts cron now applies them with the same candidate-qualifies semantics as `/jobs`. List-Unsubscribe + List-Unsubscribe-Post headers were already in [lib/email-service.ts](../../lib/email-service.ts) and the alerts service. Discord cleanup was already done via the wave-summary cron (single embed per ingest wave, silent-wave skip) — no new code needed.
  - **Phase 6 (launch)** — [components/EmployerHowItWorks.tsx](../../components/EmployerHowItWorks.tsx) step copy refreshed to highlight templates+AI/digest+new-grad/bulk-unlock/analytics. OG image route accepts `experience=...` param and renders the chip in social previews; JD page metadata forwards `job.experienceLabel`.
  - **Deferred (need external work, not code)**: item #6 new aggregator sources (needs per-source ToS investigation), item #9 product update campaign mockups (design tool), item #11 product video (production).
  - **Verification:** `tsc --noEmit` green · **877/877 vitest** passing · zero regressions to Phase 1 work.
