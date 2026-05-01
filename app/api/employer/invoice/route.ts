import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { generateInvoice } from '@/lib/invoice-generator';
import { config, PricingTier } from '@/lib/config';

/**
 * GET /api/employer/invoice?jobId=...&[chargeId=...]&[token=...]
 *
 * Audit #2: Invoice generation now reads from the JobCharge ledger so the
 * invoice amount matches what Stripe actually billed. Without `chargeId`,
 * returns the most-recent charge for the posting (typically the renewal if
 * one exists, otherwise the original new-post charge). With `chargeId`,
 * returns that specific charge's invoice — useful for posts that have been
 * renewed multiple times.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const token = searchParams.get('token');
    const chargeId = searchParams.get('chargeId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing required parameter: jobId' },
        { status: 400 }
      );
    }

    // Support both token-based and session-based access
    let employerJob;

    if (token) {
      // Token-based access (from email links)
      employerJob = await prisma.employerJob.findFirst({
        where: {
          jobId,
          OR: [
            { dashboardToken: token },
            { editToken: token },
          ],
        },
        include: {
          job: {
            select: { id: true, title: true, isFeatured: true, createdAt: true },
          },
        },
      });
    } else {
      // Session-based access (logged-in employer)
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized — provide a token or log in' }, { status: 401 });
      }

      employerJob = await prisma.employerJob.findFirst({
        where: {
          jobId,
          OR: [
            { userId: user.id },
            { contactEmail: user.email! },
          ],
        },
        include: {
          job: {
            select: { id: true, title: true, isFeatured: true, createdAt: true },
          },
        },
      });
    }

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invoice not found or access denied' },
        { status: 404 }
      );
    }

    // Block invoice generation for free posts
    if (employerJob.paymentStatus === 'free' ||
      employerJob.paymentStatus === 'free_renewed' ||
      employerJob.paymentStatus === 'free_upgraded') {
      return NextResponse.json(
        {
          error: 'Invoices are not available for free job postings.',
          message: 'Your job was posted during our free launch period. No payment was made, so no invoice is available.'
        },
        { status: 400 }
      );
    }

    if (employerJob.paymentStatus !== 'paid') {
      return NextResponse.json(
        { error: 'Invoice not available - payment not completed' },
        { status: 400 }
      );
    }

    // Audit #2: pull the actual charge from the ledger.
    const charge = chargeId
      ? await prisma.jobCharge.findFirst({
          where: { id: chargeId, employerJobId: employerJob.id },
        })
      : await prisma.jobCharge.findFirst({
          where: { employerJobId: employerJob.id },
          orderBy: { createdAt: 'desc' },
        });

    // Backfill case: rows paid before 2026-04-30 don't have JobCharge entries.
    // Fall back to the legacy "always $199" behavior so old paid posts still
    // generate a (less accurate) invoice instead of 404'ing.
    const tier = (employerJob.pricingTier || 'pro') as PricingTier;
    const amount = charge?.amountCents ?? config.getStripePriceInCents(tier);
    const chargeDate = charge?.createdAt ?? new Date(employerJob.createdAt);
    const chargeType = charge?.type ?? 'new';

    // Invoice number — include charge type + a short charge ID slice so renewals
    // get distinct invoice numbers from the original charge on the same job.
    const idSegment = charge?.id?.substring(0, 8).toUpperCase() ?? employerJob.job.id.substring(0, 8).toUpperCase();
    const invoiceNumber = `INV-${chargeDate.getFullYear()}-${chargeType.toUpperCase()}-${idSegment}`;

    const pdfBuffer = await generateInvoice({
      invoiceNumber,
      date: chargeDate,
      employerName: employerJob.employerName,
      employerEmail: employerJob.contactEmail,
      jobTitle: employerJob.job.title,
      amount,
      tier,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}

