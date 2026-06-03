/**
 * P2 regression — the DSAR route was intake-only "theater": any anonymous caller
 * could POST any email and it would 201 without verifying identity or executing
 * anything. The fix requires an authenticated session whose email owns the request,
 * then actually executes it (deletion → soft-delete + 30-day purge; access → export).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const getUserMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue({});
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: getUserMock, signOut: signOutMock },
  }),
}));

vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...(original.prisma as object),
      dataRequest: { create: vi.fn(), update: vi.fn() },
      userProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    },
  };
});

vi.mock('@/lib/audit-log', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { dataRequest: { limit: 3, windowSeconds: 3600 } },
}));

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/data-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { email: 'alice@example.com', type: 'deletion', jurisdiction: 'gdpr' };

describe('POST /api/data-request — P2 identity + action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when no session exists, with no DB write', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(401);
    expect(prisma.dataRequest.create).not.toHaveBeenCalled();
  });

  it('401 when getUser errors', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('JWT expired') });
    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(401);
    expect(prisma.dataRequest.create).not.toHaveBeenCalled();
  });

  it('403 when body email != session email', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-user-1', email: 'bob@example.com' } }, error: null });
    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest({ ...VALID_BODY, email: 'alice@example.com' }) as never);
    expect(res.status).toBe(403);
    expect(prisma.dataRequest.create).not.toHaveBeenCalled();
  });

  it('ownership comparison is case-insensitive', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-2', email: 'ALICE@EXAMPLE.COM' } }, error: null });
    vi.mocked(prisma.dataRequest.create).mockResolvedValue({ id: 'dr-1', dueBy: new Date(Date.now() + 30 * 86400_000), type: 'deletion' } as never);
    vi.mocked(prisma.userProfile.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.dataRequest.update).mockResolvedValue({} as never);
    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest({ ...VALID_BODY, email: 'alice@example.com' }) as never);
    expect(res.status).toBe(201);
  });

  it('201 + soft-delete on type=deletion for the owner', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-owner', email: 'alice@example.com' } }, error: null });
    vi.mocked(prisma.dataRequest.create).mockResolvedValue({ id: 'dr-ok', dueBy: new Date(Date.now() + 30 * 86400_000), type: 'deletion' } as never);
    vi.mocked(prisma.userProfile.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.dataRequest.update).mockResolvedValue({} as never);

    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest(VALID_BODY) as never);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe('dr-ok');
    expect(prisma.userProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supabaseId: 'sb-owner' },
        data: expect.objectContaining({ deletedAt: expect.any(Date), purgeAt: expect.any(Date) }),
      }),
    );
    expect(prisma.dataRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dr-ok' }, data: expect.objectContaining({ status: 'completed' }) }),
    );
    expect(signOutMock).toHaveBeenCalled();
  });

  it('profileless user (OAuth, no UserProfile row) still completes — no P2025 orphan, signs out, 201', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-oauth', email: 'alice@example.com' } }, error: null });
    vi.mocked(prisma.dataRequest.create).mockResolvedValue({ id: 'dr-orphan', dueBy: new Date(Date.now() + 30 * 86400_000), type: 'deletion' } as never);
    vi.mocked(prisma.userProfile.updateMany).mockResolvedValue({ count: 0 } as never); // no profile row
    vi.mocked(prisma.dataRequest.update).mockResolvedValue({} as never);

    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest(VALID_BODY) as never);

    expect(res.status).toBe(201);
    // Request is still marked completed (not left orphaned in_progress)…
    expect(prisma.dataRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dr-orphan' }, data: expect.objectContaining({ status: 'completed' }) }),
    );
    // …and the session is terminated.
    expect(signOutMock).toHaveBeenCalled();
  });

  it('201 + export on type=access (no soft-delete)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'sb-access', email: 'alice@example.com' } }, error: null });
    vi.mocked(prisma.dataRequest.create).mockResolvedValue({ id: 'dr-access', dueBy: new Date(Date.now() + 30 * 86400_000), type: 'access' } as never);
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue({
      id: 'up-1', email: 'alice@example.com', firstName: 'Alice', lastName: 'Test',
      phone: null, role: 'job_seeker', createdAt: new Date(), resumeUrl: null,
      linkedinUrl: null, bio: null, skills: [],
    } as never);
    vi.mocked(prisma.dataRequest.update).mockResolvedValue({} as never);

    const { POST } = await import('@/app/api/data-request/route');
    const res = await POST(makeRequest({ email: 'alice@example.com', type: 'access' }) as never);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.export).toBeDefined();
    expect(json.export.email).toBe('alice@example.com');
    expect(prisma.userProfile.update).not.toHaveBeenCalled();
  });
});
