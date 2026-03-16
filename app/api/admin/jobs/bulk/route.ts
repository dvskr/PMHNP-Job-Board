import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * POST /api/admin/jobs/bulk
 * Bulk actions on multiple jobs.
 * Body: { action: 'publish' | 'unpublish' | 'feature' | 'unfeature' | 'delete' | 'hard_delete', jobIds: string[] }
 */
export async function POST(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { action, jobIds } = body;

        if (!action || !Array.isArray(jobIds) || jobIds.length === 0) {
            return NextResponse.json(
                { success: false, error: 'action and jobIds[] are required' },
                { status: 400 },
            );
        }

        if (jobIds.length > 100) {
            return NextResponse.json(
                { success: false, error: 'Maximum 100 jobs per bulk action' },
                { status: 400 },
            );
        }

        let result;

        switch (action) {
            case 'publish':
                result = await prisma.job.updateMany({
                    where: { id: { in: jobIds } },
                    data: { isPublished: true },
                });
                break;

            case 'unpublish':
                result = await prisma.job.updateMany({
                    where: { id: { in: jobIds } },
                    data: { isPublished: false },
                });
                break;

            case 'feature':
                result = await prisma.job.updateMany({
                    where: { id: { in: jobIds } },
                    data: { isFeatured: true },
                });
                break;

            case 'unfeature':
                result = await prisma.job.updateMany({
                    where: { id: { in: jobIds } },
                    data: { isFeatured: false },
                });
                break;

            case 'delete':
                result = await prisma.job.updateMany({
                    where: { id: { in: jobIds } },
                    data: { isPublished: false },
                });
                break;

            case 'hard_delete':
                result = await prisma.job.deleteMany({
                    where: { id: { in: jobIds } },
                });
                break;

            default:
                return NextResponse.json(
                    { success: false, error: `Invalid action: ${action}. Supported: publish, unpublish, feature, unfeature, delete, hard_delete` },
                    { status: 400 },
                );
        }

        return NextResponse.json({
            success: true,
            action,
            affected: result.count,
        });
    } catch (error) {
        console.error('[Admin Jobs Bulk] Error:', error);
        return NextResponse.json({ success: false, error: 'Bulk action failed' }, { status: 500 });
    }
}
