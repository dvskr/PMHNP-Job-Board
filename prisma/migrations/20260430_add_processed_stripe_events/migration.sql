-- Audit #3: Webhook idempotency.
-- Stripe redelivers `checkout.session.completed` on transient failures or
-- manual replays. Without dedupe, the handler sends duplicate confirmation
-- emails and re-runs state writes. The webhook handler now inserts a row
-- here BEFORE processing each event; on UNIQUE violation it returns 200
-- and skips, preventing double-processing.

CREATE TABLE "processed_stripe_events" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "event_id"     TEXT NOT NULL,
    "event_type"   TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "processed_stripe_events_event_id_key"
    ON "processed_stripe_events"("event_id");

CREATE INDEX "processed_stripe_events_event_type_idx"
    ON "processed_stripe_events"("event_type");
