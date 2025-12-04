import { Resend } from 'resend';
import { slugify } from '@/lib/utils';

const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendWelcomeEmail(email: string): Promise<EmailResult> {
  try {
    await resend.emails.send({
      from: 'PMHNP Jobs <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to PMHNP Jobs!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Welcome to PMHNP Jobs!</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">Thanks for subscribing to job alerts.</p>
            
            <p style="font-size: 16px; margin-bottom: 24px;">We have 200+ psychiatric nurse practitioner jobs updated daily.</p>
            
            <a href="${BASE_URL}/jobs" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px;">Browse Jobs</a>
            
            <p style="font-size: 14px; color: #666; margin-top: 32px;">
              You're receiving this email because you signed up for job alerts at PMHNP Jobs.
            </p>
          </body>
        </html>
      `,
    });

    console.log('Welcome email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send welcome email',
    };
  }
}

export async function sendConfirmationEmail(
  employerEmail: string,
  jobTitle: string,
  jobId: string,
  editToken: string
): Promise<EmailResult> {
  try {
    const jobSlug = slugify(jobTitle, jobId);

    await resend.emails.send({
      from: 'PMHNP Jobs <onboarding@resend.dev>',
      to: employerEmail,
      subject: 'Your PMHNP job post is live!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your job post is now live!</h1>
            
            <p style="font-size: 18px; margin-bottom: 16px;"><strong>${jobTitle}</strong></p>
            
            <p style="font-size: 16px; margin-bottom: 24px;">Your listing will remain active for 30 days.</p>
            
            <div style="margin-bottom: 24px;">
              <a href="${BASE_URL}/jobs/${jobSlug}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-right: 12px;">View Your Job</a>
            </div>
            
            <p style="font-size: 16px; margin-bottom: 16px;">
              <a href="${BASE_URL}/jobs/edit/${editToken}" style="color: #3b82f6; text-decoration: underline;">Edit your job post</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
            
            <p style="font-size: 14px; color: #666;">
              Need help? Reply to this email and we'll get back to you as soon as possible.
            </p>
            
            <p style="font-size: 14px; color: #666; margin-top: 16px;">
              Thank you for choosing PMHNP Jobs!
            </p>
          </body>
        </html>
      `,
    });

    console.log('Confirmation email sent successfully to:', employerEmail);
    return { success: true };
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send confirmation email',
    };
  }
}

