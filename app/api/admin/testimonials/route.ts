import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logAudit } from '@/lib/audit-log';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/testimonials
 *
 * Lists every employer testimonial (consented or not) so admins can review
 * submissions before featuring them. Consent and displayAs are surfaced so
 * the UI can show exactly how a testimonial would appear publicly.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const testimonials = await prisma.employerTestimonial.findMany({
            select: {
                id: true,
                employerName: true,
                content: true,
                rating: true,
                consent: true,
                displayAs: true,
                featuredAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ success: true, testimonials });
    } catch (error) {
        logger.error('[Admin Testimonials] GET error', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch testimonials' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/admin/testimonials
 *
 * Body: { id: string, featured: boolean }
 *
 * Sets featuredAt (featured=true) or clears it (featured=false). Featuring
 * is ONLY allowed when the employer gave explicit consent — a testimonial
 * without consent can never be made public. Unfeaturing is always allowed
 * so an admin can immediately pull a testimonial even if consent was later
 * revoked directly in the database.
 */
export async function PATCH(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { id, featured } = body as { id?: unknown; featured?: unknown };

        if (typeof id !== 'string' || id.length === 0) {
            return NextResponse.json(
                { success: false, error: 'A testimonial id is required.' },
                { status: 400 }
            );
        }
        if (typeof featured !== 'boolean') {
            return NextResponse.json(
                { success: false, error: 'The featured flag must be true or false.' },
                { status: 400 }
            );
        }

        const testimonial = await prisma.employerTestimonial.findUnique({
            where: { id },
            select: { id: true, consent: true, featuredAt: true },
        });

        if (!testimonial) {
            return NextResponse.json(
                { success: false, error: 'Testimonial not found.' },
                { status: 404 }
            );
        }

        // Hard consent gate: never allow a non-consented testimonial to be
        // featured. This is the server-side backstop for the UI toggle.
        if (featured && testimonial.consent !== true) {
            return NextResponse.json(
                { success: false, error: 'This testimonial cannot be featured because the employer did not consent to public display.' },
                { status: 409 }
            );
        }

        const updated = await prisma.employerTestimonial.update({
            where: { id },
            data: { featuredAt: featured ? new Date() : null },
            select: {
                id: true,
                employerName: true,
                consent: true,
                displayAs: true,
                featuredAt: true,
            },
        });

        void logAudit({
            action: featured ? 'admin.testimonial.feature' : 'admin.testimonial.unfeature',
            actorType: 'admin',
            targetType: 'testimonial',
            targetId: id,
        });

        return NextResponse.json({ success: true, testimonial: updated });
    } catch (error) {
        logger.error('[Admin Testimonials] PATCH error', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update testimonial' },
            { status: 500 }
        );
    }
}
