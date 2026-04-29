/**
 * Daily anomaly-detection cron for the job-health system.
 *
 * Runs `detectAnomalies` against the last 24h of `job_health_checks`,
 * compares to the 7-day baseline, and emits each detected event via
 * `emitAnomaly` (structured log + Sentry message).
 *
 * Conservative defaults the first run; tune via env vars after observing
 * 1-2 weeks of real data:
 *   JOB_HEALTH_ANOMALY_DEAD_SIGMA   (default 3)
 *   JOB_HEALTH_ANOMALY_SOFT_MULT    (default 5)
 *   JOB_HEALTH_ANOMALY_SKIP_PCT     (default 80)
 *   JOB_HEALTH_ANOMALY_FLIP_MULT    (default 4)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { detectAnomalies, emitAnomaly } from '@/lib/health/anomaly-alerts';

export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'health-anomaly-check' });

    const authError = checkAuth(req);
    if (authError) return authError;

    const startTime = Date.now();
    try {
        log.info('Starting health anomaly sweep');
        const result = await detectAnomalies({ prisma });

        for (const anomaly of result.anomalies) {
            await emitAnomaly(anomaly);
        }

        const summary = {
            success: true,
            anomaliesDetected: result.anomalies.length,
            countersAnalyzed: result.countersAnalyzed,
            detectorVersion: result.detectorVersion,
            elapsedSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
        };
        log.info('Anomaly sweep complete', summary);
        return NextResponse.json(summary);
    } catch (error: unknown) {
        log.error('Fatal error in anomaly sweep', error);
        return NextResponse.json({ error: 'Anomaly sweep failed' }, { status: 500 });
    }
}

function checkAuth(req: Request): NextResponse | null {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        if (process.env.NODE_ENV !== 'development') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }
    return null;
}
