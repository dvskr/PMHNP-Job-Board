/**
 * Regression (audit H7) — the candidate dashboard feedback + testimonial cards
 * POST to /api/feedback, but that route did not exist. Every submission 404'd
 * while the UI flashed "Thank You!" and the feedback was silently lost.
 *
 * The route now exists and writes UserFeedback. These tests lock in that it
 * persists valid submissions and rejects invalid ratings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const getUserMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: getUserMock } }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { userFeedback: { create: vi.fn() } },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { feedback: { limit: 5, windowSeconds: 60 } },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function req(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'sb-fb', email: 'u@x.com' } } });
});

describe('POST /api/feedback', () => {
  it('persists a valid rating + message and returns success', async () => {
    vi.mocked(prisma.userFeedback.create).mockResolvedValue({ id: 'f1' } as never);
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(req({ rating: 5, message: 'great', page: 'dashboard' }) as never);
    expect(res.status).toBe(200);
    expect(prisma.userFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rating: 5, message: 'great', page: 'dashboard', userId: 'sb-fb' }) }),
    );
  });

  it('rejects an out-of-range rating with 400 and no write', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(req({ rating: 9, page: 'dashboard' }) as never);
    expect(res.status).toBe(400);
    expect(prisma.userFeedback.create).not.toHaveBeenCalled();
  });

  it('stores anonymously when there is no session (userId null)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    vi.mocked(prisma.userFeedback.create).mockResolvedValue({ id: 'f2' } as never);
    const { POST } = await import('@/app/api/feedback/route');
    const res = await POST(req({ rating: 4 }) as never);
    expect(res.status).toBe(200);
    expect(prisma.userFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null, rating: 4 }) }),
    );
  });
});
