-- Phase 0 Sprint 0.3 — pgvector extension + embedding tables.
--
-- Adds the `vector` extension to the database and provisions storage for
-- (a) per-job and (b) per-candidate embeddings produced by the embedding
-- worker (lib/inngest/functions/embeddings.ts). Sprint 0.3.6's backfill script
-- populates rows for every existing job + active candidate.
--
-- Embedding dimension = 1536 (text-embedding-3-small). The IVFFlat index uses
-- `lists = ceil(sqrt(N))` heuristic; at our scale (~18 jobs today, ~5k at PMF)
-- a single list is fine — Sprint 0.3.9 benchmarks vs HNSW past 100k rows.
--
-- Forward-only, additive. Backfill happens via `node scripts/backfill-embeddings.mjs`,
-- not via this migration.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── job_embeddings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "job_embeddings" (
    "job_id"        TEXT          NOT NULL,
    "embedding"     vector(1536)  NOT NULL,
    "model"         TEXT          NOT NULL DEFAULT 'text-embedding-3-small',
    "input_hash"    TEXT          NOT NULL,                                 -- sha256 of the embedded text; lets the worker skip re-embedding when content didn't change
    "updated_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_embeddings_pkey" PRIMARY KEY ("job_id"),
    CONSTRAINT "job_embeddings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE
);

-- ANN index — IVFFlat with cosine distance.
CREATE INDEX IF NOT EXISTS "job_embeddings_cosine_idx"
    ON "job_embeddings" USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 10);

CREATE INDEX IF NOT EXISTS "job_embeddings_updated_at_idx"
    ON "job_embeddings" ("updated_at" DESC);

-- ── candidate_embeddings ──────────────────────────────────────────────
-- Keyed on user_profiles.supabase_id (the Supabase auth id) — that's the
-- stable identifier the rest of the AI pipeline already uses to identify a
-- candidate. user_profiles.id is the internal cuid; both work but supabase_id
-- is the foreign key the scorer + parser pass around.
CREATE TABLE IF NOT EXISTS "candidate_embeddings" (
    "supabase_id"   TEXT          NOT NULL,
    "embedding"     vector(1536)  NOT NULL,
    "model"         TEXT          NOT NULL DEFAULT 'text-embedding-3-small',
    "input_hash"    TEXT          NOT NULL,
    "updated_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_embeddings_pkey" PRIMARY KEY ("supabase_id")
);
-- Note: NO foreign-key constraint to user_profiles. Embedding refresh races
-- with profile delete; the worker treats missing rows as no-op rather than
-- crashing. Orphans are cleaned by the lifecycle cron.

CREATE INDEX IF NOT EXISTS "candidate_embeddings_cosine_idx"
    ON "candidate_embeddings" USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 10);

CREATE INDEX IF NOT EXISTS "candidate_embeddings_updated_at_idx"
    ON "candidate_embeddings" ("updated_at" DESC);
