import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { generateInvoice } from '@/lib/invoice-generator';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const token = searchParams.get('token');

    // Validate required parameters
    if (!jobId || !token) {
      return NextResponse.json(
        { error: 'Missing required parameters: jobId and token' },
        { status: 400 }
      );
    }

    // Find employer job and verify token (check both dashboardToken and editToken)
    const employerJob = await prisma.employerJob.findFirst({
      where: {
        jobId,
        OR: [
          { dashboardToken: token },
          { editToken: token },
        ],
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            isFeatured: true,
            createdAt: true,
          },
        },
      },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid job ID or token' },
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

    // Determine pricing tier and amount
    const tier = employerJob.job.isFeatured ? 'featured' : 'standard';
    const amount = employerJob.job.isFeatured ? 19900 : 9900; // in cents

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

