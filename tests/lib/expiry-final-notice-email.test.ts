/**
 * The rendered expiry-date final notice: what actually lands in the employer's
 * inbox.
 *
 * Locks three things the copy tests cannot see on their own: the numbers in the
 * email are the ones handed to it (never placeholders or estimates), the CTA is
 * the same deep renew link the 5-day warning uses, and the whole rendered body
 * is free of dash characters.
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
}));

// tests/setup.ts stubs the whole email service for other suites. This one is
// about what the real builder renders, so opt back into the real module.
vi.unmock('@/lib/email-service');

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.send };
    batch = { send: vi.fn() };
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildRenewCtaUrl, sendExpiryFinalNoticeEmail } from '@/lib/email-service';

const RUN_AT = new Date('2026-08-12T22:00:00.000Z');
const JOB_ID = 'job-fic-final-1';
const DASHES = /[‐‑‒–—―−]/;

function sent(): { subject: string; html: string; to: string } {
  return h.send.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue({ data: { id: 'resend-msg-fic-1' }, error: null });
  h.db.emailSend.create.mockResolvedValue({ id: 'emailsend-fic-1' });
  h.db.emailLead.findUnique.mockResolvedValue({ unsubscribeToken: 'unsub-fic-1' });
});

async function send(overrides: Partial<Parameters<typeof sendExpiryFinalNoticeEmail>[0]> = {}) {
  return sendExpiryFinalNoticeEmail({
    email: 'talent@examplepsych.example',
    jobTitle: 'PMHNP Outpatient (Fictional Fixture)',
    expiresAt: new Date('2026-08-12T20:45:00.000Z'),
    stats: { viewCount: 1234, applyClickCount: 56, applicationCount: 7 },
    jobId: JOB_ID,
    unsubscribeToken: 'unsub-fic-1',
    now: RUN_AT,
    ...overrides,
  });
}

describe('sendExpiryFinalNoticeEmail', () => {
  it('sends the already-expired variant when the instant passed before the run', async () => {
    const result = await send();

    expect(result).toEqual({ success: true });
    expect(sent().subject).toBe('Your job posting has expired: renew to bring it back live');
    expect(sent().html).toContain('Your Listing Has Expired');
    expect(sent().html).toContain('has expired, so candidates can no longer find it');
  });

  it('sends the expires-today variant when the instant is still ahead of the run', async () => {
    await send({ expiresAt: new Date('2026-08-12T23:30:00.000Z') });

    expect(sent().subject).toBe('Your job posting expires today: renew to keep it live');
    expect(sent().html).toContain('Your Listing Expires Today');
    expect(sent().html).not.toContain('has expired');
  });

  it('never renders a zero-day countdown in any variant', async () => {
    for (const expiresAt of [
      new Date('2026-08-12T20:45:00.000Z'),
      new Date('2026-08-12T23:30:00.000Z'),
      new Date('2026-08-13T02:00:00.000Z'),
    ]) {
      h.send.mockClear();
      await send({ expiresAt });
      expect(sent().subject).not.toMatch(/\b0 days?\b/);
      expect(sent().html).not.toMatch(/\b0 days?\b/);
      expect(sent().html).not.toMatch(/expires in \d+ days/i);
    }
  });

  it('renders no dash characters in the subject or any visible body text', async () => {
    await send();
    expect(sent().subject).not.toMatch(DASHES);
    // The shared V2 shell carries em dashes inside its <style> block comments,
    // which no employer ever sees. Strip the non-visible layers and hold the
    // rest (every word of copy this email renders) to the house rule.
    const visible = sent().html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(visible).not.toMatch(DASHES);
  });

  it('carries the posting\'s real numbers: views, apply clicks and applications', async () => {
    await send();
    const html = sent().html;
    expect(html).toContain('1,234');
    expect(html).toContain('>56<');
    expect(html).toContain('>7<');
    expect(html).toContain('Views');
    expect(html).toContain('Apply Clicks');
    expect(html).toContain('Applications');
  });

  it('renders honest zeroes rather than hiding a posting that earned nothing', async () => {
    await send({ stats: { viewCount: 0, applyClickCount: 0, applicationCount: 0 } });
    expect(sent().html).toContain('>0<');
  });

  it('uses the shared deep renew link, not the dead token dashboard', async () => {
    await send();
    const html = sent().html;
    expect(html).toContain(buildRenewCtaUrl(JOB_ID));
    expect(html).toContain(`redirectTo=${encodeURIComponent(`/employer/dashboard?renew=${JOB_ID}`)}`);
    expect(html).not.toMatch(/\/employer\/dashboard\/[a-z0-9]/i);
  });

  it('logs under its own email type so it can never be miscounted as the 5-day warning', async () => {
    await send();
    expect(h.db.emailSend.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailType: 'expiry_final_notice' }),
      }),
    );
  });

  it('escapes the job title', async () => {
    await send({ jobTitle: 'PMHNP <script>alert(1)</script>' });
    expect(sent().html).not.toContain('<script>');
    expect(sent().html).toContain('&lt;script&gt;');
  });

  it('mints an unsubscribe token when the caller has none', async () => {
    h.db.emailLead.findUnique.mockResolvedValue(null);
    h.db.emailLead.create.mockResolvedValue({ unsubscribeToken: 'unsub-fic-minted' });

    await send({ unsubscribeToken: null });

    expect(h.db.emailLead.create).toHaveBeenCalled();
  });

  it('reports a provider rejection as definitively rejected so the caller can undo its claim', async () => {
    h.send.mockResolvedValue({ data: null, error: { message: 'Domain is not verified' } });

    const result = await send();

    expect(result.success).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.error).toContain('Domain is not verified');
  });

  it('reports a mid-flight throw as ambiguous (no rejected flag) so the claim is kept', async () => {
    h.send.mockRejectedValue(new Error('socket hang up'));

    const result = await send();

    expect(result.success).toBe(false);
    expect(result.rejected).toBeUndefined();
    expect(result.error).toContain('socket hang up');
  });
});
