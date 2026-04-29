# PMHNP Job Board — Ingestion Pipeline & Prod DB Analysis

## Context

Full end-to-end audit of the job ingestion pipeline (fetch → normalize → dedup → persist → enrich → expire → deindex) for the PMHNP Job Board (Next.js + Prisma + Postgres on Supabase). Includes a live snapshot of the production database (`sggccmqjzuimwlahocmy.supabase.co`, 31,851 jobs) sampled 2026-04-28.

This is an **analysis/research task** — no code changes are proposed. The deliverable is the report below.

---

## 1. Pipeline Topology (Source → DB → Expiry)

```
                                   ┌─────────────────────────────────────────┐
                                   │  Vercel Cron (vercel.json, 24+ entries) │
                                   └─────────────────┬───────────────────────┘
                                                     ▼
                       ┌─────────────────────────────────────────────────────────┐
                       │  /api/cron/ingest?source=<name>&chunk=<n>               │
                       │  (Bearer-auth via CRON_SECRET, 300s max)                │
                       └─────────────────┬───────────────────────────────────────┘
                                         ▼
                       lib/ingestion-service.ts → ingestJobs(sources, opts)
                                         │
        ┌────────────────┬───────────────┼────────────────┬──────────────────┐
        ▼                ▼               ▼                ▼                  ▼
  fetchAdzunaJobs  fetchGreenhouseJobs  fetchLeverJobs  fetchJoobleJobs  ... 12 aggregators
  (lib/aggregators/*.ts — adzuna, ashby, ats-jobs-db, bamboohr, fantastic-jobs-db,
   greenhouse, icims, jazzhr, jooble, jsearch, lever, smartrecruiters, usajobs, workday)
                                         │
                                         ▼
                       ┌──────────────  Per-Job Loop  ──────────────┐
                       │ 1. extractRawTitle + isRelevantJob()       │  ← lib/ingestion-service.ts:235
                       │ 2. normalizeJob(rawJob, source)            │  ← lib/job-normalizer.ts
                       │     ├─ extractSalary (8-tier regex)        │
                       │     ├─ normalizeSalary (annualize)         │  ← lib/salary-normalizer.ts
                       │     ├─ parseLocation (city/state/remote)   │  ← lib/location-parser.ts
                       │     ├─ cleanDescription (HTML, mojibake)   │  ← lib/description-cleaner.ts
                       │     └─ detectJobType                       │
                       │ 3. checkDuplicate()                        │  ← lib/deduplicator.ts
                       │     Strategy 1: externalId map (fast)      │
                       │     Strategy 2: fuzzy title + apply URL    │
                       │     If dup → renewJob() (extend expiresAt) │
                       │ 4. INSERT with expiresAt = now + 60d       │
                       │ 5. parseJobLocation (DB write)             │
                       │ 6. linkJobToCompany                        │  ← lib/company-normalizer.ts
                       │ 7. computeQualityScore                     │
                       └────────────────────┬───────────────────────┘
                                            ▼
                       ┌──────────────────────────────────────────┐
                       │  Post-Ingest Sweep (per cron run)        │
                       │  • cleanAllJobDescriptions (regex sweep) │
                       │  • collectEmployerEmails (lead capture)  │
                       │  • pingAllSearchEnginesBatch (Google /   │
                       │    IndexNow / Bing for new URLs)         │
                       │  • Discord summary notification          │
                       │  • cleanupExpiredJobs() (tail call)      │
                       └──────────────────────────────────────────┘
```

Auth entry points: `app/api/cron/ingest/route.ts` (Vercel cron + manual trigger), `app/api/ingest/route.ts` (admin HTTP), `app/api/admin/trigger-ingestion/route.ts` (admin dashboard, server-session auth).

## 2. Aggregators (12 active sources)

| Source | Type | Strategy | Notes |
|---|---|---|---|
| adzuna | API | 7 keywords × 20 pages × 50/page, 7-day window | Highest fetch volume |
| jooble | API | Keyword-driven REST | Highest *acceptance* rate (188 added on 04-25) |
| greenhouse | API | 100+ company tenants, **chunked 0–7** (5-min steps) | Massive fetch (~39k/day) but near-zero new adds — saturated |
| lever | API | Hardcoded company list | Talkiatry, LifeStance, Lyra, Included Health, etc. |
| workday | API | **Chunked 0–4** | 1.8k fetched/run, ~1 added |
| ashby | API (GraphQL) | Fixed company list | 2.8k fetched, 0–1 added |
| usajobs | API (XML) | Federal endpoint | ~90 fetched, ~0 added — saturated |
| fantastic-jobs-db | RapidAPI (Active Jobs DB) | 30+ keywords, 7-day endpoint | Direct ATS apply links |
| ats-jobs-db | RapidAPI | Title-keyword search | Lowest catalog (215 lifetime) |
| smartrecruiters | API | Tenant ID list | Listed in cron, no source_stats hits this week |
| icims | API | Career-portal scrape | Stagnant: 52 fetched/run, 0 added |
| jazzhr | API | Hardcoded company list | Stagnant: 120 fetched/run, 0 added |

