-- First-party attribution log for social-campaign short links served by
-- app/r/[code]. One row per request; the route handler enforces bot
-- filtering, IP hashing, and rate limiting before insert.
--
-- See lib/shortlinks/tracker.ts for the write path and prisma/schema.prisma
-- model ShortLinkClick for column-level docs.

CREATE TABLE "shortlink_clicks" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "job_id" INTEGER NOT NULL,
    "destination_path" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "referer" TEXT,
    "country" VARCHAR(2),
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "bot_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlink_clicks_pkey" PRIMARY KEY ("id")
);

-- Campaign × platform aggregation: "how many real clicks did Facebook drive
-- to the May 2026 campaign?" The is_bot column lives in a parallel index so
-- bot-free totals stay cheap to compute without scanning the table.
CREATE INDEX "shortlink_clicks_campaign_platform_created_at_idx"
    ON "shortlink_clicks"("campaign", "platform", "created_at");

CREATE INDEX "shortlink_clicks_campaign_is_bot_created_at_idx"
    ON "shortlink_clicks"("campaign", "is_bot", "created_at");

-- Per-code drill-down: "which job got clicked from Instagram?"
CREATE INDEX "shortlink_clicks_code_created_at_idx"
    ON "shortlink_clicks"("code", "created_at");

-- Time-series scans (daily/weekly rollups, retention sweeps).
CREATE INDEX "shortlink_clicks_created_at_idx"
    ON "shortlink_clicks"("created_at");

-- Idempotency lookup: "have I seen this (code, ip_hash) within the last
-- N seconds?" Partial index keeps it small by excluding bot rows that we
-- never dedupe against.
CREATE INDEX "shortlink_clicks_code_ip_hash_created_at_idx"
    ON "shortlink_clicks"("code", "ip_hash", "created_at")
    WHERE "is_bot" = false AND "ip_hash" IS NOT NULL;
