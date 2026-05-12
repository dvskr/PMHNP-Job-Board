-- Adds the composite index needed to make the admin stats endpoint's
--   SELECT COUNT(DISTINCT "ip_hash") FROM "shortlink_clicks"
--    WHERE "campaign" = ? AND "created_at" >= ? AND "created_at" < ?
-- run as an index scan instead of a filtered table scan.
--
-- Follow-up to migration 20260512_add_shortlink_clicks. The original
-- index set covered platform/content/code/created_at queries but did
-- not include ip_hash, so the distinct-IP rollup on the admin
-- dashboard table-scanned the time-filtered slice on every load.

CREATE INDEX "shortlink_clicks_campaign_created_at_ip_hash_idx"
    ON "shortlink_clicks"("campaign", "created_at", "ip_hash");
