/**
 * Per-employer daily AI usage caps.
 *
 * Single source of truth for "how many times today has this employer
 * called task X?" Queries the canonical `ai_call_log` table (already
 * written on every successful gateway call via lib/ai/cost-tracker.ts).
 *
 * Why centralize:
 *   - The talent_search rerank cap was inline in its own route.
 *   - The JD-generator cap was localStorage-only — bypassable.
 *   - Future AI features (cover-letter, bias-audit, etc.) will all
 *     want the same shape. Putting it here means one place to change.
 *
 * Reset window: midnight America/Chicago. See lib/time.ts.
 */

import { prisma } from './prisma';
import { midnightCentralTimeAsUtc, nextMidnightCentralTimeAsUtc } from './time';

/**
 * Per-day caps by task. Add entries here when shipping new AI features
 * that need a per-employer ceiling. Tasks not listed are uncapped at
 * this layer (the Redis-backed `rateLimit()` middleware still applies).
 */
export const AI_DAILY_CAPS: Readonly<Record<string, number>> = Object.freeze({
  jd_generator: 5,           // Generous for first-time iteration; PMHNP JDs need a few tries to nail facts
  talent_search_rerank: 10,  // Mirrors the existing limit in app/api/employer/talent/search
});

export interface AiUsageSnapshot {
  task: string;
  used: number;
  cap: number;
  remaining: number;
  resetAtIso: string;
}

/**
 * Returns the employer's current usage for `task` against the daily
 * cap, plus the ISO timestamp at which the window resets. Pure read —
 * never mutates. Callers should invoke before the AI call to decide
 * whether to allow it, and re-invoke after to refresh the badge.
 */
export async function getEmployerAiUsage(
  userId: string,
  task: keyof typeof AI_DAILY_CAPS | string,
): Promise<AiUsageSnapshot> {
  const cap = AI_DAILY_CAPS[task as keyof typeof AI_DAILY_CAPS] ?? Infinity;
  const since = midnightCentralTimeAsUtc();

  const used = await prisma.aiCallLog.count({
    where: {
      task,
      tenantType: 'employer',
      tenantId: userId,
      createdAt: { gte: since },
      // Guardrail-rejected calls (recordAiCall is called with error set)
      // SHOULD count as usage — the gateway already paid the model for
      // them. If we want to be lenient on rejections we'd add
      // `error: null` to the filter. Keeping them counted is the
      // talent_search precedent.
    },
  });

  return {
    task,
    used,
    cap: Number.isFinite(cap) ? cap : 0,
    remaining: Number.isFinite(cap) ? Math.max(0, cap - used) : Infinity,
    resetAtIso: nextMidnightCentralTimeAsUtc().toISOString(),
  };
}
