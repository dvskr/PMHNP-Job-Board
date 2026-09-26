import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { verifyCsrf } from '@/lib/csrf';

/**
 * Alert preferences arrive as raw JSON, so every field can be any type.
 * Unvalidated they crashed the handler in three different ways: a string
 * `specialties` blew up on `.join`, a non-numeric `minExperience` and a
 * numeric `workMode` were rejected by Prisma, and an object `states` was
 * silently coerced to null so the employer was told the alert saved with
 * filters it did not have. Wrong input is a 400 here, not a 500 and not a
 * false success.
 */
const alertSchema = z.object({
    specialties: z.array(z.string()).max(50).optional().nullable(),
    states: z.array(z.string()).max(60).optional().nullable(),
    minExperience: z.number().int().min(0).max(60).optional().nullable(),
    workMode: z.string().max(30).optional().nullable(),
    isActive: z.boolean().optional(),
});

/**
 * Both list columns are stored comma-joined, so a comma inside an entry would
 * split into two bogus filters on read. Drop separators and empties here
 * rather than writing a value the GET handler cannot parse back.
 */
function toStoredList(values: string[] | null | undefined): string | null {
    if (!values?.length) return null;
    const cleaned = values
        .map((v) => sanitizeText(v, 60).replace(/,/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    return cleaned.length ? cleaned.join(',') : null;
}

/**
 * GET /api/employer/candidate-alerts
 * Fetch alert preferences for the authenticated employer.
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

    const alert = await prisma.employerCandidateAlert.findFirst({
        where: { employerId: profile.id },
    });

    return NextResponse.json({
        alert: alert ? {
            id: alert.id,
            specialties: alert.specialties ? alert.specialties.split(',').map(s => s.trim()) : [],
            states: alert.states ? alert.states.split(',').map(s => s.trim()) : [],
            minExperience: alert.minExperience,
            workMode: alert.workMode,
            isActive: alert.isActive,
        } : null,
    });
}

/**
 * POST /api/employer/candidate-alerts
 * Create or update alert preferences.
 * Body: { specialties?: string[], states?: string[], minExperience?: number, workMode?: string, isActive?: boolean }
 */
export async function POST(req: NextRequest) {
    // The session cookie is ambient authority: without an origin check a page
    // on any other site could drive this action from the employer's own
    // browser. SameSite=Lax is what keeps that theoretical today, and this
    // route must not be the reason the site depends on a cookie attribute it
    // does not set itself.
    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'emp-alerts', RATE_LIMITS.employer);
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

    let parsed: z.infer<typeof alertSchema>;
    try {
        parsed = alertSchema.parse(await req.json());
    } catch (err) {
        return NextResponse.json(
            {
                error: 'Invalid alert preferences',
                details: err instanceof z.ZodError
                    ? err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
                    : 'Request body must be JSON',
            },
            { status: 400 },
        );
    }

    const { specialties, states, minExperience, workMode, isActive } = parsed;

    const data = {
        specialties: toStoredList(specialties),
        states: toStoredList(states),
        minExperience: minExperience ?? null,
        workMode: workMode ? sanitizeText(workMode, 30) : null,
        isActive: isActive ?? true,
    };

    // Upsert: find existing or create new
    const existing = await prisma.employerCandidateAlert.findFirst({
        where: { employerId: profile.id },
    });

    if (existing) {
        await prisma.employerCandidateAlert.update({
            where: { id: existing.id },
            data,
        });
    } else {
        await prisma.employerCandidateAlert.create({
            data: {
                employerId: profile.id,
                ...data,
            },
        });
    }

    return NextResponse.json({ success: true });
}

/**
 * DELETE /api/employer/candidate-alerts
 * Disable alerts for this employer.
 */
export async function DELETE(req: NextRequest) {
    // Took no request argument at all, so it had nothing to check an origin
    // against. Turning someone's candidate alerts off from another origin is
    // quiet: they simply stop hearing about new candidates.
    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

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

    await prisma.employerCandidateAlert.updateMany({
        where: { employerId: profile.id },
        data: { isActive: false },
    });

    return NextResponse.json({ success: true });
}
