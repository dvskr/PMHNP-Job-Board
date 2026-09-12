-- Track the Checkout session a pending employer_jobs row is waiting on
-- (2026-09 paid-first follow-up). Pending rows are excluded from the
-- first-post discount count, and Checkout sessions do not expire on their
-- own, so one identity could keep several payable discounted sessions open by
-- pressing Back or opening more tabs. /api/create-checkout now records the
-- session here and expires the stale ones before it counts.
ALTER TABLE "employer_jobs" ADD COLUMN "stripe_session_id" TEXT;

-- The gate looks these up by identity plus payment_status, then filters to
-- rows that carry a session, so no index is added for this column alone.
