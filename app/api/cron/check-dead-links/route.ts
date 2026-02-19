import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BATCH_SIZE = 15;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_JOBS_PER_RUN = 1500;  // Check up to 1500 per run
const TIME_BUDGET_MS = 250_000; // 250s budget (Vercel 300s max)
const BATCH_DELAY_MS = 200;     // Rate-limit delay between batches

/**
 * Check if an apply URL is still reachable.
 * HEAD first (faster), falls back to GET on 405/403.
 * 404/410 = dead. Network errors = assume alive (transient).
 */
async function isLinkAlive(url: string): Promise<{ alive: boolean; status: number }> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PMHNPHiring-LinkChecker/1.0)',
            },
        });
        clearTimeout(timeout);

        if (response.ok) return { alive: true, status: response.status };
        if (response.status === 404 || response.status === 410) return { alive: false, status: response.status };

        // Some servers block HEAD — retry with GET
        if (response.status === 405 || response.status === 403) {
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT_MS);

            const getResponse = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: controller2.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; PMHNPHiring-LinkChecker/1.0)',
                },
            });
            clearTimeout(timeout2);

            if (getResponse.status === 404 || getResponse.status === 410) {
                return { alive: false, status: getResponse.status };
            }
            return { alive: getResponse.ok, status: getResponse.status };
        }

        // 5xx errors — assume temporarily down, not dead
        return { alive: true, status: response.status };
    } catch {
        // Network errors, timeouts — don't unpublish (could be temporary)
        return { alive: true, status: 0 };
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

        // Get published external jobs with apply links
        // Order by updatedAt ASC so the least-recently-checked jobs get checked first.
        // After we check a job, its updatedAt stays the same (we only update on unpublish),
        // ensuring a fair rotation.
        const jobs = await prisma.job.findMany({
            where: {
                isPublished: true,
                sourceType: 'external',
                applyLink: { not: '' },
            },
            select: {
                id: true,
                applyLink: true,
                title: true,
                sourceProvider: true,
            },
            orderBy: {
                updatedAt: 'asc',
            },
            take: MAX_JOBS_PER_RUN,
        });

        console.log(`[Dead Link Check] Checking ${jobs.length} job links...`);

        let checked = 0;
        let dead = 0;
        let alive = 0;
        let errors = 0;
        const deadIds: string[] = [];
        const deadBySource: Record<string, number> = {};

        for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
            // Time budget check
            if (Date.now() - startTime >= TIME_BUDGET_MS) {
                console.warn(`[Dead Link Check] Time budget exhausted at ${checked}/${jobs.length} jobs.`);
                break;
            }

            const batch = jobs.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (job) => {
                    if (!job.applyLink) return 'error';
                    const result = await isLinkAlive(job.applyLink);

                    if (!result.alive) {
                        deadIds.push(job.id as string);
                        const src = job.sourceProvider || 'unknown';
                        deadBySource[src] = (deadBySource[src] || 0) + 1;
                        console.log(`[Dead Link Check] 💀 [${src}] "${job.title}" → ${result.status}`);
                        return 'dead';
                    }

                    return result.status === 0 ? 'error' : 'alive';
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

            // Batch unpublish every 50 dead links to avoid accumulating too many
            if (deadIds.length >= 50 && deadIds.length % 50 < BATCH_SIZE) {
                await prisma.job.updateMany({
                    where: { id: { in: deadIds } },
                    data: { isPublished: false },
                });
            }

            // Rate limit between batches
            if (i + BATCH_SIZE < jobs.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        // Final batch unpublish
        if (deadIds.length > 0) {
            await prisma.job.updateMany({
                where: { id: { in: deadIds } },
                data: { isPublished: false },
            });
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const summary = {
            checked,
            alive,
            dead,
            errors,
            deadBySource,
            elapsedSeconds: elapsed,
        };

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
