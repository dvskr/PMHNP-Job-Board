import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email-service';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeEmail } from '@/lib/sanitize';
import { logger } from '@/lib/logger';
import { anonymizeEmail } from '@/lib/server-utils';

interface SubscribeRequestBody {
  email: string;
  source?: string;
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await rateLimit(request, 'subscribe', RATE_LIMITS.subscribe);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body: SubscribeRequestBody = await request.json();
    const { source } = body;

    // Sanitize email input
    const email = sanitizeEmail(body.email);

    // Validate email
    const emailRegex = /\S+@\S+\.\S+/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingLead = await prisma.emailLead.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingLead) {
      // If previously unsubscribed, resubscribe them
      if (!existingLead.isSubscribed) {
        await prisma.emailLead.update({
          where: { email: email.toLowerCase() },
          data: { isSubscribed: true },
        });

        const anonymizedEmail = anonymizeEmail(email);
        logger.info('User resubscribed', { email: anonymizedEmail });
        return NextResponse.json({
          success: true,
          message: 'Welcome back! You have been resubscribed.',
        });
      }

      // Already subscribed
      return NextResponse.json({
        success: true,
        message: "You're already subscribed!",
      });
    }

    // Create new email lead with generated tokens
    // Generate random IDs in cuid2-like format
    const generateCuid = () => crypto.randomBytes(16).toString('base64url').substring(0, 24);

    const emailLead = await prisma.emailLead.create({
      data: {
        email: email.toLowerCase(),
        source: source || 'unknown',
        id: generateCuid(),
        unsubscribeToken: generateCuid(),
      },
    });

    // Send welcome email with unsubscribe token
    await sendWelcomeEmail(email, emailLead.unsubscribeToken);

    const anonymizedEmail = anonymizeEmail(email);
    logger.info('New subscriber added', { email: anonymizedEmail, source });
    return NextResponse.json({
      success: true,
      message: 'Subscribed successfully!',
    });
  } catch (error) {
    logger.error('Error subscribing', error);
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}

