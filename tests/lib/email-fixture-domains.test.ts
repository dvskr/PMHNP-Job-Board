/**
 * sendAndLog refuses test-fixture recipient domains at the choke point.
 *
 * The E2E accounts live on pmhnptest.com, a domain that receives no mail, so
 * every applicant status change, message notification or confirmation sent
 * to one of them would hard-bounce and burn sender reputation. This locks the
 * domain (and the older fixture domains) onto the refusal list and proves the
 * refusal happens before Resend or the EmailSend log are touched.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  db: {
    emailSend: { create: vi.fn() },
    emailLead: { findUnique: vi.fn(), create: vi.fn() },
  },
  warn: vi.fn(),
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
  logger: { info: vi.fn(), warn: h.warn, error: vi.fn(), debug: vi.fn() },
}));

import { sendAndLog } from '@/lib/email-service';

const FIXTURE_RECIPIENTS = [
  'testseeker@pmhnptest.com',
  'e2e+employer-1@PMHNPTEST.COM',
  'probe@acmepsych-fixtures.org',
  'probe@acmepsych.org',
  'nobody@example.com',
  'nobody@example.org',
];

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue({ data: { id: 'resend-msg-fic-1' }, error: null });
  h.db.emailSend.create.mockResolvedValue({ id: 'emailsend-fic-1' });
});

describe('sendAndLog fixture-domain refusal', () => {
  it.each(FIXTURE_RECIPIENTS)('refuses %s without calling Resend or logging a send', async (to) => {
    const result = await sendAndLog(
      { from: '', to, subject: 'Fixture probe', html: '<p>fixture</p>' },
      'contact_confirmation',
    );

    expect(result.data).toBeNull();
    expect(result.error?.name).toBe('fixture_domain');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.db.emailSend.create).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(
      'sendAndLog: refusing to mail a test-fixture domain',
      expect.objectContaining({ to }),
    );
  });

  it('still sends to a real-looking recipient', async () => {
    const result = await sendAndLog(
      { from: '', to: 'talent@examplepsych.example', subject: 'Fixture probe', html: '<p>ok</p>' },
      'contact_confirmation',
    );

    expect(result.error).toBeNull();
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});
