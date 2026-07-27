/**
 * Atomic per-candidate daily quota for the resume studio's AI tasks.
 *
 * Why this exists instead of counting ai_call_log rows (lib/ai-usage.ts):
 *   1. TOCTOU — a read-only COUNT precheck lets N concurrent requests all
 *      observe remaining>0 before any row is written, blowing past a 3/day
 *      cap. This reserves atomically (Redis INCR) BEFORE the model call.
 *   2. Failure accounting — ai_call_log gets a row for every terminal
 *      outcome including our own failures (all_providers_failed,
 *      invalid_output), so an outage would silently burn a candidate's
 *      tiny free allowance. Here the caller releases the reservation on any
 *      failure, so only successful generations count.
 *
 * The reservation is the enforcement AND display meter for these tasks;
 * ai_call_log remains the cost/observability record (written by the
 * gateway, untouched here). Redis-backed with an in-memory fallback that
 * mirrors lib/rate-limit.ts (per-instance only on serverless, same known
 * limitation). Fail-open on Redis error: a free feature must not hard-fail
 * because the counter is briefly unreachable.
 */
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';
import { AI_DAILY_CAPS } from '@/lib/ai-usage';
import { midnightCentralTimeAsUtc, nextMidnightCentralTimeAsUtc } from '@/lib/time';

export type ResumeQuotaTask = 'resume_review' | 'resume_tailoring' | 'cover_letter';

export interface QuotaSnapshot {
  task: string;
  used: number;
  cap: number;
  remaining: number;
  resetAtIso: string;
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/** In-memory fallback counter. Keyed the same as Redis; the day segment in
 *  the key makes yesterday's entries dead weight that never matches again. */
const memoryCounts = new Map<string, number>();

function capFor(task: ResumeQuotaTask): number {
  return AI_DAILY_CAPS[task] ?? Infinity;
}

/** Stable per-CT-day bucket id (epoch millis of the current CT midnight). */
function dayBucket(): string {
  return String(midnightCentralTimeAsUtc().getTime());
}

function keyFor(task: ResumeQuotaTask, userId: string): string {
  return `resume-studio:aiquota:${task}:${userId}:${dayBucket()}`;
}

function secondsUntilReset(): number {
  return Math.max(60, Math.ceil((nextMidnightCentralTimeAsUtc().getTime() - Date.now()) / 1000));
}

function snapshot(task: string, cap: number, used: number): QuotaSnapshot {
  const boundedUsed = Math.max(0, Math.min(used, cap));
  return {
    task,
    used: boundedUsed,
    cap,
    remaining: Math.max(0, cap - used),
    resetAtIso: nextMidnightCentralTimeAsUtc().toISOString(),
  };
}

/**
 * Atomically reserve one unit of the daily quota. Returns allowed=false with
 * a spent snapshot when the cap is already reached. Callers MUST call
 * releaseDailyQuota() if the downstream work then fails.
 */
export async function reserveDailyQuota(
  userId: string,
  task: ResumeQuotaTask,
): Promise<{ allowed: boolean; snapshot: QuotaSnapshot }> {
  const cap = capFor(task);
  if (!Number.isFinite(cap)) return { allowed: true, snapshot: snapshot(task, cap, 0) };

  const key = keyFor(task, userId);

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, secondsUntilReset());
      if (count > cap) {
        await redis.decr(key); // undo our over-cap increment
        return { allowed: false, snapshot: snapshot(task, cap, cap) };
      }
      return { allowed: true, snapshot: snapshot(task, cap, count) };
    } catch (err) {
      logger.warn('resume-studio quota reserve failed; allowing (fail-open)', { task, error: err });
      return { allowed: true, snapshot: snapshot(task, cap, 0) };
    }
  }

  const next = (memoryCounts.get(key) ?? 0) + 1;
  if (next > cap) return { allowed: false, snapshot: snapshot(task, cap, cap) };
  memoryCounts.set(key, next);
  return { allowed: true, snapshot: snapshot(task, cap, next) };
}

/** Return one previously-reserved unit (call on any downstream failure). */
export async function releaseDailyQuota(userId: string, task: ResumeQuotaTask): Promise<void> {
  const cap = capFor(task);
  if (!Number.isFinite(cap)) return;

  const key = keyFor(task, userId);

  if (redis) {
    try {
      const value = await redis.decr(key);
      if (value < 0) await redis.set(key, 0, { ex: secondsUntilReset() }); // floor at 0
    } catch (err) {
      logger.warn('resume-studio quota release failed', { task, error: err });
    }
    return;
  }

  memoryCounts.set(key, Math.max(0, (memoryCounts.get(key) ?? 0) - 1));
}

/** Read the current reservation without consuming one (badge display). */
export async function peekDailyQuota(userId: string, task: ResumeQuotaTask): Promise<QuotaSnapshot> {
  const cap = capFor(task);
  if (!Number.isFinite(cap)) return snapshot(task, cap, 0);

  const key = keyFor(task, userId);

  if (redis) {
    try {
      const value = await redis.get<number>(key);
      return snapshot(task, cap, Number(value ?? 0));
    } catch (err) {
      logger.warn('resume-studio quota peek failed', { task, error: err });
      return snapshot(task, cap, 0);
    }
  }

  return snapshot(task, cap, memoryCounts.get(key) ?? 0);
}
