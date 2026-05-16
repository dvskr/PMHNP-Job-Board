/**
 * /api/employer/jd-templates
 *
 * Per-employer saved JD templates. List + create. Surfaces as the
 * "My Templates" category in the post-job template picker.
 *
 *   GET  → list current employer's saved templates (most recent first)
 *   POST → save a new template (body: { label, summary?, body })
 *
 * Per-employer cap: MAX_PER_USER. The cap is enforced inline rather
 * than via a separate quota table — counting rows on every save is
 * cheap given the (user_id, created_at) index.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeHtmlContent } from '@/lib/sanitize';
import { logger } from '@/lib/logger';

const MAX_PER_USER = 20;

const createSchema = z.object({
  label: z.string().min(2, 'Label must be at least 2 characters').max(120),
  summary: z.string().max(300).optional().or(z.literal('')),
  body: z.string().min(50, 'Body must be at least 50 characters').max(30_000),
});

async function getEmployerUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
  if (!profile || profile.role !== 'employer') return null;
  return user.id;
}

export async function GET(req: NextRequest) {
  const rateLimitResult = await rateLimit(req, 'jd-templates:list', RATE_LIMITS.employer);
  if (rateLimitResult) return rateLimitResult;

  const userId = await getEmployerUserId();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const items = await prisma.jdTemplate.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, summary: true, body: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ items, cap: MAX_PER_USER });
}

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req, 'jd-templates:create', RATE_LIMITS.employer);
  if (rateLimitResult) return rateLimitResult;

  const userId = await getEmployerUserId();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    );
  }

  // Cap check — abort early so we don't write a row we'd have to roll
  // back. Count is cheap thanks to the user_id index.
  const existingCount = await prisma.jdTemplate.count({ where: { userId } });
  if (existingCount >= MAX_PER_USER) {
    return NextResponse.json(
      {
        error: 'Template limit reached',
        message: `You can save up to ${MAX_PER_USER} templates. Delete one before saving another.`,
      },
      { status: 409 },
    );
  }

  // Body is Quill HTML from the editor — sanitize aggressively. The
  // editor itself enforces a 25k visible-char cap, but a malicious
  // client could POST raw HTML directly, so sanitize first.
  const sanitizedBody = sanitizeHtmlContent(parsed.body);
  const label = parsed.label.trim();
  const summary = parsed.summary?.trim() || null;

  try {
    const created = await prisma.jdTemplate.create({
      data: {
        userId,
        label,
        summary,
        body: sanitizedBody,
      },
      select: { id: true, label: true, summary: true, body: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    logger.error('Failed to create JD template', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}