Each aggregator returns raw objects; relevance pre-filter (`isRelevantJob`) rejects non-PMHNP/NP titles before normalization.

## 3. Job Lifecycle State Machine

```
       INGESTED (raw object)
            │
            ├──[isRelevantJob fails]──► RejectedJob (rejection_reason="relevance_filter")
            ├──[normalizeJob returns null]──► RejectedJob ("normalizer")
            ├──[checkDuplicate matches]──► renewJob() OR RejectedJob ("duplicate_*")
            │                                         │
            ▼                                         ▼
       PUBLISHED (is_published=true, expires_at=now+60d, quality_score computed)
            │
            ├─[ingest-service.renewJob if seen again]──► expires_at += 14d, updated_at=now
            ├─[freshness-decay cron daily]──► recompute quality_score
            ├─[enrich-jobs cron]──► fill clinical_setting, population, salary, benefits via GPT-4o-mini
            ├─[check-dead-links cron]──► HEAD/GET; 404/410 → unpublish
            │
            ├─[120d since last renewal]──► UNPUBLISHED
            ├─[expires_at < now]──► UNPUBLISHED
            │
            ▼
       UNPUBLISHED (is_published=false, isManuallyUnpublished optional)
            │
            ├─[deindex-expired cron, runs 12:45 & 18:45 UTC]──► Google URL_DELETED + IndexNow
            ▼
       DEINDEXED (still in DB, not in search engines)
            │
            └─[manual / archive — rare]──► DELETED
```

Renewal-vs-expiry rules live in [lib/expiry-checker.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/expiry-checker.ts) (`shouldUnpublish`, `sendExpiryWarnings`). Employer/direct posts never auto-unpublish; only aggregated ones do.

Freshness scoring (search ranking via `qualityScore`) — [lib/freshness-decay.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/freshness-decay.ts):
- < 3 d → 20 pts
- 3–7 d → 15 pts
- 7–14 d → 10 pts
- 14–45 d → 5 pts
- > 45 d → 0 pts

## 4. Cron Schedule (vercel.json — UTC)

| Time (UTC) | Path | Purpose |
|---|---|---|
| 10:00, 16:00 | `ingest?source=adzuna` | Highest-volume ingest |
| 10:05, 16:05 | `ingest?source=jooble` | Highest-acceptance ingest |
| 10:10–10:45, 16:10–16:45 | `ingest?source=greenhouse&chunk=0..7` | 8-chunk sweep |
| 10:50, 16:50 | `ingest?source=lever` | Direct-employer ATS |
| 10:55, 16:55 | `ingest?source=usajobs` | Federal |
| 11:00, 17:00 | `ingest?source=ashby` | Direct-employer ATS |
| 11:05–11:25, 17:05–17:25 | `ingest?source=workday&chunk=0..4` | 5-chunk sweep |
| 11:30/35/40/45/50, 17:30… | fantastic-jobs-db, smartrecruiters, icims, jazzhr, ats-jobs-db | Tail sources |
| 12:00, 18:00 | `enrich-jobs` | LLM backfill (GPT-4o-mini) |
| 12:10, 18:10 | `cleanup-expired` | Unpublish past-expires |
| 12:15, 18:15 | `aggregate-pseo` | Programmatic SEO content |
| 12:20 | `freshness-decay` | Recompute quality_score |
| 12:30, 18:30 | `check-dead-links` | 1500 jobs/run, HEAD then GET |
| 12:40 | `cleanup-descriptions` | Re-sanitize HTML/encoding |
| 12:45, 18:45 | `deindex-expired` | Google + IndexNow URL_DELETED |
| 13:00 | `daily-report` | Internal report |
| 13:15 | `index-urls` | Submit new URLs |
| 13:30 | `send-alerts` | Email job alerts |
| 13:45 | `candidate-alerts`, `index-pseo` | |
| 14:00, 14:05 | `social-post`, `instagram-post` | Social syndication |
| 14:30 | `push-notifications` | Web-push |
| 18:00 | `profile-nudge` | UX nurture |
| 22:00 | `expiry-warnings` | Employer expiry notice (4–5 d out) |
| Mon 14:00 | `employer-report` | Weekly employer digest |
| Wed/Sat 13:00 | `saved-job-reminder` | Bi-weekly reminder |

