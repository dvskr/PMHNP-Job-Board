/**
 * GET /api/employer/ai-jd/usage
 *
 * Returns the calling employer's current AI JD generation usage for
 * today (Central Time). The JdStarterPanel hits this on mount so the
 * badge shows the right number before any user action.
 *
 * Cheap — a single COUNT against ai_call_log indexed by (tenantId,
 * createdAt). No rate limit because the read itself is cap-protected:
 * if you can hit this endpoint you're already an authenticated employer.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getEmployerAiUsage } from '@/lib/ai-usage';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
  if (!profile || profile.role !== 'employer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const usage = await getEmployerAiUsage(user.id, 'jd_generator');
  return NextResponse.json({ usage });
}
