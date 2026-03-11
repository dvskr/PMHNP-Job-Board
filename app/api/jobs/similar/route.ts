import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }

    // Get the source job
    const sourceJob = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
            id: true,
            title: true,
            location: true,
            mode: true,
            jobType: true,
            employer: true,
        },
    });

    if (!sourceJob) {
        return NextResponse.json({ jobs: [] });
    }

    // Find similar jobs by matching mode, jobType, or location keywords
    const locationKeywords = sourceJob.location
        .split(/[,\s]+/)
        .filter(w => w.length > 2)
        .slice(0, 3);

    const similar = await prisma.job.findMany({
        where: {
            id: { not: sourceJob.id },
            isPublished: true,
            expiresAt: { gt: new Date() },
            OR: [
                { mode: sourceJob.mode },
                { jobType: sourceJob.jobType },
                ...(locationKeywords.length > 0
                    ? locationKeywords.map(kw => ({
                        location: { contains: kw, mode: 'insensitive' as const },
                    }))
                    : []),
            ],
        },
        select: {
            id: true,
            title: true,
            employer: true,
            location: true,
            mode: true,
            jobType: true,
            slug: true,
            isFeatured: true,
            minSalary: true,
            maxSalary: true,
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        take: 3,
    });

    return NextResponse.json({ jobs: similar });
}
