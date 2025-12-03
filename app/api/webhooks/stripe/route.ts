import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface JobData {
  title: string;
  employer: string;
  location: string;
  mode: string;
  jobType: string;
  description: string;
  applyLink: string;
  contactEmail: string;
  minSalary?: number | string | null;
  maxSalary?: number | string | null;
  salaryPeriod?: string | null;
  companyWebsite?: string | null;
  pricing: 'standard' | 'featured';
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (!session.metadata?.jobData) {
        console.error('No job data in session metadata');
        return NextResponse.json(
          { error: 'Missing job data' },
          { status: 400 }
        );
      }

      const jobData: JobData = JSON.parse(session.metadata.jobData);

      // Generate unique edit token
      const editToken = crypto.randomBytes(32).toString('hex');

      // Calculate expiry date based on pricing tier
      const expiresAt = new Date();
      if (jobData.pricing === 'featured') {
        expiresAt.setDate(expiresAt.getDate() + 60); // 60 days for featured
      } else {
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days for standard
      }

      try {
        // Create job with Prisma
        const job = await prisma.job.create({
          data: {
            title: jobData.title,
            employer: jobData.employer,
            location: jobData.location,
            jobType: jobData.jobType,
            mode: jobData.mode,
            description: jobData.description,
            descriptionSummary: jobData.description.slice(0, 300),
            applyLink: jobData.applyLink,
            minSalary: jobData.minSalary ? parseInt(String(jobData.minSalary)) : null,
            maxSalary: jobData.maxSalary ? parseInt(String(jobData.maxSalary)) : null,
            salaryPeriod: jobData.salaryPeriod || null,
            isFeatured: jobData.pricing === 'featured',
            isPublished: true,
            sourceType: 'employer',
            expiresAt: expiresAt,
          },
        });

        // Create employer job record
        await prisma.employerJob.create({
          data: {
            employerName: jobData.employer,
            contactEmail: jobData.contactEmail,
            companyWebsite: jobData.companyWebsite || null,
            jobId: job.id,
            editToken: editToken,
            paymentStatus: 'paid',
          },
        });

        // TODO: Send confirmation email (Slice 8)
        console.log('Job created:', job.id, 'Edit token:', editToken);
      } catch (prismaError) {
        console.error('Error creating job in database:', prismaError);
        return NextResponse.json(
          { error: 'Failed to create job' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

