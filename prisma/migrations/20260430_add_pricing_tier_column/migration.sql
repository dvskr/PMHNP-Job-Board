-- Repair migration (added 2026-07-03, pre-dated so it sorts BEFORE
-- 20260430_normalize_pricing_tier_to_pro).
--
-- Background: employer_jobs.pricing_tier was created on production via
-- `prisma db push` only — no migration ever added it. The normalize
-- migration that follows UPDATEs the column, so a fresh-database
-- `prisma migrate deploy` aborted there with `column "pricing_tier"
-- does not exist`. This folder name sorts before the normalize migration
-- ('add_p...' < 'normalize...'), creating the column first on fresh
-- databases while being an idempotent no-op on production.
--
-- Default is 'starter' (the historical default); the normalize migration
-- immediately rewrites rows and the default to 'pro', matching schema.prisma.

ALTER TABLE "employer_jobs"
  ADD COLUMN IF NOT EXISTS "pricing_tier" TEXT NOT NULL DEFAULT 'starter';
