/**
 * Regression (audit H1) — GET /api/job-alerts/by-email leaked every alert,
 * INCLUDING the management `token`, for ANY email with no auth (IDOR). The
 * token is the bearer credential for editing/deleting alerts, so knowing a
 * victim's email handed an attacker control of their alerts.
 *
 * The fix requires an authenticated session whose email matches the requested
 * address. These tests lock that in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const getUserMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: getUserMock } }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { jobAlert: { findMany: vi.fn() } },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { jobAlerts: { limit: 10, windowSeconds: 60 } },
}));

function req(email: string): Request {
  return new Request(`https://example.com/api/job-alerts/by-email?email=${encodeURIComponent(email)}`);
}

describe('GET /api/job-alerts/by-email — IDOR is closed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 for an anonymous caller, with no DB read', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { GET } = await import('@/app/api/job-alerts/by-email/route');
    const res = await GET(req('victim@example.com') as never);
    expect(res.status).toBe(401);
    expect(prisma.jobAlert.findMany).not.toHaveBeenCalled();
  });

  it("403 when the session email differs from the requested email (can't read someone else's tokens)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-1', email: 'attacker@example.com' } } });
    const { GET } = await import('@/app/api/job-alerts/by-email/route');
    const res = await GET(req('victim@example.com') as never);
    expect(res.status).toBe(403);
    expect(prisma.jobAlert.findMany).not.toHaveBeenCalled();
  });

  it('200 and returns alerts only when the session owns the email (case-insensitive)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-2', email: 'Owner@Example.com' } } });
    vi.mocked(prisma.jobAlert.findMany).mockResolvedValue([
      { id: 'a1', token: 't1', email: 'owner@example.com', name: null, keyword: null, location: null, mode: null, jobType: null, minSalary: null, maxSalary: null, frequency: 'daily', isActive: true, lastSentAt: null, createdAt: new Date() },
    ] as never);
    const { GET } = await import('@/app/api/job-alerts/by-email/route');
    const res = await GET(req('owner@example.com') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alerts).toHaveLength(1);
  });
});
