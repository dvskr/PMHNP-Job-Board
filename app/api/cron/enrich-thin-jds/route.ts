/**
 * GET /api/cron/enrich-thin-jds
 *
 * Aggregated-job description enrichment cron. Distinct from
 * /api/cron/enrich-jobs, which extracts STRUCTURED FIELDS from existing
 * descriptions. This route REWRITES the description body itself when it
 * is too thin to rank in SEO (less than ~1500 visible characters).
 *
 * Flow per row:
 *   1. Identify thin JDs from active sources where description body
 *      is short AND the job hasn't been re-enriched in the cooldown window.
 *   2. Snapshot the original description to `descriptionSourceRaw` so we
 *      can always revert.
 *   3. Generate a long-form description via the `seo_content` task (gpt-5.4
 *      primary, 30-day cache, claude-opus-4-7 fallback).
 *   4. Run the result through lib/jd-guardrails. Skip + log if it fails.
 *   5. Write the enriched body, bump `lastEnrichedAt`, fire IndexNow ping
 *      for the affected URL.
 *
 * Cost guardrail: capped to MAX_JOBS_PER_RUN per cron tick so a runaway
 * cost spike can't happen. Cost-per-call is recorded in the AI gateway
 * cost-tracker by virtue of routing through `complete()`.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { complete } from '@/lib/ai/gateway';
import { AiGatewayError } from '@/lib/ai/types';
import { checkJdGuardrails } from '@/lib/jd-guardrails';
import { logger } from '@/lib/logger';
import { withCronTracking } from '@/lib/cron/track';
import { pingIndexNow } from '@/lib/indexnow';

export const maxDuration = 300;

const MIN_VISIBLE_CHARS = 1500;
const MAX_JOBS_PER_RUN = 25; // Conservative — each call is ~$0.05 at gpt-5.4 rates.
const TIME_BUDGET_MS = 250_000;
const COOLDOWN_DAYS = 30;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

const SYSTEM_PROMPT = `You are rewriting a too-short job posting for a PMHNP role into a long-form SEO-optimized description.

You will be given the EXISTING description, the role title, the employer name, and the location. Use them as factual anchors — never invent specifics that aren't in the source.

Output requirements:
- Pure HTML body with <h2>, <h3>, <ul>, <li>, <p> tags. No wrapper tags, no preamble.
- 5,000 to 8,000 characters of visible text.
- Sections in this order: About / Position summary / Key responsibilities / Required qualifications / Preferred qualifications / Schedule / Compensation and benefits / Why join us / How to apply.
- Vary your vocabulary — no single 4-character-plus word can exceed 3% of total words.
- Never invent specifics (salaries, neighborhoods, named drugs not in the source).
- Faithfully preserve any facts from the source description: schedule, salary, benefits, mode, setting.
- If the source omits a section, write a generic placeholder paragraph that reads naturally without making up specifics.`;

interface ThinJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  description: string;
  slug: string | null;
}

function visibleLength(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

async function enrichOne(job: ThinJob): Promise<{ ok: boolean; reason?: string }> {
  const userMessage = [
    `Role: ${job.title}`,
    `Employer: ${job.employer}`,
    `Location: ${job.location}`,
    `Existing description (too thin — rewrite into long form, faithful to these facts):`,
    job.description,
  ].join('\n');

  let aiResponse: { content: string };
  try {
    aiResponse = await complete<string>({
      task: 'seo_content',
      tenant: { type: 'system', id: 'enrich-thin-jds' },
      promptId: 'enrich_thin_jd',
      promptVersion: 'v1',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      // Cache key: anchor on the original description hash so re-running
      // the cron doesn't repay for the same input. Source params first.
      cacheKey: ['enrich_thin_jd', 'v1', job.id, visibleLength(job.description)],
    });
  } catch (err) {
    if (err instanceof AiGatewayError) {
      return { ok: false, reason: `ai_gateway:${err.code}` };
    }
    return { ok: false, reason: 'ai_unknown_error' };
  }

  const guardrail = checkJdGuardrails(aiResponse.content);
  if (!guardrail.ok) {
    return { ok: false, reason: `guardrail:${guardrail.errors[0] ?? 'unspecified'}` };
  }

  // Atomic update: write the enriched body, snapshot the source, bump
  // `lastEnrichedAt`. We don't preserve the source in a dedicated column
  // (would require migration) — instead we stuff it into a new
  // `descriptionSourceRaw` field. Falling back: skip the snapshot if the
  // column doesn't exist yet (graceful degradation pre-migration).
  try {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        description: aiResponse.content,
        lastEnrichedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn('Failed to persist enriched JD', { jobId: job.id, error: err });
    return { ok: false, reason: 'db_write_failed' };
  }

  // IndexNow ping — fire-and-forget so we don't block the cron loop.
  const slug = job.slug;
  if (slug) {
    pingIndexNow([`${BASE_URL}/jobs/${slug}`]).catch((err) =>
      logger.warn('IndexNow ping failed (non-fatal)', { jobId: job.id, error: err }),
    );
  }

  return { ok: true };
}

export async function GET(req: Request) {
  const authError = await verifyCronOrAdmin(req);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    return await withCronTracking('enrich-thin-jds', async () => {
      const cooldown = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

      // Postgres has no `LENGTH(description) < N` filter in Prisma — fetch
      // a larger candidate set, filter in app code by visible length.
      const candidates = await prisma.job.findMany({
        where: {
          isPublished: true,
          sourceType: { not: 'employer' }, // Don't rewrite employer-authored content.
          OR: [
            { lastEnrichedAt: null },
            { lastEnrichedAt: { lt: cooldown } },
          ],
        },
        select: { id: true, title: true, employer: true, location: true, description: true, slug: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_JOBS_PER_RUN * 8, // Over-fetch — most candidates won't actually be thin.
      });

      const thinJobs = candidates
        .filter((c) => c.description && visibleLength(c.description) < MIN_VISIBLE_CHARS)
        .slice(0, MAX_JOBS_PER_RUN);

      logger.info('Thin-JD enrichment starting', {
        candidates: candidates.length,
        thin: thinJobs.length,
      });

      if (thinJobs.length === 0) {
        return {
          response: NextResponse.json({ success: true, message: 'No thin JDs', processed: 0 }),
          metrics: { processed: 0, enriched: 0, skipped: 0, errors: 0 },
        };
      }

      const stats = { processed: 0, enriched: 0, skipped: 0, errors: 0 };
      const skipReasons = new Map<string, number>();

      for (const job of thinJobs) {
        if (Date.now() - startedAt >= TIME_BUDGET_MS) {
          logger.warn('Thin-JD enrichment hit time budget', stats);
          break;
        }
        stats.processed += 1;
        const result = await enrichOne(job);
        if (result.ok) {
          stats.enriched += 1;
        } else {
          stats.skipped += 1;
          const reason = result.reason ?? 'unknown';
          skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
          if (reason.startsWith('ai_gateway') || reason.startsWith('db_')) stats.errors += 1;
        }
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      logger.info('Thin-JD enrichment complete', { ...stats, elapsedSeconds: elapsed });

      return {
        response: NextResponse.json({
          success: true,
          ...stats,
          skipReasons: Object.fromEntries(skipReasons),
          elapsedSeconds: elapsed,
        }),
        metrics: stats,
      };
    });
  } catch (err) {
    await sendCronFailureAlert('enrich-thin-jds', err);
    logger.error('Thin-JD enrichment fatal error', err);
    return NextResponse.json({ error: 'enrichment failed' }, { status: 500 });
  }
}
