'use server';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/analytics
 * Comprehensive engagement analytics for the admin dashboard.
 *
 * Query params:
 *  - days: lookback window (default 30, max 365)
 *  - section: optional filter (summary | funnel | views | jobs | users | feedback | reports)
 *  - jobId: drill into a specific job
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365);
        const section = searchParams.get('section');
        const jobId = searchParams.get('jobId');

        const since = new Date();
        since.setDate(since.getDate() - days);
        since.setHours(0, 0, 0, 0);

        // Helper date boundaries
        const now = new Date();
        const oneDayAgo = new Date(now); oneDayAgo.setDate(now.getDate() - 1);
        const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);

        // ──────────────────────────────────────────
        // Per-job drill-down
        // ──────────────────────────────────────────
        if (jobId) {
            const [job, views, clicks, applications] = await Promise.all([
                prisma.job.findUnique({
                    where: { id: jobId },
                    select: {
                        id: true, title: true, employer: true, location: true,
                        viewCount: true, applyClickCount: true,
                        createdAt: true, isPublished: true, isFeatured: true,
                        sourceProvider: true,
                    },
                }),
                prisma.jobViewEvent.findMany({
                    where: { jobId, timestamp: { gte: since } },
                    select: { timestamp: true, referrer: true, sessionId: true },
                    orderBy: { timestamp: 'desc' },
                }),
                prisma.applyClick.findMany({
                    where: { jobId, timestamp: { gte: since } },
                    select: { timestamp: true, source: true, sessionId: true },
                    orderBy: { timestamp: 'desc' },
                }),
                prisma.jobApplication.findMany({
                    where: { jobId, appliedAt: { gte: since } },
                    select: { appliedAt: true, userId: true, status: true },
                    orderBy: { appliedAt: 'desc' },
                }),
            ]);

            if (!job) {
                return NextResponse.json({ error: 'Job not found' }, { status: 404 });
            }

            // Views/clicks by day
            const viewsByDay = groupByDay(views.map(v => v.timestamp));
            const clicksByDay = groupByDay(clicks.map(c => c.timestamp));

            // Referrer breakdown
            const referrers: Record<string, number> = {};
            views.forEach(v => {
                const ref = v.referrer ? new URL(v.referrer).hostname : 'direct';
                referrers[ref] = (referrers[ref] || 0) + 1;
            });

            return NextResponse.json({
                job,
                period: { since: since.toISOString(), days },
                views: { total: views.length, byDay: viewsByDay, referrers },
                clicks: { total: clicks.length, byDay: clicksByDay },
                applications: {
                    total: applications.length,
                    byStatus: applications.reduce((acc, a) => {
                        acc[a.status] = (acc[a.status] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>),
                },
                conversionRates: {
                    viewToClick: views.length > 0 ? +(clicks.length / views.length * 100).toFixed(2) : 0,
                    clickToApply: clicks.length > 0 ? +(applications.length / clicks.length * 100).toFixed(2) : 0,
                    viewToApply: views.length > 0 ? +(applications.length / views.length * 100).toFixed(2) : 0,
                },
            });
        }

        // ──────────────────────────────────────────
        // Full dashboard analytics
        // ──────────────────────────────────────────
        const result: Record<string, unknown> = { period: { since: since.toISOString(), days } };

        // SUMMARY — always include
        if (!section || section === 'summary' || section === 'funnel') {
            const [
                totalViews, totalClicks, totalApplications,
                views24h, views7d, clicks24h, clicks7d,
                apps24h, apps7d,
                totalUsers, newUsers7d,
                totalSubscribers,
                newsletterOptIns,
                activeAlerts, dailyAlerts, weeklyAlerts,
                activeJobs, employerPostedJobs,
                totalEmployerLeads,
            ] = await Promise.all([
                prisma.jobViewEvent.count({ where: { timestamp: { gte: since } } }),
                prisma.applyClick.count({ where: { timestamp: { gte: since } } }),
                prisma.jobApplication.count({ where: { appliedAt: { gte: since } } }),
                prisma.jobViewEvent.count({ where: { timestamp: { gte: oneDayAgo } } }),
                prisma.jobViewEvent.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
                prisma.applyClick.count({ where: { timestamp: { gte: oneDayAgo } } }),
                prisma.applyClick.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
                prisma.jobApplication.count({ where: { appliedAt: { gte: oneDayAgo } } }),
                prisma.jobApplication.count({ where: { appliedAt: { gte: sevenDaysAgo } } }),
                prisma.userProfile.count(),
                prisma.userProfile.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
                prisma.emailLead.count({ where: { isSubscribed: true } }),
                prisma.emailLead.count({ where: { newsletterOptIn: true } }),
                prisma.jobAlert.count({ where: { isActive: true } }),
                prisma.jobAlert.count({ where: { isActive: true, frequency: 'daily' } }),
                prisma.jobAlert.count({ where: { isActive: true, frequency: 'weekly' } }),
                prisma.job.count({ where: { isPublished: true } }),
                prisma.employerJob.count(),
                prisma.employerLead.count(),
            ]);

            // User role breakdown
            const roleBreakdown = await prisma.userProfile.groupBy({
                by: ['role'],
                _count: true,
            });

            // Job source breakdown
            const jobSourceBreakdown = await prisma.job.groupBy({
                by: ['sourceProvider'],
                where: { isPublished: true },
                _count: true,
            });

            // Employer lead status breakdown
            const employerLeadStatuses = await prisma.employerLead.groupBy({
                by: ['status'],
                _count: true,
            });

            result.summary = {
                totalViews, totalClicks, totalApplications,
                views24h, views7d, clicks24h, clicks7d,
                apps24h, apps7d,
                totalUsers, newUsers7d, totalSubscribers,
                newsletterOptIns,
                activeAlerts, dailyAlerts, weeklyAlerts,
                activeJobs, employerPostedJobs,
                totalEmployerLeads,
                roleBreakdown: Object.fromEntries(
                    roleBreakdown.map(r => [r.role, r._count])
                ),
                jobSourceBreakdown: Object.fromEntries(
                    jobSourceBreakdown.map(s => [s.sourceProvider || 'unknown', s._count])
                ),
                employerLeadStatuses: Object.fromEntries(
                    employerLeadStatuses.map(s => [s.status, s._count])
                ),
                conversionRates: {
                    viewToClick: totalViews > 0 ? +(totalClicks / totalViews * 100).toFixed(2) : 0,
                    clickToApply: totalClicks > 0 ? +(totalApplications / totalClicks * 100).toFixed(2) : 0,
                    viewToApply: totalViews > 0 ? +(totalApplications / totalViews * 100).toFixed(2) : 0,
                },
            };
        }

        // VIEWS BY DAY (sparkline data)
        if (!section || section === 'summary' || section === 'views') {
            const viewEvents = await prisma.jobViewEvent.findMany({
                where: { timestamp: { gte: sevenDaysAgo } },
                select: { timestamp: true },
            });
            const clickEvents = await prisma.applyClick.findMany({
                where: { timestamp: { gte: sevenDaysAgo } },
                select: { timestamp: true },
            });
            const appEvents = await prisma.jobApplication.findMany({
                where: { appliedAt: { gte: sevenDaysAgo } },
                select: { appliedAt: true },
            });

            result.sparklines = {
                views: groupByDay(viewEvents.map(v => v.timestamp)),
                clicks: groupByDay(clickEvents.map(c => c.timestamp)),
                applications: groupByDay(appEvents.map(a => a.appliedAt)),
            };
        }

        // TOP PERFORMING JOBS
        if (!section || section === 'summary' || section === 'jobs') {
            const topViewedJobs = await prisma.job.findMany({
                where: { isPublished: true },
                orderBy: { viewCount: 'desc' },
                take: 10,
                select: {
                    id: true, title: true, employer: true,
                    viewCount: true, applyClickCount: true,
                    createdAt: true, sourceProvider: true,
                    _count: { select: { jobApplications: true } },
                },
            });

            result.topJobs = topViewedJobs.map(j => ({
                id: j.id,
                title: j.title,
                employer: j.employer,
                views: j.viewCount,
                clicks: j.applyClickCount,
                applications: j._count.jobApplications,
                viewToClickRate: j.viewCount > 0 ? +(j.applyClickCount / j.viewCount * 100).toFixed(2) : 0,
                source: j.sourceProvider,
                createdAt: j.createdAt,
            }));
        }

        // RECENT ACTIVITY
        if (!section || section === 'summary') {
            const [recentApps, recentUsers, recentSubscribers] = await Promise.all([
                prisma.jobApplication.findMany({
                    orderBy: { appliedAt: 'desc' },
                    take: 5,
                    select: {
                        id: true, appliedAt: true, status: true,
                        user: { select: { email: true, firstName: true, lastName: true } },
                        job: { select: { title: true, employer: true } },
                    },
                }),
                prisma.userProfile.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
                }),
                prisma.emailLead.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: { id: true, email: true, source: true, createdAt: true },
                }),
            ]);

            result.recentActivity = {
                applications: recentApps,
                newUsers: recentUsers,
                newSubscribers: recentSubscribers,
            };
        }

        // USER GROWTH
        if (!section || section === 'users') {
            const usersByDay = await prisma.userProfile.findMany({
                where: { createdAt: { gte: since } },
                select: { createdAt: true },
            });
            const subscribersByDay = await prisma.emailLead.findMany({
                where: { createdAt: { gte: since } },
                select: { createdAt: true },
            });

            result.userGrowth = {
                users: groupByDay(usersByDay.map(u => u.createdAt)),
                subscribers: groupByDay(subscribersByDay.map(s => s.createdAt)),
            };
        }

        // AUTOFILL USAGE
        if (!section || section === 'summary') {
            const autofillCount = await prisma.autofillUsage.count({
                where: { createdAt: { gte: since } },
            });
            const autofillUsers = await prisma.autofillUsage.findMany({
                where: { createdAt: { gte: since } },
                select: { userId: true },
                distinct: ['userId'],
            });

            result.autofill = {
                totalUsage: autofillCount,
                uniqueUsers: autofillUsers.length,
            };
        }

        // FEEDBACK
        if (!section || section === 'feedback') {
            const feedback = await prisma.userFeedback.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: { id: true, rating: true, message: true, page: true, createdAt: true },
            });
            const avgRating = await prisma.userFeedback.aggregate({ _avg: { rating: true } });
            result.feedback = { items: feedback, avgRating: avgRating._avg.rating };
        }

        // JOB REPORTS
        if (!section || section === 'reports') {
            const reports = await prisma.jobReport.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: {
                    id: true, reason: true, details: true, createdAt: true,
                    job: { select: { id: true, title: true, employer: true } },
                },
            });
            result.reports = reports;
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[Admin Analytics] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics' },
            { status: 500 },
        );
    }
}

/* ─── Helpers ─── */

function groupByDay(dates: Date[]): Array<{ date: string; count: number }> {
    const map = new Map<string, number>();
    dates.forEach(d => {
        const key = d.toISOString().split('T')[0]!;
        map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
