-- Audit follow-up: when an employer manually unpublishes their posting we
-- want to know WHY. Powers the Tier-3 outreach question ("filled the role?
-- too many bad applicants? want to repost?") and gives us a feedback signal
-- to improve job matching/quality.
--
-- Two columns:
--   unpublish_reason       — short enum string from a fixed-choice modal
--   unpublish_reason_note  — optional free-text "Other" input
--
-- Both null when the job has never been manually unpublished, or when the
-- employer chose not to provide a reason. NEVER cleared (audit trail) — if
-- the employer republishes and unpublishes again, the most recent value wins.
ALTER TABLE jobs
  ADD COLUMN unpublish_reason       VARCHAR(60),
  ADD COLUMN unpublish_reason_note  TEXT,
  ADD COLUMN unpublished_at         TIMESTAMP(3);

CREATE INDEX jobs_unpublish_reason_idx ON jobs(unpublish_reason)
  WHERE unpublish_reason IS NOT NULL;
