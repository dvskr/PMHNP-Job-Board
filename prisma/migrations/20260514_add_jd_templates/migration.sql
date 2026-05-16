-- Per-employer saved JD templates. Surfaced as the "My Templates"
-- category in the post-job template picker. Each employer keeps their
-- own library; org-level sharing is out of scope for first ship.
--
-- Forward-only, additive, idempotent.

CREATE TABLE IF NOT EXISTS "jd_templates" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "label"      VARCHAR(120) NOT NULL,
  "summary"    VARCHAR(300),
  "body"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "jd_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "jd_templates_user_id_created_at_idx"
  ON "jd_templates" ("user_id", "created_at" DESC);
