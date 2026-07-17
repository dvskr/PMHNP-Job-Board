import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logAudit } from '@/lib/audit-log';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';

/**
 * GET /api/admin/jobs
 * Admin-level job listing with search, filters, pagination.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    // Audit log: admin accessing job data
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    void logAudit({
        action: 'admin.jobs.list',
        actorType: 'admin',
        metadata: { email: user?.email || 'unknown' },
    });

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
            // Employer-posted jobs have sourceType='employer' and a null
            // sourceProvider — filter on sourceType for that virtual bucket.
            // Everything else filters on sourceProvider as before.
            if (source === 'employer') {
                where.sourceType = 'employer';
            } else {
                where.sourceProvider = source;
            }
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

        // Get unique source providers for filter options. Group on both
        // sourceProvider AND sourceType so we can split "employer-posted"
        // out of the catch-all "unknown" bucket — employer postings
        // (paid via Stripe) have sourceType='employer' and a null
        // sourceProvider, but admins want them surfaced as their own
        // first-class filter, not lumped with truly-unknown rows.
        const sourceGroups = await prisma.job.groupBy({
            by: ['sourceProvider', 'sourceType'],
            _count: true,
        });
        const sourceCounts = new Map<string, number>();
        for (const g of sourceGroups) {
            const label = g.sourceProvider
                ? g.sourceProvider
                : g.sourceType === 'employer'
                    ? 'employer'
                    : 'unknown';
            sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + g._count);
        }
        const sources = [...sourceCounts.entries()]
            .map(([source, count]) => ({ source, count }))
            .sort((a, b) => b.count - a.count);

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
            sources,
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

        // GSC Fix (2026-07 audit, review finding): mint the id first and use
        // the shared slugify(title, id) — the same pattern as ingest
        // (lib/ingestion-service.ts). The previous base36-timestamp suffix
        // produced non-UUID slugs that middleware.ts's unknown-taxonomy guard
        // answered with 410, killing every admin-created job's page.
        const id = randomUUID();
        const slug = slugify(`${title} ${employer}`, id);

        const job = await prisma.job.create({
            data: {
                id,
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
