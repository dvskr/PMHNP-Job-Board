import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/employer/tags — List employer's custom tags
 * POST /api/employer/tags — Create a new tag { name, color }
 * DELETE /api/employer/tags — Delete a tag { tagId }
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

    const tags = await prisma.candidateTag.findMany({
        where: { employerId: profile.id },
        orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ tags });
}

export async function POST(req: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'emp-tags', RATE_LIMITS.employer);
    if (rateLimitResult) return rateLimitResult;

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

    const body = await req.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    // Check limit (max 20 tags)
    const count = await prisma.candidateTag.count({ where: { employerId: profile.id } });
    if (count >= 20) {
        return NextResponse.json({ error: 'Maximum 20 tags allowed' }, { status: 400 });
    }

    try {
        const tag = await prisma.candidateTag.create({
            data: {
                employerId: profile.id,
                name: name.trim(),
                color: color || '#0D9488',
            },
        });
        return NextResponse.json({ tag }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
    }
}

export async function DELETE(req: NextRequest) {
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

    const body = await req.json();
    const { tagId } = body;

    if (!tagId) {
        return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
    }

    await prisma.candidateTag.deleteMany({
        where: { id: tagId, employerId: profile.id },
    });

    return NextResponse.json({ success: true });
}
