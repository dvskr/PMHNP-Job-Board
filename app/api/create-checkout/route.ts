import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

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

    if (!title || !employer || !location || !mode || !jobType || !description || !applyLink || !contactEmail || !pricing) {
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

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Post: ${title}`,
              description: `${employer} - ${location}`,
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
        jobData: JSON.stringify({
          title,
          employer,
          location,
          mode,
          jobType,
          description,
          applyLink,
          contactEmail,
          minSalary: salaryMin || null,
          maxSalary: salaryMax || null,
          salaryPeriod,
          companyWebsite: companyWebsite || null,
          pricing,
        }),
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

