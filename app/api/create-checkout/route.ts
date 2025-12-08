import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { createId } from '@paralleldrive/cuid2';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutRequestBody {
  title: string;
  companyName: string;
  companyWebsite?: string;
  contactEmail: string;
  location: string;
  mode: string;
  jobType: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCompetitive?: boolean;
  description: string;
  applyUrl: string;
  pricingTier: 'standard' | 'featured';
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckoutRequestBody = await request.json();

    // Validate required fields
    const {
      title,
      companyName: employer,
      companyWebsite,
      contactEmail,
      location,
      mode,
      jobType,
      salaryMin,
      salaryMax,
      salaryCompetitive,
      description,
      applyUrl: applyLink,
      pricingTier: pricing,
    } = body;

    // Validate and trim required string fields
    const trimmedEmployer = employer?.trim();
    const trimmedContactEmail = contactEmail?.trim();
    const trimmedTitle = title?.trim();
    const trimmedLocation = location?.trim();
    const trimmedDescription = description?.trim();
    const trimmedApplyLink = applyLink?.trim();

    if (!trimmedTitle || !trimmedEmployer || !trimmedLocation || !mode || !jobType || !trimmedDescription || !trimmedApplyLink || !trimmedContactEmail || !pricing) {
      console.error('Validation failed. Missing required fields:', {
        title: !!trimmedTitle,
        employer: !!trimmedEmployer,
        location: !!trimmedLocation,
        mode: !!mode,
        jobType: !!jobType,
        description: !!trimmedDescription,
        applyLink: !!trimmedApplyLink,
        contactEmail: !!trimmedContactEmail,
        pricing: !!pricing,
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate price in cents
    let price: number;
    if (pricing === 'standard') {
      price = 9900; // $99
    } else if (pricing === 'featured') {
      price = 19900; // $199
    } else {
      return NextResponse.json(
        { error: 'Invalid pricing tier' },
        { status: 400 }
      );
    }

    // Determine salary period (default to year for annual salaries)
    const salaryPeriod = (salaryMin || salaryMax) && !salaryCompetitive ? 'year' : null;

    // Calculate expiry date based on pricing tier
    const expiresAt = new Date();
    if (pricing === 'featured') {
      expiresAt.setDate(expiresAt.getDate() + 60); // 60 days for featured
    } else {
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days for standard
    }

    // Generate unique edit token and dashboard token
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = createId();

    // Log the data we're about to use
    console.log('Creating job with data:', {
      employer: trimmedEmployer,
      contactEmail: trimmedContactEmail,
      companyWebsite,
      applyLink: trimmedApplyLink,
    });

    // Create job in database first (unpublished, pending payment)
    const job = await prisma.job.create({
      data: {
        title: trimmedTitle,
        employer: trimmedEmployer,
        location: trimmedLocation,
        jobType,
        mode,
        description: trimmedDescription,
        descriptionSummary: trimmedDescription.slice(0, 300),
        applyLink: trimmedApplyLink,
        minSalary: salaryMin ? Math.round(salaryMin) : null,
        maxSalary: salaryMax ? Math.round(salaryMax) : null,
        salaryPeriod,
        isFeatured: pricing === 'featured',
        isPublished: false, // Will be published after payment
        sourceType: 'employer',
        expiresAt,
      },
    });

    console.log('Job created successfully with ID:', job.id);

    // Create employer job record
    const employerJobData = {
      employerName: trimmedEmployer,
      contactEmail: trimmedContactEmail,
      companyWebsite: companyWebsite?.trim() || null,
      jobId: job.id,
      editToken,
      dashboardToken,
      paymentStatus: 'pending',
    };

    console.log('Creating employer job with data:', employerJobData);

    const employerJob = await prisma.employerJob.create({
      data: employerJobData,
    });

    // Create Stripe Checkout session with job ID and dashboard token in metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Post: ${trimmedTitle}`,
              description: `${trimmedEmployer} - ${trimmedLocation}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/post-job`,
      metadata: {
        jobId: job.id,
        pricing,
        dashboardToken: employerJob.dashboardToken,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
