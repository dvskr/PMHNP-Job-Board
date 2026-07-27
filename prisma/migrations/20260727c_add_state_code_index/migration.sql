-- The state filter, the /jobs/state/[state] pages, and the sitemap state
-- counts all query jobs by state_code, but only "state" (the full name) was
-- ever indexed — every state-scoped query walked the table. Plain btree:
-- state_code is written canonically as an uppercase 2-letter code by
-- lib/location-parser.ts, and the hot paths compare it with plain equality.
CREATE INDEX IF NOT EXISTS "jobs_state_code_idx" ON "jobs"("state_code");
