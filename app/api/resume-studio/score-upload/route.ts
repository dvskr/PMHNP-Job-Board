import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { validateFile } from '@/lib/supabase-storage';
import { extractResumeText } from '@/lib/resume-parser';
import { scoreResumeText } from '@/lib/resume-score/score';

/**
 * Login-gated, zero-AI resume scoring: extract text in memory, run the
 * deterministic PMHNP rubric, return the breakdown. The file is NEVER
 * stored, logged, or sent to any model — that is the /tools/resume-checker
 * privacy promise, so keep this route free of storage and AI calls.
 *
 * Auth is required (the page is public to read, but running a check needs an
 * account so all resume tooling stays tied to a signed-in user), yet this
 * route consumes NO AI and NO daily quota — the rubric is deterministic.
 */
export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'resume-score-upload', { limit: 10, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to check your resume.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateFile(buffer, file.name, file.type, 'resume');
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error ?? 'Invalid file' }, { status: 400 });
    }

    const text = await extractResumeText(buffer, file.type);
    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'We could not read enough text from that file. If it is a scanned image PDF, export a text-based PDF and try again.' },
        { status: 400 }
      );
    }

    const score = scoreResumeText(text);
    return NextResponse.json({ score });
  } catch (error) {
    console.error('resume score-upload failed:', error);
    return NextResponse.json({ error: 'Failed to score the resume' }, { status: 500 });
  }
}
