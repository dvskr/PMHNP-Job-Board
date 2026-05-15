-- Per-recipient attribution for shortlink clicks. Adds a nullable
-- recipient_lead_id column populated from the `?r=<lead_id>` query
-- parameter on inbound /r/<code> requests. Loose coupling — not a FK —
-- because the same column tracks multiple lead types over time
-- (ProgramDirectorLead today, EmployerLead next).
--
-- The accompanying index supports the per-recipient funnel query:
--   SELECT COUNT(*) FROM shortlink_clicks
--    WHERE recipient_lead_id = $1 AND created_at >= $2
-- which the campaign dashboard runs once per lead row.
--
-- See lib/shortlinks/tracker.ts and app/r/[code]/route.ts for the write
-- path; docs/runbooks/program-directors-campaign.md §3 Step 2 for context.

ALTER TABLE "shortlink_clicks"
    ADD COLUMN "recipient_lead_id" TEXT;

CREATE INDEX "shortlink_clicks_recipient_lead_id_created_at_idx"
    ON "shortlink_clicks" ("recipient_lead_id", "created_at");
