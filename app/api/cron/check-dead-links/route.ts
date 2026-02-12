import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 8000; // 8s per URL check
const MAX_JOBS_PER_RUN = 200; // Limit per cron run to stay under Vercel timeout
const TIME_BUDGET_MS = 250_000; // 250s budget

/**
 * Check if an apply URL is still reachable
 * Uses HEAD request first (faster), falls back to GET on failure
 */
async function isLinkAlive(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        // Try HEAD request first (faster, no body download)
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'PMHNP-Hiring-Bot/1.0 (link-checker)',
            },
        });

        clearTimeout(timeout);

        // 2xx and 3xx are alive
        if (response.ok) return true;

        // 404, 410 = dead
        if (response.status === 404 || response.status === 410) return false;

        // 405 Method Not Allowed — some servers don't support HEAD, try GET
        if (response.status === 405 || response.status === 403) {
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT_MS);

            const getResponse = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: controller2.signal,
                headers: {
                    'User-Agent': 'PMHNP-Hiring-Bot/1.0 (link-checker)',
                },
            });

            clearTimeout(timeout2);
            return getResponse.ok;
        }

        // Other errors (500, 502, 503) — assume temporarily down, not dead
        return true;
    } catch (error) {
        // Network errors, timeouts — assume temporarily unreachable
        // Don't unpublish on transient failures
        return true;
    }
}

export async function GET(req: Request) {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        if (process.env.NODE_ENV !== 'development') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startTime = Date.now();

    try {
        console.log('[Dead Link Check] Starting...');

        // Get published jobs, oldest-checked first
        // Jobs that have never been checked (linkLastCheckedAt is null) come first
        const jobs = await prisma.job.findMany({
            where: {
                isPublished: true,
                sourceType: 'external', // Only check external jobs (employer jobs are managed)
            },
            select: {
                id: true,
                applyLink: true,
                title: true,
            },
            orderBy: {
                updatedAt: 'asc', // Check oldest-updated jobs first
            },
            take: MAX_JOBS_PER_RUN,
        });

        console.log(`[Dead Link Check] Checking ${jobs.length} job links...`);

        let checked = 0;
        let dead = 0;
        let alive = 0;
        let errors = 0;

        for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
            // Time budget check
            if (Date.now() - startTime >= TIME_BUDGET_MS) {
                console.warn(`[Dead Link Check] Time budget exhausted. Checked ${checked}/${jobs.length} jobs.`);
                break;
            }

            const batch = jobs.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (job) => {
                    try {
                        const linkAlive = await isLinkAlive(job.applyLink);

                        if (!linkAlive) {
                            // Mark as unpublished
                            await prisma.job.update({
                                where: { id: job.id },
                                data: { isPublished: false },
                            });
                            console.log(`[Dead Link Check] ❌ Dead link: "${job.title}" → ${job.applyLink}`);
                            return 'dead';
                        }

                        return 'alive';
                    } catch {
                        return 'error';
                    }
                })
            );

            for (const result of results) {
                checked++;
                if (result.status === 'fulfilled') {
                    if (result.value === 'dead') dead++;
                    else if (result.value === 'alive') alive++;
                    else errors++;
                } else {
                    errors++;
                }
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const summary = { checked, alive, dead, errors, elapsedSeconds: elapsed };

        console.log(`[Dead Link Check] Complete:`, summary);

        return NextResponse.json({
            success: true,
            ...summary,
        });
    } catch (error) {
        console.error('[Dead Link Check] Fatal error:', error);
        return NextResponse.json(
            { error: 'Dead link check failed' },
            { status: 500 }
        );
    }
}
