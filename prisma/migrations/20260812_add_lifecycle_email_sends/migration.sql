-- Lifecycle emails (2026-08): one row per lifecycle email delivered to a user.
-- The (user_id, email_id) unique pair enforces "never repeat an emailId per
-- user" and doubles as the claim row for the cron's claim-first send.
-- Hand-authored (repo convention; shadow-DB replay is broken by pre-existing
-- drift, so `prisma migrate dev` cannot generate this automatically).

-- CreateTable
CREATE TABLE "lifecycle_email_sends" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_email_sends_user_id_email_id_key" ON "lifecycle_email_sends"("user_id", "email_id");

-- CreateIndex
CREATE INDEX "lifecycle_email_sends_user_id_sent_at_idx" ON "lifecycle_email_sends"("user_id", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "lifecycle_email_sends_sent_at_idx" ON "lifecycle_email_sends"("sent_at");

-- AddForeignKey
ALTER TABLE "lifecycle_email_sends" ADD CONSTRAINT "lifecycle_email_sends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
