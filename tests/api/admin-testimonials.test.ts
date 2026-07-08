/**
 * /api/admin/testimonials — admin review + feature toggle for employer
 * testimonials.
 *
 * Locks in:
 *  - the requireApiAdmin guard short-circuits both GET and PATCH
 *  - GET lists testimonials (all rows, consented or not, newest first)
 *  - PATCH featuring sets featuredAt, but ONLY when consent === true
 *  - PATCH unfeaturing clears featuredAt
 *  - invalid bodies and unknown ids are rejected without a write
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

vi.mock('@/lib/auth/require-api-admin', () => ({
  requireApiAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employerTestimonial: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function getReq(): Request {
  return new Request('https://example.com/api/admin/testimonials', { method: 'GET' });
}

function patchReq(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/admin/testimonials', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireApiAdmin).mockResolvedValue(null); // authorized by default
});

describe('GET /api/admin/testimonials', () => {
  it('returns the auth error without touching the database when the guard rejects', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    );
    const { GET } = await import('@/app/api/admin/testimonials/route');
    const res = await GET(getReq() as never);
    expect(res.status).toBe(401);
    expect(prisma.employerTestimonial.findMany).not.toHaveBeenCalled();
  });

  it('lists all testimonials newest-first with review fields', async () => {
    const rows = [
      {
        id: 't1', employerName: 'Acme Behavioral Health', content: 'Great hire in two weeks.',
        rating: 5, consent: true, displayAs: 'full', featuredAt: null, createdAt: new Date(),
      },
      {
        id: 't2', employerName: 'Quiet Clinic', content: 'Solid candidate pool.',
        rating: null, consent: false, displayAs: 'anonymous', featuredAt: null, createdAt: new Date(),
      },
    ];
    vi.mocked(prisma.employerTestimonial.findMany).mockResolvedValue(rows as never);
    const { GET } = await import('@/app/api/admin/testimonials/route');
    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.testimonials).toHaveLength(2);
    expect(prisma.employerTestimonial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        select: expect.objectContaining({
          id: true, employerName: true, content: true, rating: true,
          consent: true, displayAs: true, featuredAt: true, createdAt: true,
        }),
      }),
    );
  });
});

describe('PATCH /api/admin/testimonials', () => {
  it('returns the auth error without touching the database when the guard rejects', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue(
      NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    );
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ id: 't1', featured: true }) as never);
    expect(res.status).toBe(403);
    expect(prisma.employerTestimonial.update).not.toHaveBeenCalled();
  });

  it('features a consented testimonial by setting featuredAt', async () => {
    vi.mocked(prisma.employerTestimonial.findUnique).mockResolvedValue(
      { id: 't1', consent: true, featuredAt: null } as never,
    );
    vi.mocked(prisma.employerTestimonial.update).mockResolvedValue(
      { id: 't1', employerName: 'Acme', consent: true, displayAs: 'initial', featuredAt: new Date() } as never,
    );
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ id: 't1', featured: true }) as never);
    expect(res.status).toBe(200);
    expect(prisma.employerTestimonial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: { featuredAt: expect.any(Date) },
      }),
    );
  });

  it('refuses to feature a testimonial without consent and performs no write', async () => {
    vi.mocked(prisma.employerTestimonial.findUnique).mockResolvedValue(
      { id: 't2', consent: false, featuredAt: null } as never,
    );
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ id: 't2', featured: true }) as never);
    expect(res.status).toBe(409);
    expect(prisma.employerTestimonial.update).not.toHaveBeenCalled();
  });

  it('unfeatures a testimonial by clearing featuredAt', async () => {
    vi.mocked(prisma.employerTestimonial.findUnique).mockResolvedValue(
      { id: 't1', consent: true, featuredAt: new Date() } as never,
    );
    vi.mocked(prisma.employerTestimonial.update).mockResolvedValue(
      { id: 't1', employerName: 'Acme', consent: true, displayAs: 'initial', featuredAt: null } as never,
    );
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ id: 't1', featured: false }) as never);
    expect(res.status).toBe(200);
    expect(prisma.employerTestimonial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: { featuredAt: null },
      }),
    );
  });

  it('rejects a missing id with 400 and no lookup', async () => {
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ featured: true }) as never);
    expect(res.status).toBe(400);
    expect(prisma.employerTestimonial.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean featured flag with 400 and no lookup', async () => {
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ id: 't1', featured: 'yes' }) as never);
    expect(res.status).toBe(400);
    expect(prisma.employerTestimonial.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown testimonial id without a write', async () => {
    vi.mocked(prisma.employerTestimonial.findUnique).mockResolvedValue(null as never);
    const { PATCH } = await import('@/app/api/admin/testimonials/route');
    const res = await PATCH(patchReq({ id: 'nope', featured: true }) as never);
    expect(res.status).toBe(404);
    expect(prisma.employerTestimonial.update).not.toHaveBeenCalled();
  });
});
