/**
 * E1 regression — the RFC 8058 one-click unsubscribe POST endpoint.
 *
 * Gmail/Yahoo POST `List-Unsubscribe=One-Click` to the List-Unsubscribe URL with
 * no human interaction. That URL must resolve to a real POST handler that
 * suppresses the address and returns 2xx. Before this fix it pointed at a
 * client-only page (405 on POST).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

function postReq(token?: string): Request {
  const url = token
    ? `https://pmhnphiring.com/api/one-click-unsubscribe?token=${token}`
    : 'https://pmhnphiring.com/api/one-click-unsubscribe';
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  });
}

describe('POST /api/one-click-unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('suppresses a valid token and returns 200', async () => {
    vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({ id: 'lead-1' } as never);
    vi.mocked(prisma.emailLead.update).mockResolvedValue({} as never);

    const { POST } = await import('@/app/api/one-click-unsubscribe/route');
    const res = await POST(postReq('valid-token-abc') as never);

    expect(res.status).toBe(200);
    expect(prisma.emailLead.update).toHaveBeenCalledWith({
      where: { unsubscribeToken: 'valid-token-abc' },
      data: { isSubscribed: false, newsletterOptIn: false, isSuppressed: true },
    });
  });

  it('returns 200 (no retry) and skips the write when the token is unknown', async () => {
    vi.mocked(prisma.emailLead.findUnique).mockResolvedValue(null as never);

    const { POST } = await import('@/app/api/one-click-unsubscribe/route');
    const res = await POST(postReq('nope') as never);

    expect(res.status).toBe(200);
    expect(prisma.emailLead.update).not.toHaveBeenCalled();
  });

  it('returns 400 when the token query param is missing', async () => {
    const { POST } = await import('@/app/api/one-click-unsubscribe/route');
    const res = await POST(postReq() as never);

    expect(res.status).toBe(400);
    expect(prisma.emailLead.findUnique).not.toHaveBeenCalled();
  });

  it('returns 405 for GET', async () => {
    const { GET } = await import('@/app/api/one-click-unsubscribe/route');
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
