-- Data-only backfill (no schema changes). Pairs with the ApplyButton.tsx
-- fix that started bumping `apply_click_count` on the platform-apply
-- ("Easy Apply") path. Before that fix, the counter only incremented for
-- external-apply jobs — Easy Apply jobs reported 0 clicks even when
-- candidates submitted real applications via InPlatformApplyForm.
--
-- This catches up the historical counter to reflect reality at the moment
-- of deploy. After this runs, future clicks on either path increment it
-- correctly via the code fix.
--
-- GREATEST() preserves any external-click history that's already higher
-- than the application count (some posts have both apply paths in play).
-- Limited to source_type = 'employer' so we don't touch aggregated jobs
-- that have their own click semantics.
--
-- Idempotent: re-running yields the same result because GREATEST is stable.

BEGIN;

UPDATE jobs j
SET apply_click_count = GREATEST(
  apply_click_count,
  (SELECT COUNT(*)::int FROM job_applications WHERE job_id = j.id)
)
WHERE source_type = 'employer'
  AND EXISTS (SELECT 1 FROM job_applications WHERE job_id = j.id);

COMMIT;
