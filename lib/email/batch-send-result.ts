/**
 * lib/email/batch-send-result.ts — pure helpers for E2.
 *
 * The Resend Batch API returns `{ data: { id }[] | null, error }` and does NOT
 * throw on API-level errors. job-alerts-service used to ignore that return value,
 * so it (1) never persisted the per-email message IDs (resendId stayed null,
 * breaking delivery/bounce webhook correlation) and (2) wrote status='sent' rows
 * even when Resend rejected the batch. These helpers make the capture explicit
 * and deterministic.
 */

/**
 * Mirrors the Resend SDK `CreateBatchResponse` shape exactly:
 *   { data: { data: { id }[] } | null, error: ErrorResponse | null }
 * The per-email IDs live at `data.data`, NOT `data` — reading the wrong level
 * silently drops every resendId (the original E2 bug this guards against).
 */
export interface ResendBatchResponse {
  data: { data: { id: string }[] } | null;
  error: { message: string } | null;
}

export type BatchOutcome =
  | { ok: true; ids: string[] }
  | { ok: false; reason: string };

/** Interpret a (non-throwing) Resend batch response into a success/failure outcome. */
export function interpretResendBatch(res: ResendBatchResponse): BatchOutcome {
  if (res.error) return { ok: false, reason: res.error.message };
  return { ok: true, ids: (res.data?.data ?? []).map((d) => d.id) };
}

export interface JobAlertEmailRowInput {
  email: string;
  subject: string;
}

export interface JobAlertEmailRow {
  to: string;
  subject: string;
  emailType: 'job_alert';
  resendId: string | null;
  status: 'sent' | 'failed';
}

/**
 * Build the EmailSend rows for a batch. On success each row carries the Resend
 * message ID at the matching index (Resend guarantees response order matches the
 * request order); a short ID array falls back to null rather than mis-attributing.
 * On failure every row is status='failed' with resendId=null, so the DB reflects
 * the real outcome instead of a phantom "sent".
 */
export function buildJobAlertEmailRows(
  batch: JobAlertEmailRowInput[],
  outcome: BatchOutcome,
): JobAlertEmailRow[] {
  return batch.map((b, idx) => ({
    to: b.email,
    subject: b.subject,
    emailType: 'job_alert',
    resendId: outcome.ok ? (outcome.ids[idx] ?? null) : null,
    status: outcome.ok ? 'sent' : 'failed',
  }));
}
