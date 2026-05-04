/**
 * Daily eval drift detection — Sprint 0.2.7.
 *
 * Runs every registered eval suite on a schedule, persists each result to
 * `ai_eval_snapshot`, then compares the latest snapshot's mean score against
 * the 7-day moving average. Drops >10% trigger a Discord alert via the
 * existing alerts pipeline (lib/discord-notifier.ts).
 *
 * Why a separate cron and not the CI gate: CI catches *intentional* prompt
 * regressions before merge. This catches *unintentional* drift caused by
 * upstream model updates (the same prompt slowly returning worse output as
 * the provider tunes their model).
 *
 * Cost: at full registry coverage (~10 suites × 100 cases × ~$0.001 each)
 * = ~$1/day. Bounded.
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { EVAL_REGISTRY } from '@/lib/ai/eval';
import { sendDiscordMessage } from '@/lib/discord-notifier';
import type { AiTaskId } from '@/lib/ai/types';

const DRIFT_THRESHOLD_PCT = 10; // alert when 7-day mean drops more than this %.

export const evalDriftDaily = inngest.createFunction(
    {
        id: 'ai-eval-drift-daily',
        name: 'AI eval drift — daily snapshot + 7d moving-average alert',
        // Trigger: 08:00 UTC daily (~midnight Pacific, off-peak).
        triggers: [{ cron: 'TZ=UTC 0 8 * * *' }],
        retries: 2,
        // Concurrency 1 — never run two snapshots at the same time.
        concurrency: 1,
    },
    async ({ step }) => {
        // Drift snapshots cover golden suites only — ranking suites
        // (job_search, candidate_recommendations) are scored separately
        // because their inputs depend on live DB state, not a frozen LLM output.
        const tasks = (Object.keys(EVAL_REGISTRY) as AiTaskId[]).filter((t) => !!EVAL_REGISTRY[t]?.runGolden);
        const results: Array<{ task: AiTaskId; meanScore: number; passed: number; total: number; cost: number }> = [];

        for (const task of tasks) {
            const entry = EVAL_REGISTRY[task]!;
            const runGolden = entry.runGolden!;
            const result = await step.run(`run-golden-${task}`, async () => runGolden());
            results.push({
                task,
                meanScore: result.meanScore,
                passed: result.passed,
                total: result.totalCases,
                cost: result.totalCostUsd,
            });

            await step.run(`persist-${task}`, async () => {
                await prisma.aiEvalSnapshot.create({
                    data: {
                        task,
                        promptVersion: result.promptVersion,
                        meanScore: result.meanScore,
                        passed: result.passed,
                        totalCases: result.totalCases,
                        costUsd: result.totalCostUsd,
                        p95LatencyMs: result.p95LatencyMs,
                        holdsBaseline: result.holdsBaseline,
                    },
                });
            });
        }

        // Compare each task's latest score to its 7-day average.
        for (const r of results) {
            await step.run(`drift-check-${r.task}`, async () => {
                const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const recent = await prisma.aiEvalSnapshot.findMany({
                    where: { task: r.task, createdAt: { gte: since } },
                    select: { meanScore: true },
                });
                if (recent.length < 3) return; // Too few datapoints to draw a trend.
                const avg = recent.reduce((a, b) => a + b.meanScore, 0) / recent.length;
                const dropPct = ((avg - r.meanScore) / Math.max(avg, 0.0001)) * 100;
                if (dropPct > DRIFT_THRESHOLD_PCT) {
                    const msg = `🚨 AI eval drift on \`${r.task}\`: today=${r.meanScore.toFixed(3)} vs 7d-avg=${avg.toFixed(3)} (drop ${dropPct.toFixed(1)}%, threshold ${DRIFT_THRESHOLD_PCT}%)`;
                    logger.warn('AI eval drift detected', { task: r.task, today: r.meanScore, avg7d: avg, dropPct });
                    await sendDiscordMessage(msg);
                }
            });
        }

        return { evaluated: results.length };
    },
);

export const evalDriftFunctions = [evalDriftDaily] as const;
