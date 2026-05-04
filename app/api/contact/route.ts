import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeContactForm } from '@/lib/sanitize';
import { logger } from '@/lib/logger';
import {
  buildContactConfirmationHtml,
  buildContactNotificationHtml,
  sendAndLog,
  isEmailSuppressed,
} from '@/lib/email-service';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getEmployerTier } from '@/lib/tier-limits';

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await rateLimit(request, 'contact', RATE_LIMITS.contact);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();

    // Sanitize inputs
    const sanitized = sanitizeContactForm(body);
    const { name: trimmedName, email: trimmedEmail, subject: trimmedSubject, message: trimmedMessage } = sanitized;

    // Validate all required fields
    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      return NextResponse.json(
        { success: false, error: 'All fields are required.' },
        { status: 400 }
      );
    }

    // Validate field lengths
    if (trimmedName.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Name cannot be empty.' },
        { status: 400 }
      );
    }

    if (trimmedSubject.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Subject cannot be empty.' },
        { status: 400 }
      );
    }

    if (trimmedMessage.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Message cannot be empty.' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    // Check if the sender is an authenticated employer and get their tier
    let tierPrefix = '';
    let tierInfo = '';
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profile = await prisma.userProfile.findUnique({
          where: { supabaseId: user.id },
          select: { role: true },
        });
        if (profile && ['employer', 'admin'].includes(profile.role)) {
          const tier = profile.role === 'admin' ? 'admin' : await getEmployerTier(user.id);
          tierPrefix = `[${tier.toUpperCase()}] `;
          tierInfo = `\n\nSender Tier: ${tier.toUpperCase()} (${profile.role})`;
        }
      }
    } catch {
      // Non-critical — continue without tier info
    }

    // 1. Notify the support team. Internal address — no suppression check needed
    //    (we always want internal mail to land regardless of personal opt-out state).
    try {
      await sendAndLog({
        from: '', // overridden by sendAndLog (transactional sender)
        to: 'support@pmhnphiring.com',
        subject: `${tierPrefix}Contact Form: ${trimmedSubject}`,
        html: buildContactNotificationHtml(trimmedName, trimmedEmail, trimmedSubject, trimmedMessage + tierInfo),
      }, 'contact_internal', { senderEmail: trimmedEmail, subject: trimmedSubject });

      logger.info('Contact form submission', { email: trimmedEmail, subject: trimmedSubject });
    } catch (emailError) {
      logger.error('Error sending notification email', emailError);
    }

    // 2. Send confirmation back to the user. Skip if suppressed — they don't want
    //    any mail from us. The support team still gets the inbound.
    try {
      if (!(await isEmailSuppressed(trimmedEmail))) {
        await sendAndLog({
          from: '', // overridden by sendAndLog (transactional sender)
          to: trimmedEmail,
          subject: 'We received your message',
          html: buildContactConfirmationHtml(trimmedName, trimmedSubject),
        }, 'contact_confirmation', { subject: trimmedSubject });

        logger.info('Confirmation email sent', { email: trimmedEmail });
      }
    } catch (confirmationError) {
      logger.error('Error sending confirmation email', confirmationError);
    }

    // Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'Message sent! We\'ll get back to you within 24-48 hours.'
      },
      { status: 200 }
    );

  } catch (error) {
    logger.error('Contact form error', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send message. Please try again or email us directly at support@pmhnphiring.com.'
      },
      { status: 500 }
    );
  }
}
