-- GSC Indexing Crisis (P2.1): backlog drainage queue.
--
-- Holds URLs we want to proactively de-index from Google. Seeded from the
-- GSC bulk exports stored in `GSC ISSUES/` and from sitemap-diff / edge-log
-- scrapers. Drained by /api/cron/historical-deindex (every 6h) which
-- HEAD-checks each URL and submits URL_DELETED to the Google Indexing API
-- + IndexNow when the URL actually returns 4xx/5xx.
--
-- Forward-only, additive. Safe to run repeatedly via IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS "deindex_queue" (
    "id"          TEXT PRIMARY KEY,
    "url"         TEXT NOT NULL UNIQUE,
    "source"      TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "attempt"     INTEGER NOT NULL DEFAULT 0,
    "lastError"   TEXT,
    "addedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "deindex_queue_status_addedAt_idx"
    ON "deindex_queue" ("status", "addedAt");

CREATE INDEX IF NOT EXISTS "deindex_queue_source_idx"
    ON "deindex_queue" ("source");
