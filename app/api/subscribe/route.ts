import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email-service';
import { NextRequest, NextResponse } from 'next/server';

interface SubscribeRequestBody {
  email: string;
  source?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SubscribeRequestBody = await request.json();
    const { email, source } = body;

    // Validate email
    const emailRegex = /\S+@\S+\.\S+/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    try {
      // Insert email lead
      await prisma.emailLead.create({
        data: {
          email: email.toLowerCase(),
          source: source || 'unknown',
        },
      });

      // Send welcome email
      await sendWelcomeEmail(email);

      return NextResponse.json({
        success: true,
        message: 'Subscribed successfully!',
      });
    } catch (error: any) {
      // If duplicate (unique constraint error)
      if (error.code === 'P2002') {
        return NextResponse.json({
          success: true,
          message: "You're already subscribed!",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error subscribing:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}

