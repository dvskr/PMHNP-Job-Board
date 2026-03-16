import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getEmployerTier } from '@/lib/tier-limits';

/**
 * GET /api/employer/analytics/csv
 * Premium-only: Download analytics data as CSV.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Gate: Premium only
    const tier = profile.role === 'admin' ? 'premium' : await getEmployerTier(user.id);
    if (tier !== 'premium') {
        return NextResponse.json({
            error: 'CSV export is available for Premium tier only',
            tier,
            upgradeRequired: true,
        }, { status: 403 });
    }

    // Get all employer jobs with analytics
    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { contactEmail: user.email! },
            ],
        },
        include: {
            job: {
                select: {
                    id: true,
                    title: true,
                    viewCount: true,
                    applyClickCount: true,
                    isFeatured: true,
                    createdAt: true,
                    expiresAt: true,
                    isPublished: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Build CSV
    const headers = ['Job Title', 'Job ID', 'Status', 'Featured', 'Views', 'Apply Clicks', 'CTR (%)', 'Posted Date', 'Expires Date'];
    const rows = employerJobs.map(ej => {
        const j = ej.job;
        const views = j.viewCount || 0;
        const clicks = j.applyClickCount || 0;
        const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
        const status = j.isPublished && (!j.expiresAt || new Date(j.expiresAt) > new Date()) ? 'Active' : 'Expired';
        const posted = j.createdAt.toISOString().split('T')[0];
        const expires = j.expiresAt ? j.expiresAt.toISOString().split('T')[0] : 'N/A';

        return [
            `"${j.title.replace(/"/g, '""')}"`,
            j.id,
            status,
            j.isFeatured ? 'Yes' : 'No',
            views.toString(),
            clicks.toString(),
            ctr,
            posted,
            expires,
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const date = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="pmhnp-analytics-${date}.csv"`,
        },
    });
}
