/**
 * Sec3 regression lock — verify-renewal-session must only hand back the job's
 * management token (dashboardToken) when a cookie set at checkout binds the
 * requester to the session_id. session_id leaks via URLs / referers / history,
 * so returning the token for any known session_id was a listing-takeover vector.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const retrieveMock = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: retrieveMock } },
  })),
}));

function makeReq(sessionId: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers['cookie'] = cookie;
  return new NextRequest(
    `https://pmhnphiring.com/api/verify-renewal-session?session_id=${sessionId}`,
    { headers },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  retrieveMock.mockResolvedValue({
    payment_status: 'paid',
    metadata: { jobId: 'job-1', type: 'renewal', tier: 'pro' },
  });
  vi.mocked(prisma.employerJob.findFirst).mockResolvedValue({
    dashboardToken: 'secret-token',
    job: { id: 'job-1', title: 'PMHNP' },
  } as never);
});

describe('verify-renewal-session — Sec3 cookie binding', () => {
  it('returns the dashboardToken when the renewal cookie matches the session_id', async () => {
    const { GET } = await import('@/app/api/verify-renewal-session/route');
    const json = await (await GET(makeReq('sess_123', 'pmhnp_renewal_session=sess_123'))).json();
    expect(json.dashboardToken).toBe('secret-token');
    expect(json.tokenDeliveredViaEmail).toBeUndefined();
  });

  it('withholds the token when there is no binding cookie', async () => {
    const { GET } = await import('@/app/api/verify-renewal-session/route');
    const json = await (await GET(makeReq('sess_123'))).json();
    expect(json.dashboardToken).toBeUndefined();
    expect(json.tokenDeliveredViaEmail).toBe(true);
  });

  it('withholds the token when the cookie is for a different session (IDOR attempt)', async () => {
    const { GET } = await import('@/app/api/verify-renewal-session/route');
    const json = await (await GET(makeReq('sess_123', 'pmhnp_renewal_session=sess_OTHER'))).json();
    expect(json.dashboardToken).toBeUndefined();
    expect(json.tokenDeliveredViaEmail).toBe(true);
  });
});
