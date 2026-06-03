/**
 * E2 regression — job-alerts-service discarded the Resend batch response, so
 * every EmailSend row was written with resendId=null and status='sent' even on
 * a silent API failure (Resend returns errors, it does not throw). That is why
 * prod showed "sent 34,769" vs "delivered 1,183" — webhooks could not correlate.
 *
 * The capture + row-building logic is extracted into pure helpers so it is
 * deterministic and testable without mocking the whole alert pipeline. The
 * service now feeds the real Resend response through these.
 */
import { describe, it, expect } from 'vitest';
import {
  interpretResendBatch,
  buildJobAlertEmailRows,
} from '@/lib/email/batch-send-result';

describe('interpretResendBatch', () => {
  it('maps a successful response to ok + the per-email message IDs (in order)', () => {
    // Resend's real shape is nested: { data: { data: [{id}] } }.
    const out = interpretResendBatch({
      data: { data: [{ id: 'msg-1' }, { id: 'msg-2' }] },
      error: null,
    });
    expect(out).toEqual({ ok: true, ids: ['msg-1', 'msg-2'] });
  });

  it('treats a non-throwing API error as a permanent failure with its reason', () => {
    const out = interpretResendBatch({
      data: null,
      error: { message: 'Invalid API key' },
    });
    expect(out).toEqual({ ok: false, reason: 'Invalid API key' });
  });

  it('tolerates a null data on success (ids = [])', () => {
    const out = interpretResendBatch({ data: null, error: null });
    expect(out).toEqual({ ok: true, ids: [] });
  });
});

describe('buildJobAlertEmailRows', () => {
  const batch = [
    { email: 'a@example.com', subject: 'Sub A' },
    { email: 'b@example.com', subject: 'Sub B' },
  ];

  it('attaches each Resend message ID to the matching row + status "sent"', () => {
    const rows = buildJobAlertEmailRows(batch, { ok: true, ids: ['msg-1', 'msg-2'] });
    expect(rows).toEqual([
      { to: 'a@example.com', subject: 'Sub A', emailType: 'job_alert', resendId: 'msg-1', status: 'sent' },
      { to: 'b@example.com', subject: 'Sub B', emailType: 'job_alert', resendId: 'msg-2', status: 'sent' },
    ]);
  });

  it('writes resendId=null + status="failed" for a failed batch (no false "sent" rows)', () => {
    const rows = buildJobAlertEmailRows(batch, { ok: false, reason: 'rate limited' });
    expect(rows.every((r) => r.resendId === null)).toBe(true);
    expect(rows.every((r) => r.status === 'failed')).toBe(true);
  });

  it('falls back to null when fewer IDs are returned than emails (no mis-attribution crash)', () => {
    const rows = buildJobAlertEmailRows(batch, { ok: true, ids: ['msg-1'] });
    expect(rows[0].resendId).toBe('msg-1');
    expect(rows[1].resendId).toBeNull();
    expect(rows[1].status).toBe('sent');
  });
});
