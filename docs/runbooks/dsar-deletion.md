# Runbook: processing a DSAR deletion request manually

Applies to `data_requests` rows of `type = 'deletion'` that the intake endpoint
did not auto-execute (legacy rows filed before the authenticated-intake fix, or
rows a human moved back to manual handling). The daily `dsar-overdue` cron
surfaces these in Discord; nothing else drains them.

## Prerequisites

- Local checkout with `.env.prod` containing `PROD_DATABASE_URL`,
  `PROD_SUPABASE_URL`, and `PROD_SUPABASE_SERVICE_ROLE_KEY`.
- The `data_requests.id` of the request (from the Discord alert or a direct
  table query). The operator never needs to type the subject's email: the
  script resolves it from the row at runtime.

## Procedure

1. Dry run first. This is read-only and prints the subject's full data
   footprint (email masked) plus the exact deletion plan:

   ```
   npx tsx scripts/process-dsar-deletion.ts --request-id <id>
   ```

2. Review the footprint. The script enforces the same gate, but confirm by eye:

   - Safe to proceed without explicit identity verification ONLY when the
     footprint is low-risk: no applications, no messages, no purchases
     (employer jobs or charges), no resume documents. Typical shape: an empty
     profile created around the same day as the request, possibly with a job
     alert and an email lead row.
   - If any of that data exists, STOP. Move the request to `awaiting_id` and
     run explicit identity verification with the requester first. Deleting a
     populated account on an unverified request could destroy a real person's
     data at an impostor's demand.

3. Execute:

   ```
   npx tsx scripts/process-dsar-deletion.ts --request-id <id> --write
   ```

   The script refuses to write if the request is not a deletion, is already
   completed, or if the footprint has grown since the dry run (applications,
   messages, purchases, or resumes now present).

4. Verify the completion summary it prints, and that the `data_requests` row
   now shows `status = 'completed'`, a populated `resolution_note`, and cleared
   `requester_ip` / `user_agent`. An `audit_logs` row with action
   `data.request.completed` is written as the permanent record.

## What the script deletes (mirrors the purge-soft-deleted cron)

1. Storage files (resume, avatar) when present.
2. `candidate_embeddings` row.
3. `email_sends` rows anonymized in place (platform redaction address).
4. `job_alerts` rows for the email (before `email_leads`: FK restricts).
5. `email_leads` row for the email.
6. `user_profiles` row. FK cascades remove applications, messages,
   conversations, candidate records, resume documents and analyses, autofill
   data, saved-candidate links, employer candidate alerts, and lifecycle email
   sends. `employer_jobs.user_id` is set null by design (quota anchor survives).
7. Supabase auth identity via the admin API, freeing the address to
   re-register.
8. `data_requests` completion update, then the audit log row.

Rows with no FK to the profile (`saved_jobs`, `push_subscriptions`,
`candidate_recommendations`) become unlinkable pseudonymous rows once the
profile and auth identity are gone; the platform's own purge cron leaves them
too, and this script matches that scope. Their counts are reported in the dry
run for the record.

## Identity basis (why no explicit verification for the low-risk case)

The deletion targets exactly the data held for the email address the requester
supplied. CCPA regulations allow verifying a request to a reasonable degree of
certainty by matching it against data already held, scaled to the sensitivity
of the data and the risk of harm. When the footprint is an empty same-day
account, the worst-case outcome of a spoofed request is deletion of an empty
shell, so the supplied address is a proportionate basis. This shortcut is
never acceptable for accounts with applications, messages, purchases, or
resumes: those require the explicit verification flow before any deletion.

## Known gaps (as of 2026-08)

- The intake endpoint does not send the requester an acknowledgment or
  completion email; completion is only recorded in the database and audit log.
- There is no admin UI listing `data_requests`; the Discord `dsar-overdue`
  alert and direct table queries are the only visibility.
