# P9 — Category Tags Rollout Runbook

**Why:** Pre-P9, taxonomy×city and taxonomy×state pages used `OR title.contains 'X' OR description.contains 'X'` matchers at query time. A single PMHNP description mentions "behavioral health", "outpatient", "community health", and "mental health" simultaneously, so the same job appeared on 4–5 different taxonomy pages with near-identical chrome — the structural duplicate-content engine that GSC's quality model flags. P9 replaces this with a precomputed `Job.categoryTags` array column queried via exact `has 'X'` containment.

**Rollback complexity:** moderate. The schema change is additive (new column with default `[]`), but reverting buildWhere clauses to OR-on-`contains` requires a code revert, not a DB rollback.

**Zero-downtime guarantee:** every buildWhere call goes through `withTagFallback(tag)` (defined in `lib/pseo/category-tagger.ts`), which produces a Prisma WHERE that matches:
1. Rows with `categoryTags has '<tag>'` (post-backfill, primary path), OR
2. Rows with empty `categoryTags` AND a legacy keyword/structural match (pre-backfill fallback).

So between step 1 (migration) and step 2 (backfill), pages render correctly via the fallback path. The fallback is slightly more permissive than the post-backfill behavior because the classifier's `excludeIfAlsoTagged` mutual exclusion can't be expressed at query time — that's the price of zero downtime, and it goes away once the backfill runs.

---

## Order of operations (must run in this order)

### Step 1 — Migration (additive, safe)

```bash
npx prisma migrate dev --name add_category_tags
# Review the generated SQL in prisma/migrations/.../migration.sql
# Expected: ALTER TABLE jobs ADD COLUMN category_tags TEXT[] DEFAULT '{}';
#           CREATE INDEX ... ON jobs USING gin (category_tags);
git add prisma/migrations/
```

Then for prod:
```bash
npx prisma migrate deploy   # via your CI/CD or Vercel deploy hook
```

After this step:
- All existing rows have `categoryTags = []` (Prisma default).
- New ingests via `lib/job-normalizer.ts` populate `categoryTags` automatically.
- Pages render correctly via the legacy keyword fallback in `withTagFallback()` — see "Zero-downtime guarantee" above. No rush on step 2, but you should still run it for the cleaner, deduplicated post-P9 behavior.

### Step 2 — Backfill existing rows

```bash
# Dry-run first (no writes, prints distribution)
npx tsx scripts/backfill-category-tags.ts

# Apply
npx tsx scripts/backfill-category-tags.ts --apply
```

The script:
- Pulls every job in batches of 500
- Runs `classifyJobTags` (pure function, identical to the ingest path)
- Writes `categoryTags` only for rows whose computed tags differ from current value
- Reports tag distribution at the end

Idempotent — safe to re-run. `--force` re-tags every row regardless of current state.

After this step: every active row has populated `categoryTags`. Pages render normally with tag-based filtering.

### Step 3 — Verify

Spot-check a high-volume taxonomy in prod:
```bash
# Compare counts before/after the swap. Expect FEWER jobs per page —
# that's the cross-taxonomy duplication being eliminated.
curl -s https://pmhnphiring.com/jobs/outpatient/california | grep -oE '\d+ Open' | head -1
```

If counts collapsed to 0, classifier is too strict — review `RULES` in `lib/pseo/category-tagger.ts` and tune.

### Step 4 — Re-aggregate pseoStats

```bash
# Trigger the aggregate-pseo cron once so pseoStats reflects new filter logic.
curl -X POST https://pmhnphiring.com/api/cron/aggregate-pseo \
  -H "Authorization: Bearer $CRON_SECRET"
```

Without this, the sitemap-index batch counts will lag the actual page renders for up to 12h (the normal cron cadence).

---

## Rollback

If pages start returning 0 jobs after Step 1 and Step 2 hasn't run yet:
- Run Step 2 immediately, OR
- Revert the `buildWhere` clauses in `lib/pseo/setting-state-config.ts` and `lib/pseo/category-city-template.tsx` to the pre-P9 OR-matchers (git revert the relevant commit).

The schema column itself is harmless — leave it in place even if you revert the code. Re-applying P9 later is a code-only change.

---

## What changed in code

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `categoryTags String[] @default([])` + GIN index |
| `lib/types.ts` | Added `categoryTags?: string[]` to `Job` interface |
| `lib/pseo/category-tagger.ts` | New — pure classifier, single source of truth |
| `lib/job-normalizer.ts` | Calls `classifyJobTags` at ingest, writes `categoryTags` |
| `lib/pseo/setting-state-config.ts` | All 13 buildWhere clauses use `categoryTags: { has: 'X' }` |
| `lib/pseo/category-city-template.tsx` | All 23 specialty buildWhere clauses use the new field |
| `scripts/backfill-category-tags.ts` | New — one-shot backfill (idempotent) |

---

## Tuning the classifier

`lib/pseo/category-tagger.ts` is the only place that decides which tags a job qualifies for. The two knobs:

1. **`RULES`** — keyword substrings + `matchDescription` flag per category. Default is title-only because description noise is rampant in healthcare job posts.
2. **`excludeIfAlsoTagged`** — the mutual-exclusion rule that breaks cross-taxonomy duplication. Order matters because rules run in `CANONICAL_CATEGORY_SLUGS` order — earlier-priority categories win.

After any tuning change, re-run the backfill with `--force` to retag all rows:
```bash
npx tsx scripts/backfill-category-tags.ts --apply --force
```
