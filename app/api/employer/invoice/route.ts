import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { generateInvoice } from '@/lib/invoice-generator';
import { config, PricingTier } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const token = searchParams.get('token');

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

    // GAP FIX 3: Block invoice generation for free posts
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

    // Check if payment was completed
    if (employerJob.paymentStatus !== 'paid') {
      return NextResponse.json(
        { error: 'Invoice not available - payment not completed' },
        { status: 400 }
      );
    }

    // Determine pricing tier and amount from the stored tier
    const tier = (employerJob.pricingTier || 'starter') as PricingTier;
    const amount = config.getStripePriceInCents(tier);

    // Generate invoice number (using job ID and creation date)
    const createdDate = new Date(employerJob.createdAt);
    const invoiceNumber = `INV-${createdDate.getFullYear()}-${employerJob.job.id.substring(0, 8).toUpperCase()}`;

    // Generate the PDF invoice
    const pdfBuffer = await generateInvoice({
      invoiceNumber,
      date: createdDate,
      employerName: employerJob.employerName,
      employerEmail: employerJob.contactEmail,
      jobTitle: employerJob.job.title,
      amount,
      tier,
    });

    // Return PDF with appropriate headers
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${employerJob.job.id}.pdf"`,
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

