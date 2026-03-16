import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeContactForm } from '@/lib/sanitize';
import { logger } from '@/lib/logger';
import { buildContactConfirmationHtml, buildContactNotificationHtml } from '@/lib/email-service';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

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

    // 1. Send notification email to support team
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: 'support@pmhnphiring.com',
        subject: `Contact Form: ${trimmedSubject}`,
        html: buildContactNotificationHtml(trimmedName, trimmedEmail, trimmedSubject, trimmedMessage),
        replyTo: trimmedEmail,
      });

      logger.info('Contact form submission', { email: trimmedEmail, subject: trimmedSubject });
    } catch (emailError) {
      logger.error('Error sending notification email', emailError);
      // Continue to send confirmation email even if notification fails
    }

    // 2. Send confirmation email to user
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: trimmedEmail,
        subject: 'We received your message',
        html: buildContactConfirmationHtml(trimmedName, trimmedSubject),
      });

      logger.info('Confirmation email sent', { email: trimmedEmail });
    } catch (confirmationError) {
      logger.error('Error sending confirmation email', confirmationError);
      // Don't fail the request if confirmation email fails
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
