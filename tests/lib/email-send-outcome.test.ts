/**
 * sendAndLog is the choke point every email passes through, and three things
 * about it were wrong at once:
 *
 *   1. Resend reports an API-level rejection in the response envelope instead
 *      of throwing, and the wrapper logged the EmailSend row as 'sent' anyway.
 *      Senders then returned { success: true } for mail that never left, which
 *      is how purge-inactive-users could stamp its "we warned them" marker on a
 *      refused send and hand the account to the deletion pipeline.
 *   2. Marketing suppression was every caller's job, and the callers that
 *      forgot kept mailing people who had used the unsubscribe link in the
 *      footer of that very email.
 *   3. The emergency brake (OUTBOUND_MESSAGING_PAUSED) was consulted by three
 *      senders out of all of them.
 *
 * These tests pin the fixed behaviour at the choke point plus the named
 * exemptions: transactional mail and the two user-requested marketing types.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  db: {
    emailSend: { create: vi.fn() },
    emailLead: { findUnique: vi.fn(), create: vi.fn() },
    userProfile: { findUnique: vi.fn() },
  },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.unmock('@/lib/email-service');

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.send };
    batch = { send: vi.fn() };
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/lib/logger', () => ({
  logger: { info: h.info, warn: h.warn, error: h.error, debug: vi.fn() },
}));

import { sendAndLog, sendInactivityPurgeWarningEmail } from '@/lib/email-service';

const RECIPIENT = 'talent@examplepsych.example';
const DELIVERED = { data: { id: 'resend-msg-fic-1' }, error: null };
const REJECTED = {
  data: null,
  error: { name: 'invalid_parameter', message: 'Invalid `to` field: not a routable address' },
};

/** Nobody has opted out unless a test says so. */
function noOptOut() {
  h.db.emailLead.findUnique.mockResolvedValue({
    isSuppressed: false,
    isSubscribed: true,
    unsubscribeToken: 'unsub-fic-1',
  });
  h.db.userProfile.findUnique.mockResolvedValue({ emailSuppressed: false });
}

function lastLoggedRow() {
  return h.db.emailSend.create.mock.calls[0]?.[0]?.data as
    | { status?: string; resendId?: string | null; metadata?: Record<string, unknown> }
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OUTBOUND_MESSAGING_PAUSED;
  h.send.mockResolvedValue(DELIVERED);
  h.db.emailSend.create.mockResolvedValue({ id: 'emailsend-fic-1' });
  noOptOut();
});

afterEach(() => {
  delete process.env.OUTBOUND_MESSAGING_PAUSED;
});

describe('sendAndLog — the provider envelope is the truth', () => {
  it('stamps a delivered send as sent, with the provider id for the webhook', async () => {
    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'Your posting is live', html: '<p>ok</p>' },
      'job_confirmation',
    );

    expect(result.error).toBeNull();
    expect(lastLoggedRow()?.status).toBe('sent');
    expect(lastLoggedRow()?.resendId).toBe('resend-msg-fic-1');
  });

  it('stamps a refused send as failed and keeps the reason on the row', async () => {
    h.send.mockResolvedValue(REJECTED);

    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'Your posting is live', html: '<p>ok</p>' },
      'job_confirmation',
      { jobId: 'job-fic-1' },
    );

    expect(result.error?.message).toContain('Invalid');
    const row = lastLoggedRow();
    expect(row?.status).toBe('failed');
    expect(row?.resendId).toBeNull();
    // The original metadata survives: the row is still the analytics record.
    expect(row?.metadata).toMatchObject({ jobId: 'job-fic-1' });
    expect(row?.metadata).toHaveProperty('providerError');
    expect(h.error).toHaveBeenCalledWith(
      'Resend rejected the send',
      expect.objectContaining({ name: 'invalid_parameter' }),
      expect.objectContaining({ emailType: 'job_confirmation' }),
    );
  });
});

describe('sendAndLog — marketing opt-out choke point', () => {
  it('refuses a marketing send to an address that unsubscribed by hand', async () => {
    // isSubscribed=false is what /api/email/unsubscribe writes; isSuppressed
    // stays false, which is exactly the state the old check could not see.
    h.db.emailLead.findUnique.mockResolvedValue({
      isSuppressed: false,
      isSubscribed: false,
      unsubscribeToken: 'unsub-fic-1',
    });

    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'Monthly report', html: '<p>stats</p>' },
      'performance_report',
    );

    expect(result.error?.name).toBe('marketing_opted_out');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.emailSend.create).not.toHaveBeenCalled();
  });

  it('still delivers transactional mail to an unsubscribed address', async () => {
    h.db.emailLead.findUnique.mockResolvedValue({
      isSuppressed: false,
      isSubscribed: false,
      unsubscribeToken: 'unsub-fic-1',
    });

    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'Application received', html: '<p>ok</p>' },
      'application_confirmation',
    );

    expect(result.error).toBeNull();
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('still delivers the guide the same person just asked for', async () => {
    // Named exemption: USER_REQUESTED_EMAIL_TYPES. Swallowing this reads as a
    // broken download, not as respected consent.
    h.db.emailLead.findUnique.mockResolvedValue({
      isSuppressed: false,
      isSubscribed: false,
      unsubscribeToken: 'unsub-fic-1',
    });

    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'Your salary guide', html: '<p>pdf</p>' },
      'salary_guide',
    );

    expect(result.error).toBeNull();
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});

describe('sendAndLog — emergency brake', () => {
  it('refuses automated marketing mail while OUTBOUND_MESSAGING_PAUSED=1', async () => {
    process.env.OUTBOUND_MESSAGING_PAUSED = '1';

    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'New candidates', html: '<p>digest</p>' },
      'candidate_alert',
    );

    expect(result.error?.name).toBe('outbound_paused');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('never pauses transactional mail', async () => {
    process.env.OUTBOUND_MESSAGING_PAUSED = '1';

    const result = await sendAndLog(
      { from: '', to: RECIPIENT, subject: 'Your posting expires soon', html: '<p>renew</p>' },
      'expiry_warning',
    );

    expect(result.error).toBeNull();
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});

describe('sendInactivityPurgeWarningEmail — the marker must follow the mail', () => {
  it('reports failure when the provider refuses, so the purge marker is not stamped', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    });

    const result = await sendInactivityPurgeWarningEmail('dormant@examplepsych.example', 30);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Too many requests');
  });

  it('reports success when the provider accepts', async () => {
    const result = await sendInactivityPurgeWarningEmail('dormant@examplepsych.example', 30);

    expect(result.success).toBe(true);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});