## 5. Database Schema — `jobs` Table (Prisma `Job` model)

Critical fields ([prisma/schema.prisma:10-81](c:/Users/sathish.kumar/PMHNP-Job-Board/prisma/schema.prisma#L10-L81)):
- **Identity**: `id`, `slug` (unique), `external_id` + `source_provider` (composite dedup index)
- **Content**: `title`, `employer`, `description`, `description_summary`, `apply_link`
- **Location**: `location` (raw), `city`, `state`, `state_code`, `country`, `is_remote`, `is_hybrid`
- **Salary**: `min_salary` / `max_salary`, `salary_period`, `normalized_min_salary`, `normalized_max_salary` (annualized), `salary_is_estimated`, `salary_confidence`, `display_salary`
- **Lifecycle**: `is_published`, `is_manually_unpublished`, `expires_at`, `created_at`, `updated_at`, `original_posted_at`, `last_link_checked_at`, `last_enriched_at`
- **Ranking**: `quality_score` (indexed Desc), `is_featured`
- **PMHNP-specific**: `clinical_setting`, `patient_population`, `benefits[]`, `experience_level`
- **Relations**: `company_id` → `Company`, `screeningQuestions`, `applyClicks`, `jobApplications`, `jobReports`, `jobViewEvents`, `employerJobs`

Indexes optimised for: published-listing, featured filter, location/state/remote filters, salary range, slug lookup, (externalId, sourceProvider) dedup, qualityScore-desc ranking.

---

## 6. Production DB Snapshot — 2026-04-28

### 6.1 Top-line totals
| Metric | Count |
|---|---|
| Total jobs (all-time) | **31,851** |
| Published (live on site) | **8,446** (26.5 %) |
| Unpublished | 23,405 (73.5 %) |
| Manually unpublished | 268 |
| Featured | 18 |
| Linked to a Company row | 29,199 (91.7 %) |
| Enriched (LLM-touched) | 21,756 |
| Source = `employer` (direct post) | 18 (11 still published) |
| Source = `external` (aggregated) | 31,833 |

### 6.2 Per-source health (lifetime)
| Source | Jobs | Published | Avg Quality |
|---|---|---|---|
| adzuna | 11,607 | 1,626 | 27.9 |
| jsearch | 9,427 | 1,984 | 19.6 *(legacy — sub cancelled, still on site)* |
| jooble | 8,352 | **3,871** | 24.6 |
| lever | 856 | 158 | **64.0** |
| fantastic-jobs-db | 573 | 293 | 41.8 |
| greenhouse | 489 | 331 | 54.1 |
| ats-jobs-db | 215 | 12 | 64.2 |
| workday | 214 | 132 | 62.1 |
| ashby | 72 | 12 | 57.5 |
| icims | 15 | 11 | 29.0 |
| usajobs | 12 | 4 | 38.8 |
| jazzhr | 1 | 1 | 45.0 |
| smartrecruiters | — | — | (no rows logged) |

**Insight**: Aggregators (adzuna, jooble, jsearch) carry ≈ 89 % of published catalog but average quality 20–28. Direct ATS sources (lever, workday, greenhouse, ashby) average 54–64 quality but contribute < 8 %. **jsearch still has 1,984 jobs published despite the subscription being cancelled** — these jobs will rot until manually purged or aged out.

### 6.3 Daily ingest velocity (source_stats, last 5 days)
Greenhouse fetches ~39k jobs/day with **0–2 net adds** — chunking is doing work but the source is saturated. Jooble is the dominant net-new source (57–188 added/day). Lever/workday/ashby/icims/jazzhr/usajobs collectively add < 25/day.

```
2026-04-28: adzuna +33, jooble +31, lever +6, greenhouse +0, workday +2, all others 0
2026-04-25: jooble +188 (peak), adzuna +46, lever +10, others ~0
```

### 6.4 Age distribution of published jobs
| Age | Count | % of published |
|---|---|---|
| < 3 d (Fresh) | 131 | 1.6 % |
| 3–7 d (Recent) | 576 | 6.8 % |
| 7–14 d (Normal) | 1,064 | 12.6 % |
| 14–45 d (Aging) | 2,762 | 32.7 % |
| > 45 d (Stale, freshness=0) | **3,784** | **44.8 %** |
| `original_posted_at` NULL | 129 | 1.5 % |

**Insight**: Almost half of the live catalog scores 0 freshness points. They're alive only because something renewed `expires_at` recently. This is a known property of the renewal model — but it materially weights the catalog away from "fresh" content.

### 6.5 Quality score distribution (published)
| Bucket | Count |
|---|---|
| 80+ Excellent | 72 |
| 60–79 Good | 619 |
| 40–59 Fair | 2,595 |
| 20–39 Low | **4,290** |
| < 20 Poor | 870 |
| **Mean** | **34.9** |

61 % of live jobs sit at < 40 quality. The poor-quality jobs are concentrated in adzuna/jsearch/jooble.

### 6.6 Salary coverage (published)
| Metric | Value |
|---|---|
| With normalized salary | 4,938 / 8,446 (58.5 %) |
| With display salary | 4,917 |
| LLM-estimated salary | 114 |
| Avg min / max (annualised) | $170,461 / $180,427 |
| Range | $27,500 → $624,000 |

The min ($27.5k) suggests at least one outlier — probably an unconverted hourly rate that escaped the period detector. Worth a one-off audit.

### 6.7 Mode / job type / geography
- **Mode**: 4,420 NULL, 1,789 Remote, 927 On-site, 840 Hybrid, 445 In-Person, 24 Telehealth, 1 Flexible. *Note: "On-site" + "In-Person" coexist as separate categories — likely needs canonicalisation.*
- **Job type**: 3,487 NULL, 2,887 Full-Time, 1,074 Part-Time, 897 Contract, 66 Per Diem, 25 PRN, plus a long tail of Workday-style enums leaking through (`OTHER_EMPLOYMENT_TYPE`, `UNAVAILABLE`).
- **Top states**: NY 635, CA 522, MA 375, TX 357, FL 301, PA 268, NJ 257, IL 256, CO 253, WA 246. Standard high-density-metro pattern.
- **Remote vs hybrid vs on-site**: 673 / 102 / 7,672 — remote share is only 8 %, much lower than the NULL `mode` count would suggest.

### 6.8 Enrichment coverage (published)
| Field | Coverage |
|---|---|
| `last_enriched_at` set | 8,058 / 8,446 (95 %) |
| `description_summary` | 8,446 (100 %) |
| `job_type` | 4,959 (58.7 %) |
| `experience_level` | 2,682 (31.8 %) |
| `clinical_setting` | 2,594 (30.7 %) |
| `patient_population` | 2,205 (26.1 %) |
| `benefits` | 1,235 (14.6 %) |

LLM enrichment runs but extracts conservatively — the PMHNP-specific dimensions (setting, population) and benefits are the weakest signals. This directly limits filter UX on the site.

### 6.9 Dead-link check freshness
| Bucket | Count |
|---|---|
| Never checked | 11 |
| Checked < 24 h | 2,929 |
| Checked 1–7 d | 5,506 |
| Checked > 7 d | 0 |

The 1500-jobs-per-run × 2/day rotation cycles the full published catalog inside a week. Healthy.

### 6.10 Expiry buckets (published)
| Bucket | Count |
|---|---|
| Already past `expires_at` | 0 *(cleanup-expired keeps this clean)* |
| Expires within 7 d | 1,123 |
| Expires 7–30 d | 6,121 |
| Expires > 30 d | 1,202 |
| No `expires_at` | 0 |

Healthy distribution; `cleanup-expired` is doing its job.

### 6.11 Unpublished churn
| Metric | Count |
|---|---|
| Unpublished total | 23,405 |
| Auto-unpublished aggregated | 23,130 (99 %) |
| Unpublished in last 24 h | 449 |
| Unpublished in last 7 d | 2,234 |
| Unpublished in last 30 d | 10,330 |

**Insight**: ~10k jobs/month churn off the catalog through expiry/dead-link/aging — roughly 30 % of the live catalog rotates per month, balanced by ingest of ~6.5k/month new + renewals.

### 6.12 Rejection reasons (lifetime, `rejected_jobs`)
| Reason | Count |
|---|---|
| relevance_filter | 338,711 |
| duplicate_externalid | 14,849 |
| duplicate_fuzzy_title | 7,897 |
| duplicate_exact_title | 3,582 |
| duplicate_exact_id | 2,899 |
| renewal_age_expired (>120 d cap) | 1,876 |
| duplicate_apply_url | 1,589 |
| normalizer | 129 |

The relevance filter is by far the biggest gate — for every 1 PMHNP job kept, ~10 are rejected as off-topic. Duplicate detection is split across 5 strategies and catches ~30k rejections/lifetime.

### 6.13 Top employers (with potential normalisation issues)
```
LifeStance Health         750
Headway                   441
Fcs Co                    376
Headway - Design & Devel  258  ← duplicate of "Headway"
Seasoned Recruitment      194
Blue Sky Telepsych        148
Lifestance                145  ← duplicate of "LifeStance Health"
BlueSky Telepsych         127  ← duplicate of "Blue Sky Telepsych"
Talkiatry                 91
LocumTenens.com           87
```
**3 visible normalisation collisions** in the top-10 (LifeStance vs Lifestance, Blue Sky vs BlueSky, Headway vs Headway - Design & Development). [lib/company-normalizer.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/company-normalizer.ts) has aliasing but isn't catching these.

---

## 7. Risks & Observable Issues (from data)

1. **jsearch zombie catalog**: 1,984 published jsearch jobs with avg quality 19.6 — the API subscription was cancelled but the jobs persist. They'll only leave via dead-link or 120-day renewal cap. → consider a one-off purge.
2. **Greenhouse near-zero acceptance**: 39k fetched/day, 0–2 added. Either the relevance filter is over-aggressive against Greenhouse titles, or the 100+ company list has stopped posting PMHNP roles. → worth comparing fetch sample against rejected_jobs filter to validate.
3. **Stale-heavy catalog**: 44.8 % of published jobs are > 45 days old (freshness=0). Renewals keep them alive; ranking penalty is the only protection.
4. **Salary outliers**: $27.5k min annualised salary is implausible for PMHNP. Period detection misclassified at least one record.
5. **Mode taxonomy split**: "On-site" (927) and "In-Person" (445) are functionally equivalent; faceted filters likely show two buckets.
6. **Job type leakage**: Raw Workday enums (`OTHER_EMPLOYMENT_TYPE`, `UNAVAILABLE`) reach the DB unmapped.
7. **PMHNP enrichment thin**: Only 26–31 % of jobs carry clinical_setting / patient_population. Benefits coverage 15 %. Limits filter UX.
8. **Company normalisation gaps**: ≥ 3 dupes visible in top-10 employers.
9. **icims / jazzhr / smartrecruiters / ats-jobs-db / usajobs**: Each contributes < 5 jobs/day. Their cron slots cost a Vercel invocation and ~50 fetches without measurable yield. → audit for keep/cut.

---

## 8. Critical Files Referenced (for follow-up work)

- [lib/ingestion-service.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/ingestion-service.ts) — orchestrator (`ingestJobs`, `cleanupExpiredJobs`, `getIngestionStats`)
- [lib/aggregators/](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/aggregators/) — 12 source clients
- [lib/job-normalizer.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/job-normalizer.ts), [lib/salary-normalizer.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/salary-normalizer.ts), [lib/location-parser.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/location-parser.ts), [lib/description-cleaner.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/description-cleaner.ts), [lib/deduplicator.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/deduplicator.ts), [lib/company-normalizer.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/company-normalizer.ts) — transform stack
- [lib/expiry-checker.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/expiry-checker.ts), [lib/freshness-decay.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/freshness-decay.ts) — lifecycle rules
- [lib/search-indexing.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/lib/search-indexing.ts) — Google Indexing API + IndexNow
- [app/api/cron/](c:/Users/sathish.kumar/PMHNP-Job-Board/app/api/cron/) — 21 scheduled handlers
- [app/api/ingest/route.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/app/api/ingest/route.ts), [app/api/admin/trigger-ingestion/route.ts](c:/Users/sathish.kumar/PMHNP-Job-Board/app/api/admin/trigger-ingestion/route.ts) — manual triggers
- [prisma/schema.prisma](c:/Users/sathish.kumar/PMHNP-Job-Board/prisma/schema.prisma) — Job model + indexes
- [vercel.json](c:/Users/sathish.kumar/PMHNP-Job-Board/vercel.json) — cron schedule

---

## 9. Verification

This report is purely descriptive — no code changed. Re-validate any of the live numbers with a read-only psql/node session against `PROD_DATABASE_URL` from `.env.prod`, e.g.:

```sql
SELECT source_provider, COUNT(*) FILTER (WHERE is_published) AS pub
FROM jobs GROUP BY source_provider ORDER BY pub DESC;
```

Snapshot taken: **2026-04-28** against Supabase project `sggccmqjzuimwlahocmy`.
