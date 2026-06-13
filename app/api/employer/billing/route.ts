import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/employer/billing
 * Fetch payment history (employer jobs with payment info).
 */
export async function GET(req: NextRequest) {
    const rateLimitResponse = await rateLimit(req, 'employer:billing', RATE_LIMITS.employer);
    if (rateLimitResponse) return rateLimitResponse;

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

    const employerJobs = await prisma.employerJob.findMany({
        where: {
            // P5.A: contactEmail fallback limited to unclaimed legacy rows so a
            // user can't list another account's billing history by email match.
            OR: [
                { userId: user.id },
                { userId: null, contactEmail: user.email! },
            ],
        },
        include: {
            job: {
                select: {
                    id: true,
                    title: true,
                    isFeatured: true,
                    createdAt: true,
                    expiresAt: true,
                    isPublished: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Pull all JobCharge rows for this employer's postings in a single query,
    // then bucket them by employerJobId. Cheaper than N+1 individual queries.
    // No Prisma back-relation defined on EmployerJob → manual join.
    const employerJobIds = employerJobs.map((ej) => ej.id);
    const charges = employerJobIds.length > 0
        ? await prisma.jobCharge.findMany({
            where: { employerJobId: { in: employerJobIds } },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                employerJobId: true,
                type: true,
                amountCents: true,
                currency: true,
                createdAt: true,
                invoicePdfUrl: true,
                hostedInvoiceUrl: true,
                invoiceNumber: true,
                refundedAt: true,
            },
        })
        : [];
    const chargesByJob = new Map<string, typeof charges>();
    for (const c of charges) {
        const arr = chargesByJob.get(c.employerJobId) ?? [];
        arr.push(c);
        chargesByJob.set(c.employerJobId, arr);
    }

    const isFreeStatus = (status: string) => status === 'free' || status === 'free_renewed' || status === 'free_upgraded';

    const payments = employerJobs.map((ej) => {
        const isActive = ej.job.isPublished && (!ej.job.expiresAt || new Date(ej.job.expiresAt) > new Date());
        const isFree = isFreeStatus(ej.paymentStatus);
        const ejCharges = chargesByJob.get(ej.id) ?? [];
        return {
            id: ej.id,
            jobId: ej.job.id,
            jobTitle: ej.job.title,
            tier: config.getTierLabel((ej.pricingTier || 'pro') as PricingTier),
            status: ej.paymentStatus,
            isFree,
            date: ej.createdAt.toISOString(),
            expiresAt: ej.job.expiresAt?.toISOString() || null,
            isActive,
            charges: ejCharges.map((c) => ({
                id: c.id,
                type: c.type,
                amountCents: c.amountCents,
                currency: c.currency,
                createdAt: c.createdAt.toISOString(),
                invoicePdfUrl: c.invoicePdfUrl,
                hostedInvoiceUrl: c.hostedInvoiceUrl,
                invoiceNumber: c.invoiceNumber,
                refundedAt: c.refundedAt?.toISOString() || null,
            })),
        };
    });

    return NextResponse.json({ payments });
}
