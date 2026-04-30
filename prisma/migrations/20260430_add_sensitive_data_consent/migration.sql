-- Sensitive-data consent (audit gap #12).
--
-- The user_profiles table already stores GDPR Art. 9 / CPRA "sensitive
-- personal information" categories (race/ethnicity, disability status,
-- veteran status, gender) plus federal credentialing identifiers
-- (NPI, DEA). Those fields require a SEPARATE consent under both
-- regulations — using them under the general TOS consent is not enough.
--
-- We add a boolean + timestamp on user_profiles. The profile form will
-- only persist EEO / DEA / NPI values when sensitive_data_consent is
-- true. Employer-facing serializers redact those fields when false.
--
-- Forward-only, additive. Existing rows default to FALSE — the next
-- profile save by those users will surface the toggle.

ALTER TABLE "user_profiles"
    ADD COLUMN IF NOT EXISTS "sensitive_data_consent" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "user_profiles"
    ADD COLUMN IF NOT EXISTS "sensitive_data_consent_at" TIMESTAMP(3);
