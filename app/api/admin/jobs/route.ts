import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/jobs
 * Admin-level job listing with search, filters, pagination.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
        const search = searchParams.get('search')?.trim();
        const source = searchParams.get('source');
        const published = searchParams.get('published'); // 'true' | 'false' | null
        const featured = searchParams.get('featured');   // 'true' | 'false' | null
        const sort = searchParams.get('sort') || 'newest'; // newest | oldest | views | clicks | title

        // Build where clause
        const where: Record<string, unknown> = {};

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { employer: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (source && source !== 'all') {
            where.sourceProvider = source;
        }
        if (published === 'true') where.isPublished = true;
        if (published === 'false') where.isPublished = false;
        if (featured === 'true') where.isFeatured = true;
        if (featured === 'false') where.isFeatured = false;

        // Sort
        let orderBy: Record<string, unknown>[] = [{ createdAt: 'desc' }];
        if (sort === 'oldest') orderBy = [{ createdAt: 'asc' }];
        else if (sort === 'views') orderBy = [{ viewCount: 'desc' }];
        else if (sort === 'clicks') orderBy = [{ applyClickCount: 'desc' }];
        else if (sort === 'title') orderBy = [{ title: 'asc' }];

        const skip = (page - 1) * limit;

        const [jobs, total] = await Promise.all([
            prisma.job.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    employer: true,
                    location: true,
                    city: true,
                    state: true,
                    jobType: true,
                    mode: true,
                    displaySalary: true,
                    sourceProvider: true,
                    isPublished: true,
                    isFeatured: true,
                    isVerifiedEmployer: true,
                    viewCount: true,
                    applyClickCount: true,
                    qualityScore: true,
                    createdAt: true,
                    updatedAt: true,
                    expiresAt: true,
                    applyLink: true,
                    _count: { select: { jobApplications: true } },
                },
            }),
            prisma.job.count({ where }),
        ]);

        // Get unique source providers for filter options
        const sources = await prisma.job.groupBy({
            by: ['sourceProvider'],
            _count: true,
            orderBy: { _count: { sourceProvider: 'desc' } },
        });

        return NextResponse.json({
            success: true,
            jobs: jobs.map(j => ({
                ...j,
                applications: j._count.jobApplications,
                _count: undefined,
            })),
            total,
            page,
            totalPages: Math.ceil(total / limit),
            sources: sources.map(s => ({
                source: s.sourceProvider || 'unknown',
                count: s._count,
            })),
        });
    } catch (error) {
        console.error('[Admin Jobs] GET error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch jobs' }, { status: 500 });
    }
}

/**
 * POST /api/admin/jobs
 * Create a new job from admin panel.
 */
export async function POST(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { title, employer, location, description, applyLink, ...rest } = body;

        if (!title || !employer || !location || !description || !applyLink) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: title, employer, location, description, applyLink' },
                { status: 400 },
            );
        }

        // Generate slug
        const baseSlug = `${title}-${employer}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80);
        const slug = `${baseSlug}-${Date.now().toString(36)}`;

        const job = await prisma.job.create({
            data: {
                title,
                employer,
                location,
                description,
                applyLink,
                slug,
                sourceType: 'direct',
                sourceProvider: 'admin',
                isPublished: rest.isPublished ?? true,
                isFeatured: rest.isFeatured ?? false,
                jobType: rest.jobType || null,
                mode: rest.mode || null,
                city: rest.city || null,
                state: rest.state || null,
                salaryRange: rest.salaryRange || null,
                minSalary: rest.minSalary || null,
                maxSalary: rest.maxSalary || null,
                salaryPeriod: rest.salaryPeriod || null,
                displaySalary: rest.displaySalary || null,
                isRemote: rest.isRemote ?? false,
                isHybrid: rest.isHybrid ?? false,
                benefits: rest.benefits || [],
                setting: rest.setting || null,
                population: rest.population || null,
            },
        });

        return NextResponse.json({ success: true, job }, { status: 201 });
    } catch (error) {
        console.error('[Admin Jobs] POST error:', error);
        return NextResponse.json({ success: false, error: 'Failed to create job' }, { status: 500 });
    }
}
