import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkSourceHealth } from '@/lib/ingestion-monitor';
import { sendDailyReport, sendHealthAlert } from '@/lib/discord-notifier';

export const maxDuration = 60; // 1 minute — DB aggregations + Discord webhook

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[CRON] Starting daily quality report...');
        const startTime = Date.now();
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Total published
        const totalPublished = await prisma.job.count({ where: { isPublished: true } });

        // Added last 24h
        const addedLast24h = await prisma.job.count({
            where: { isPublished: true, createdAt: { gte: oneDayAgo } },
        });

        // Unpublished last 24h (approximation via updatedAt + !isPublished)
        const unpublishedLast24h = await prisma.job.count({
            where: { isPublished: false, updatedAt: { gte: oneDayAgo } },
        });

        // Salary coverage
        const withSalary = await prisma.job.count({
            where: { isPublished: true, normalizedMinSalary: { not: null } },
        });
        const salaryPercent = totalPublished > 0 ? Math.round((withSalary / totalPublished) * 100) : 0;

        // City coverage
        const withCity = await prisma.job.count({
            where: { isPublished: true, city: { not: null } },
        });
        const cityPercent = totalPublished > 0 ? Math.round((withCity / totalPublished) * 100) : 0;

        // Average quality score
        const avgResult = await prisma.job.aggregate({
            where: { isPublished: true },
            _avg: { qualityScore: true },
        });
        const avgQualityScore = avgResult._avg.qualityScore || 0;

        // Top sources (last 24h)
        const topSourcesRaw = await prisma.job.groupBy({
            by: ['sourceProvider'],
            where: { isPublished: true, createdAt: { gte: oneDayAgo } },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5,
        });
        const topSources = topSourcesRaw.map(s => ({
            source: s.sourceProvider || 'unknown',
            count: s._count.id,
        }));

        // Source health check
        const health = await checkSourceHealth();
        const healthAlerts = health
            .filter(h => h.alert)
            .map(h => h.alert!);

        // Send Discord report
        await sendDailyReport({
            totalPublished,
            addedLast24h,
            unpublishedLast24h,
            salaryPercent,
            cityPercent,
            avgQualityScore,
            topSources,
            healthAlerts,
        });

        // Send separate health alerts if any
        const alertSources = health.filter(h => h.alert);
        if (alertSources.length > 0) {
            await sendHealthAlert(alertSources.map(h => ({
                source: h.source,
                alert: h.alert!,
                status: h.status,
            })));
        }

        const duration = Date.now() - startTime;
        const summary = {
            success: true,
            totalPublished,
            addedLast24h,
            salaryPercent,
            cityPercent,
            avgQualityScore: Math.round(avgQualityScore * 10) / 10,
            healthAlerts: healthAlerts.length,
            duration: `${(duration / 1000).toFixed(1)}s`,
        };

        console.log('[CRON] Daily report complete:', summary);
        return NextResponse.json(summary);
    } catch (error) {
        console.error('[CRON] Daily report error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
