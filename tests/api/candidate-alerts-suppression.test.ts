/**
 * E3 regression — candidate-alert emails went out with NO suppression check and
 * NO List-Unsubscribe header, mailing addresses that had already bounced /
 * complained / unsubscribed. The fix gates sendNewCandidateAlertEmail on
 * isEmailSuppressed and threads a real per-recipient unsubscribe token through
 * to sendAndLog (which now attaches the RFC 8058 header).
 *
 * The global setup mocks @/lib/email-service, so we unmock it here to exercise
 * the REAL implementation. Resend is mocked to capture the outbound headers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.unmock('@/lib/email-service');

const resendSendMock = vi.fn().mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: resendSendMock },
    batch: { send: vi.fn().mockResolvedValue({ data: [], error: null }) },
  })),
}));

import { prisma } from '@/lib/prisma';

const CANDIDATES = [
  { name: 'Alice B.', headline: 'PMHNP-BC', profileUrl: 'https://pmhnphiring.com/u1', specialties: ['ADHD'], states: ['TX'], experience: 4 },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = 'https://pmhnphiring.com';
  process.env.RESEND_API_KEY = 'test-key';
  resendSendMock.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null });
});

describe('sendNewCandidateAlertEmail — E3 suppression + List-Unsubscribe', () => {
  it('skips the send when the address is suppressed (emailLead.isSuppressed)', async () => {
    vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({ isSuppressed: true } as never);
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null as never);

    const { sendNewCandidateAlertEmail } = await import('@/lib/email-service');
    const result = await sendNewCandidateAlertEmail('bounced@example.com', 'Acme Clinic', CANDIDATES);

    expect(result.success).toBe(false);
    expect(result.error).toBe('suppressed');
    expect(resendSendMock).not.toHaveBeenCalled();
    // 15s: this first test pays the dynamic import of the email-service module
    // graph, which has blown vitest's 5s default under full-suite load.
  }, 15_000);

  it('skips the send when suppressed via userProfile.emailSuppressed', async () => {
    vi.mocked(prisma.emailLead.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue({ emailSuppressed: true } as never);

    const { sendNewCandidateAlertEmail } = await import('@/lib/email-service');
    const result = await sendNewCandidateAlertEmail('complained@example.com', 'Acme Clinic', CANDIDATES);

    expect(result.success).toBe(false);
    expect(result.error).toBe('suppressed');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('sends with a real-token List-Unsubscribe header for a non-suppressed recipient', async () => {
    // isEmailSuppressed: not suppressed. getOrCreateUnsubToken: existing token.
    vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({
      isSuppressed: false,
      unsubscribeToken: 'tok-abc-123',
    } as never);
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.emailSend.create).mockResolvedValue({} as never);

    const { sendNewCandidateAlertEmail } = await import('@/lib/email-service');
    const result = await sendNewCandidateAlertEmail('employer@example.com', 'Acme Clinic', CANDIDATES);

    expect(result.success).toBe(true);
    expect(resendSendMock).toHaveBeenCalledOnce();
    const sendArg = resendSendMock.mock.calls[0][0] as { headers: Record<string, string> };
    expect(sendArg.headers['List-Unsubscribe']).toContain('tok-abc-123');
    expect(sendArg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
