-- Normalize the legacy single-tier model to a single canonical value.
--
-- Background: the codebase used to expose three tiers ('starter' | 'growth' | 'premium')
-- but every code path collapsed to identical features long ago. Existing rows in
-- production have a mix of legacy values (mostly 'growth' for paid posts, 'starter'
-- for the schema default). This migration:
--   1. Backfills all existing rows to 'pro' so reads no longer have to branch.
--   2. Changes the column default from 'starter' to 'pro' so any insert that omits
--      pricing_tier (none today, but defensive) gets the canonical value.
--
-- Safe rollback: SET DEFAULT 'starter'; UPDATE rows back if you have the audit log.
-- Behavior post-migration: every employer_jobs row has pricing_tier='pro'. Read
-- branches in the code accept 'pro' alongside legacy values, so even if rollback
-- happens to a state with mixed values, the application keeps working.

BEGIN;

UPDATE employer_jobs
SET pricing_tier = 'pro'
WHERE pricing_tier IN ('starter', 'growth', 'premium');

ALTER TABLE employer_jobs
  ALTER COLUMN pricing_tier SET DEFAULT 'pro';

COMMIT;
