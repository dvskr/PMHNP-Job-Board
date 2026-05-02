-- 1. Tie UserFeedback rows back to a Supabase auth user. Nullable so
--    pre-existing anonymous feedback rows don't break.
ALTER TABLE "user_feedback"
  ADD COLUMN IF NOT EXISTS "user_id" TEXT;

CREATE INDEX IF NOT EXISTS "user_feedback_user_id_idx"
  ON "user_feedback" ("user_id");

-- 2. New table for employer testimonials (separate from rating-driven feedback).
--    Stores structured consent + display preferences so we can confidently
--    feature opted-in testimonials on public pages without grepping a freetext
--    message field.
CREATE TABLE IF NOT EXISTS "employer_testimonials" (
  "id"              TEXT        PRIMARY KEY,
  "user_id"         TEXT        NOT NULL,
  "employer_job_id" TEXT,
  "employer_name"   TEXT        NOT NULL,
  "content"         TEXT        NOT NULL,
  "rating"          INTEGER,
  "consent"         BOOLEAN     NOT NULL DEFAULT FALSE,
  "display_as"      TEXT        NOT NULL DEFAULT 'initial',
  "featured_at"     TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "employer_testimonials_user_id_idx"
  ON "employer_testimonials" ("user_id");
CREATE INDEX IF NOT EXISTS "employer_testimonials_employer_job_id_idx"
  ON "employer_testimonials" ("employer_job_id");
CREATE INDEX IF NOT EXISTS "employer_testimonials_featured_at_idx"
  ON "employer_testimonials" ("featured_at");
