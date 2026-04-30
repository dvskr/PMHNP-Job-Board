-- Create the candidate_tags table.
--
-- Background: prisma/schema.prisma has had model CandidateTag with
-- @@map("candidate_tags") since the model was introduced, but no
-- migration was ever generated to create the table. Verified via
-- scripts/diagnose-schema-drift.ts on 2026-04-30 against prod.
--
-- Routes affected: /api/employer/tags GET/POST/DELETE all hit
-- prisma.candidateTag.* and would produce P2021 ('table does not exist')
-- errors on every employer call. The table just hasn't been exercised
-- yet by any employer touching the tags UI, which is why we hadn't seen
-- log spam — but the moment one does, the dashboard breaks.
--
-- Mirrors the model exactly:
--   id          TEXT primary key (cuid)
--   employerId  → user_profiles.id (cascade delete)
--   name        TEXT
--   color       TEXT default #0D9488
--   createdAt   timestamp default now()
--   UNIQUE (employer_id, name)
--   INDEX  (employer_id)

CREATE TABLE IF NOT EXISTS "candidate_tags" (
    "id"          TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "color"       TEXT NOT NULL DEFAULT '#0D9488',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_tags_pkey" PRIMARY KEY ("id")
);

-- Composite uniqueness so an employer can't create two tags with the
-- same name. Schema also expresses this as @@unique([employerId, name]).
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_tags_employer_id_name_key"
    ON "candidate_tags"("employer_id", "name");

CREATE INDEX IF NOT EXISTS "candidate_tags_employer_id_idx"
    ON "candidate_tags"("employer_id");

-- FK back to user_profiles. ON DELETE CASCADE so when an employer is
-- deleted their tags go with them.
ALTER TABLE "candidate_tags"
    ADD CONSTRAINT "candidate_tags_employer_id_fkey"
    FOREIGN KEY ("employer_id") REFERENCES "user_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
