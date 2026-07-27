-- Quota identity hygiene (2026-07-27, follow-up to 20260727b).
--
-- Two leftovers from the first rewrite, both flagged by review:
--
-- 1. NON-FREE ROWS carried form-derived identity. Their quota_domain was
--    snapshotted from the form-typed CONTACT email (the checkout route wrote
--    it that way until today), and 20260727b then minted dom:<that domain>
--    into quota_keys for every row, free or not. Those keys are inert today
--    because every predicate filters payment_status = 'free', but they are a
--    loaded trap: the moment any rule widens past 'free', form-typed input
--    starts blocking third parties. Identity columns must carry
--    session-derived data or nothing, so non-free rows drop to the acct:
--    key alone and a NULL domain. The form contact email itself stays
--    available on the row (contact_email) for reporting.
--
-- 2. NO CONSUMER SCREEN. buildQuotaKeys never emits dom:<consumer provider>
--    (two strangers on gmail must not share a quota), but the 20260727b SQL
--    applied no such screen. Free rows cannot normally carry one (the gate
--    refuses consumer signups), so this is defense in depth against manual
--    rows; the list mirrors FREE_EMAIL_DOMAINS in lib/employer-quota.ts as
--    of this date.

-- 1. Non-free rows: acct-only keys, no domain claim.
UPDATE "employer_jobs"
SET
  "quota_keys" = CASE
    WHEN "user_id" IS NOT NULL AND btrim("user_id") <> ''
      THEN ARRAY['acct:' || lower(btrim("user_id"))]
    ELSE '{}'::text[]
  END,
  "quota_domain" = NULL
WHERE "payment_status" <> 'free';

-- 2. Free rows: strip any consumer-provider dom: key.
UPDATE "employer_jobs"
SET "quota_keys" = (
  SELECT COALESCE(ARRAY_AGG(k), '{}')
  FROM UNNEST("quota_keys") AS k
  WHERE k NOT IN (
    'dom:gmail.com', 'dom:yahoo.com', 'dom:hotmail.com', 'dom:outlook.com',
    'dom:aol.com', 'dom:icloud.com', 'dom:mail.com', 'dom:protonmail.com',
    'dom:ymail.com', 'dom:live.com', 'dom:msn.com', 'dom:googlemail.com',
    'dom:proton.me', 'dom:gmx.com', 'dom:yandex.com', 'dom:zoho.com',
    'dom:hey.com', 'dom:fastmail.com', 'dom:me.com', 'dom:mac.com'
  )
)
WHERE "payment_status" = 'free'
  AND "quota_keys" && ARRAY[
    'dom:gmail.com', 'dom:yahoo.com', 'dom:hotmail.com', 'dom:outlook.com',
    'dom:aol.com', 'dom:icloud.com', 'dom:mail.com', 'dom:protonmail.com',
    'dom:ymail.com', 'dom:live.com', 'dom:msn.com', 'dom:googlemail.com',
    'dom:proton.me', 'dom:gmx.com', 'dom:yandex.com', 'dom:zoho.com',
    'dom:hey.com', 'dom:fastmail.com', 'dom:me.com', 'dom:mac.com'
  ];
