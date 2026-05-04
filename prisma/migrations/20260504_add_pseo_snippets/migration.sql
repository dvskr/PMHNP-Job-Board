-- pSEO content uniqueness layer (P3.4): optional LLM-generated narrative
-- overrides. The page renderer prefers these when present, falls back to the
-- deterministic narrative in lib/pseo/city-narrative.ts when not.
--
-- Forward-only, additive. Safe to run repeatedly via IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS "city_snippets" (
    "id"           TEXT PRIMARY KEY,
    "city_slug"    TEXT NOT NULL UNIQUE,
    "body"         TEXT NOT NULL,
    "source_model" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at"  TIMESTAMP(3),
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "city_snippets_approved_at_idx"
    ON "city_snippets" ("approved_at");

CREATE TABLE IF NOT EXISTS "category_city_snippets" (
    "id"            TEXT PRIMARY KEY,
    "category_slug" TEXT NOT NULL,
    "city_slug"     TEXT NOT NULL,
    "body"          TEXT NOT NULL,
    "source_model"  TEXT,
    "generated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at"   TIMESTAMP(3),
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "category_city_snippets_category_city_idx"
    ON "category_city_snippets" ("category_slug", "city_slug");

CREATE INDEX IF NOT EXISTS "category_city_snippets_approved_at_idx"
    ON "category_city_snippets" ("approved_at");
