/**
 * POST /api/employer/ai-jd
 *
 * Generate or refine a long-form SEO-optimized PMHNP job description.
 *
 * Modes (drives the prompt shape):
 *   - "generate"  (default) — produce a fresh JD from `role`, `setting`,
 *                              and `context`. No `currentDraft` needed.
 *   - "shorten"             — rewrite `currentDraft` ~30% tighter,
 *                              preserving every fact and structural section.
 *   - "lengthen"            — expand `currentDraft` ~40% with more
 *                              specific clinical detail and examples.
 *                              Must not invent facts (salaries, named
 *                              drugs, neighborhoods).
 *   - "retone"              — rewrite `currentDraft` in the requested
 *                              `tone` without changing length materially.
 *
 * Controls:
 *   - tone:    'professional' | 'conversational' | 'warm' (default professional)
 *   - length:  'concise' | 'standard' | 'detailed' (default standard)
 *              Visible-char targets:
 *                concise   ≈ 3,000-5,000
 *                standard  ≈ 5,000-7,000
 *                detailed  ≈ 7,000-10,000
 *   - mustHaves: up to 8 short bullet phrases the employer wants
 *                surfaced (e.g. "psych ICU background preferred",
 *                "Spanish fluency a plus"). Folded into the
 *                "Required" or "Preferred" qualifications section
 *                contextually.
 *
 * Every output is run through lib/jd-guardrails — length, role/care
 * signal, profanity, and keyword-density checks — so a bad draft never
 * reaches the employer.
 *
 * Returns: { description: string, stats: GuardrailStats } on success,
 *          { error: string, details?: string[] } on validation/guardrail
 *          failure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { complete } from '@/lib/ai/gateway';
import { AiGatewayError } from '@/lib/ai/types';
import { checkJdGuardrails } from '@/lib/jd-guardrails';
import { sanitizeText } from '@/lib/sanitize';
import { AI_DAILY_CAPS, getEmployerAiUsage } from '@/lib/ai-usage';

const requestSchema = z.object({
  role: z.string().min(3, 'Role must be at least 3 characters').max(120),
  setting: z.string().min(3).max(60),
  // Context bundles role-form metadata (employer name, location,
  // benefits checklist) AND the employer's free-text facts summary.
  // The facts summary alone can run thousands of characters — there's
  // no upside to forcing the client to split them into two fields.
  // 20,000 matches the JD-body upper bound we accept elsewhere.
  context: z.string().max(20_000).optional(),
  mode: z.enum(['generate', 'shorten', 'lengthen', 'retone']).optional().default('generate'),
  tone: z.enum(['professional', 'conversational', 'warm']).optional().default('professional'),
  length: z.enum(['concise', 'standard', 'detailed']).optional().default('standard'),
  mustHaves: z.array(z.string().min(1).max(240)).max(8).optional().default([]),
  // Required when mode != 'generate'. We accept the HTML body as it sits
  // in the editor — the guardrail check happens on the result, not the
  // input, so partially-broken drafts are still acceptable as input.
  currentDraft: z.string().max(30_000).optional(),
});

type ParsedRequest = z.infer<typeof requestSchema>;

const TONE_INSTRUCTIONS: Record<ParsedRequest['tone'], string> = {
  professional:
    'Write in a formal professional register. Avoid contractions. Use third-person where natural. The tone is steady, factual, and confidence-inspiring.',
  conversational:
    'Write in a warm conversational register. Contractions are fine. Use second-person ("you will") so the candidate feels addressed. The tone is approachable and direct.',
  warm:
    'Write in a warm mission-driven register. Use second-person and emphasize team, impact on patients, and clinical autonomy. The tone is empathetic and human — not corporate.',
};

const LENGTH_INSTRUCTIONS: Record<ParsedRequest['length'], string> = {
  concise:
    'Target 3,000-4,500 characters of visible text. HARD CEILING 5,500. Keep every section but trim adjectives and consolidate bullets.',
  standard:
    'Target 5,000-6,500 characters of visible text. HARD CEILING 8,000. Cover every section with two or three sentences and concrete bullets.',
  detailed:
    'Target 7,500-9,500 characters of visible text. HARD CEILING 11,000. Use richer paragraphs with specific clinical examples; expand the Compensation and Why-join sections — but stop when you hit the ceiling. Do not pad.',
};

function buildSystemPrompt(input: ParsedRequest): string {
  const baseHeader = `You are an expert recruiter writing long-form job descriptions for psychiatric mental health nurse practitioner (PMHNP) positions in the United States.`;

  const sharedRules = `
Output requirements:
- Pure HTML body. Use <h2>, <h3>, <ul>, <li>, <p>. No <h1>, no <html>, no <body>, no markdown.
- Sections in this order: "About {employer}" / "Position summary" / "Key responsibilities" / "Required qualifications" / "Preferred qualifications" / "Schedule" / "Compensation and benefits" / "Why join us" / "How to apply".
- Vary vocabulary. No single 4-character-plus word can exceed 3% of total words. No keyword stuffing.
- Never invent facts the input doesn't support: salaries, named drugs the employer didn't mention, specific city neighborhoods, or sign-on bonuses.
- No profanity. No marketing phrases like "click here" or "limited time offer". No emoji.
- Use {employer}, {city}, {state} as substitution placeholders if the form will fill them in later.
Tone: ${TONE_INSTRUCTIONS[input.tone]}
Length: ${LENGTH_INSTRUCTIONS[input.length]}
Return ONLY the HTML body. No preamble, no closing remarks.`;

  switch (input.mode) {
    case 'generate':
      return `${baseHeader}\n\n${sharedRules}`;
    case 'shorten':
      return `${baseHeader}

You will receive an EXISTING long-form job description and must produce a SHORTER rewrite — roughly 30% fewer visible characters than the source, with every section, every fact, and every key bullet preserved. Tighten by removing redundant adjectives, consolidating overlapping bullets, and shortening transition sentences. Do not drop sections. Do not drop required qualifications or compensation specifics.
${sharedRules}`;
    case 'lengthen':
      return `${baseHeader}

You will receive an EXISTING job description and must produce a LONGER rewrite — roughly 40% more visible characters than the source. Expand by adding more specific clinical examples (case mix, modalities, multidisciplinary collaboration), more concrete day-in-the-life detail in the schedule section, and richer prose in the Compensation and Why-join sections. Do not invent specific facts the source does not contain (salaries, named drugs, neighborhoods, sign-on bonuses).
${sharedRules}`;
    case 'retone':
      return `${baseHeader}

You will receive an EXISTING job description and must rewrite it in the specified tone WITHOUT materially changing the visible-character length (stay within plus or minus 10%). Preserve every section, every fact, and every bullet. Only the voice, phrasing, and register change.
${sharedRules}`;
  }
}

function buildUserMessage(input: ParsedRequest, sanitized: { role: string; setting: string; context: string }): string {
  const lines: string[] = [];
  lines.push(`Role: ${sanitized.role}`);
  lines.push(`Setting: ${sanitized.setting}`);
  if (sanitized.context) lines.push(`Context: ${sanitized.context}`);
  if (input.mustHaves.length > 0) {
    lines.push('Must-haves the employer wants surfaced (fold into Required or Preferred qualifications):');
    for (const m of input.mustHaves) lines.push(`- ${m}`);
  }
  if (input.mode !== 'generate' && input.currentDraft) {
    lines.push('');
    lines.push('Existing draft to rewrite:');
    lines.push('---');
    lines.push(input.currentDraft);
    lines.push('---');
  }
  lines.push('');
  lines.push('Produce the full HTML body per the system instructions.');
  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'ai-jd', RATE_LIMITS.general);
  if (rateLimitResult) return rateLimitResult;

  let userId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
    if (!profile || profile.role !== 'employer') {
      return NextResponse.json({ error: 'Only employer accounts can generate JDs.' }, { status: 403 });
    }
    userId = user.id;
  } catch (err) {
    logger.warn('AI JD auth failed', { error: err });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  let parsed: ParsedRequest;
  try {
    const body = await request.json();
    parsed = requestSchema.parse(body);
  } catch (err) {
    // Zod errors come back as an array of issues. Each issue has
    // path + message — flatten to "context: too large" style strings
    // so the dialog can show the user something they can actually act on.
    let details: string[] | undefined;
    if (err && typeof err === 'object' && 'issues' in err) {
      const issues = (err as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues;
      if (Array.isArray(issues)) {
        details = issues
          .map((i) => {
            const path = Array.isArray(i.path) && i.path.length > 0 ? i.path.join('.') : 'request';
            return `${path}: ${i.message ?? 'invalid'}`;
          })
          .slice(0, 5);
      }
    }
    return NextResponse.json(
      {
        error: 'Invalid request',
        details: details ?? [err instanceof Error ? err.message : 'unknown'],
      },
      { status: 400 },
    );
  }

  // Refinement modes require an existing draft to rewrite.
  if (parsed.mode !== 'generate' && (!parsed.currentDraft || parsed.currentDraft.length < 50)) {
    return NextResponse.json(
      { error: 'Refinement requires an existing draft of at least 50 characters.' },
      { status: 400 },
    );
  }

  // Per-employer daily cap. Mirrors the talent_search_rerank pattern:
  // count ai_call_log rows since midnight Central Time, reject with 429
  // when over. Pre-check so we don't pay the model for a request whose
  // response we'd have to refuse anyway.
  const usage = await getEmployerAiUsage(userId, 'jd_generator');
  if (usage.remaining === 0) {
    return NextResponse.json(
      {
        error: 'Daily AI limit reached',
        message: `You've used your ${AI_DAILY_CAPS.jd_generator} AI generations for today. The limit resets at midnight Central Time.`,
        usage,
      },
      { status: 429 },
    );
  }

  const sanitized = {
    role: sanitizeText(parsed.role, 120),
    setting: sanitizeText(parsed.setting, 60),
    // Match the schema's 20k context cap. sanitizeText only strips
    // script/event-handler patterns — the length parameter just clips
    // anything ridiculous, it doesn't reject the request.
    context: parsed.context ? sanitizeText(parsed.context, 20_000) : '',
  };

  try {
    const response = await complete<string>({
      task: 'jd_generator',
      tenant: { type: 'employer', id: userId },
      promptId: 'jd_generator',
      promptVersion: 'v2',
      messages: [
        { role: 'system', content: buildSystemPrompt(parsed) },
        { role: 'user', content: buildUserMessage(parsed, sanitized) },
      ],
    });

    const guardrail = checkJdGuardrails(response.content);
    if (!guardrail.ok) {
      logger.warn('AI JD failed guardrails', { mode: parsed.mode, errors: guardrail.errors });
      return NextResponse.json(
        {
          error: 'AI draft failed quality checks — please try again or adjust your inputs.',
          details: guardrail.errors,
        },
        { status: 422 },
      );
    }

    // Re-read usage AFTER the call so the response reflects the
    // post-increment count. recordAiCall has already written the row
    // inside the gateway, so this count includes the just-made call.
    const usageAfter = await getEmployerAiUsage(userId, 'jd_generator');

    return NextResponse.json({
      description: response.content,
      stats: guardrail.stats,
      meta: {
        mode: parsed.mode,
        tone: parsed.tone,
        length: parsed.length,
        model: response.model,
        latencyMs: response.latencyMs,
        fallbackUsed: response.fallbackUsed,
      },
      usage: usageAfter,
    });
  } catch (err) {
    if (err instanceof AiGatewayError) {
      logger.warn('AI JD gateway error', { code: err.code, mode: parsed.mode });
      const status =
        err.code === 'rate_limited' ? 429 :
        err.code === 'provider_not_configured' ? 503 :
        502;
      return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status });
    }
    logger.error('AI JD generation failed', err);
    return NextResponse.json({ error: 'Unexpected error generating JD.' }, { status: 500 });
  }
}
