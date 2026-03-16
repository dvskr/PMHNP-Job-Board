import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/email/history
 * Returns a paginated list of past broadcasts.
 */
export async function GET(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    try {
        const [broadcasts, total] = await Promise.all([
            prisma.emailBroadcast.findMany({
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    subject: true,
                    audience: true,
                    audienceCount: true,
                    status: true,
                    sentAt: true,
                    sentCount: true,
                    failedCount: true,
                    scheduledFor: true,
                    createdAt: true,
                },
            }),
            prisma.emailBroadcast.count(),
        ]);

        return NextResponse.json({
            success: true,
            broadcasts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('[Admin Email History] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch history' }, { status: 500 });
    }
}
