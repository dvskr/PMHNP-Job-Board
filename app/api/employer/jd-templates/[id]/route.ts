/**
 * DELETE /api/employer/jd-templates/[id]
 *
 * Removes a saved JD template owned by the calling employer. Hard
 * delete — no soft-delete column; users expect "delete" to mean
 * gone, not hidden. Ownership check is enforced by the userId filter
 * in the WHERE so an attacker can't pass another employer's template
 * id and have it deleted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const renameSchema = z.object({
  label: z.string().min(2, 'Label must be at least 2 characters').max(120),
  summary: z.string().max(300).optional().or(z.literal('')),
});

async function getOwnerUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
  if (!profile || profile.role !== 'employer') return null;
  return user.id;
}

/**
 * PATCH /api/employer/jd-templates/[id]
 *
 * Rename a saved template (label + summary only). Body updates are
 * intentionally not allowed via this endpoint — to update the body
 * the employer deletes and re-saves. Keeps the mental model simple:
 * rename = metadata change, save-new = content change.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimitResult = await rateLimit(req, 'jd-templates:rename', RATE_LIMITS.employer);
  if (rateLimitResult) return rateLimitResult;

  const userId = await getOwnerUserId();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let parsed: z.infer<typeof renameSchema>;
  try {
    parsed = renameSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    );
  }

  try {
    // updateMany so a missing/foreign id returns count:0 instead of
    // throwing. The ownership filter prevents cross-employer renames.
    const result = await prisma.jdTemplate.updateMany({
      where: { id, userId },
      data: {
        label: parsed.label.trim(),
        summary: parsed.summary?.trim() || null,
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const updated = await prisma.jdTemplate.findUnique({
      where: { id },
      select: { id: true, label: true, summary: true, body: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ item: updated });
  } catch (err) {
    logger.error('Failed to rename JD template', err);
    return NextResponse.json({ error: 'Rename failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimitResult = await rateLimit(req, 'jd-templates:delete', RATE_LIMITS.employer);
  if (rateLimitResult) return rateLimitResult;

  const userId = await getOwnerUserId();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    // deleteMany so a missing/foreign id returns count:0 instead of
    // throwing. The ownership filter is non-negotiable — without it
    // a malicious employer could delete another's templates.
    const result = await prisma.jdTemplate.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: id });
  } catch (err) {
    logger.error('Failed to delete JD template', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
