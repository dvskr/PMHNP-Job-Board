import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { buildQuotaKeys } from '@/lib/employer-quota';
import { getCreditBalance } from '@/lib/credit-packs';

/**
 * GET /api/employer/billing
 * Fetch payment history (employer jobs with payment info) and prepaid packs.
 *
 * Packs were missing entirely: this route read userProfile, employerJob and
 * jobCharge, and a pack is in none of them, so the largest single purchase
 * on the site left no trace anywhere in the product. A buyer saw a Payment
 * History table that did not mention the money they had just spent.
 *
 * Two different scopes on purpose:
 *   packs    what THIS account bought. A payment history listing a
 *            colleague's card would be the wrong kind of transparency.
 *   balance  what this account may SPEND, which is team-wide by signup
 *            domain, because that is what the post form will actually draw
 *            on. Someone who can spend a credit has to be able to see it.
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
        select: { id: true, role: true, company: true },
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
        // /api/employer/invoice and /api/employer/receipt both refuse anything
        // that is not paymentStatus 'paid' (refunded, disputed, pending). This
        // feed handed out the live Stripe invoice PDF and hosted receipt URLs
        // for those same rows, so the documents the product deliberately
        // withholds were sitting in the JSON one gate away. The charge history
        // still renders: only the two document links are withheld, on the same
        // condition the dedicated endpoints use.
        const documentsAvailable = ej.paymentStatus === 'paid';
        const ejCharges = chargesByJob.get(ej.id) ?? [];
        return {
            id: ej.id,
            jobId: ej.job.id,
            jobTitle: ej.job.title,
            tier: config.getTierLabel((ej.pricingTier || 'pro') as PricingTier),
            status: ej.paymentStatus,
            isFree,
            // So the table can say "paid with a credit" rather than showing
            // a posting with no charge against it and no explanation.
            fundingSource: ej.fundingSource,
            date: ej.createdAt.toISOString(),
            expiresAt: ej.job.expiresAt?.toISOString() || null,
            isActive,
            charges: ejCharges.map((c) => ({
                id: c.id,
                type: c.type,
                amountCents: c.amountCents,
                currency: c.currency,
                createdAt: c.createdAt.toISOString(),
                invoicePdfUrl: documentsAvailable ? c.invoicePdfUrl : null,
                hostedInvoiceUrl: documentsAvailable ? c.hostedInvoiceUrl : null,
                invoiceNumber: c.invoiceNumber,
                refundedAt: c.refundedAt?.toISOString() || null,
            })),
        };
    });

    const packRows = await prisma.postingCreditPack.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true, amountCents: true, creditsTotal: true, creditsUsed: true,
            expiresAt: true, refundedAt: true, disputedAt: true, createdAt: true,
        },
    });

    const balance = await getCreditBalance(
        user.id,
        buildQuotaKeys({
            userId: user.id,
            signupEmail: user.email ?? null,
            // From the authenticated profile row, never a request field.
            lockedCompanyName: profile.company ?? null,
        }),
    );

    const creditPacks = packRows.map((p) => {
        // A refunded or disputed pack keeps its remaining count on the row
        // but can no longer be spent, so reporting that number as "left"
        // would promise posts the spend path will refuse.
        const frozen = p.refundedAt !== null || p.disputedAt !== null;
        const expired = p.expiresAt <= new Date();
        return {
            id: p.id,
            amountCents: p.amountCents,
            creditsTotal: p.creditsTotal,
            creditsUsed: p.creditsUsed,
            creditsRemaining: frozen || expired ? 0 : Math.max(0, p.creditsTotal - p.creditsUsed),
            purchasedAt: p.createdAt.toISOString(),
            expiresAt: p.expiresAt.toISOString(),
            status: p.refundedAt ? 'refunded' : p.disputedAt ? 'disputed' : expired ? 'expired' : 'active',
        };
    });

    return NextResponse.json({
        payments,
        creditPacks,
        creditBalance: {
            available: balance.available,
            expiresAt: balance.nextExpiry?.toISOString() ?? null,
        },
    });
}
