import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

// Hardcode production URLs for emails
const SITE_URL = 'https://pmhnphiring.com';
const PDF_URL = 'https://zdmpmncrcpgpmwdqvekg.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    logger.info('Salary guide request received', { email });

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const unsubscribeToken = uuidv4();

    await prisma.emailLead.upsert({
      where: { email: normalizedEmail },
      update: {
        updatedAt: new Date(),
        // Preserve original source, don't overwrite it
      },
      create: {
        email: normalizedEmail,
        source: 'salary-guide',
        isSubscribed: true,
        unsubscribeToken,
        preferences: { salaryGuide: true },
      },
    });

    const currentYear = new Date().getFullYear();
    logger.info('Lead saved to database', { email: normalizedEmail });

    const emailResult = await resend.emails.send({
      from: EMAIL_FROM,
      to: normalizedEmail,
      subject: `Your ${currentYear} PMHNP Salary Guide is Ready`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentYear} PMHNP Salary Guide</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #059669; padding: 40px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; font-size: 28px; color: #ffffff; font-weight: bold;">
                ${currentYear} PMHNP Salary Guide
              </h1>
              <p style="margin: 0; font-size: 16px; color: #a7f3d0;">
                Know Your Worth. Negotiate With Confidence.
              </p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Your comprehensive salary guide is ready! Click the button below to download.
              </p>
              
              <!-- Download Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0 32px 0;">
                    <a href="${PDF_URL}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 18px;">
                      Download PDF Guide
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Stats Row -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td width="33%" style="padding: 20px; text-align: center; border-right: 1px solid #bbf7d0;">
                    <div style="font-size: 28px; font-weight: bold; color: #059669;">$155k+</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">National Avg</div>
                  </td>
                  <td width="33%" style="padding: 20px; text-align: center; border-right: 1px solid #bbf7d0;">
                    <div style="font-size: 28px; font-weight: bold; color: #059669;">$210k+</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Top 10%</div>
                  </td>
                  <td width="33%" style="padding: 20px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #059669;">+45%</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Job Growth</div>
                  </td>
                </tr>
              </table>
              
              <!-- What's Inside -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="padding: 20px; background-color: #fafafa; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: bold; color: #374151;">
                      What's Inside:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.8;">
                      <li>Salary by state with COL adjustments</li>
                      <li>Telehealth vs in-person pay</li>
                      <li>Salary by experience &amp; setting</li>
                      <li>Specialty premiums (+15-25%)</li>
                      <li>Negotiation scripts that work</li>
                      <li>2026 market trends</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Section -->
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Ready to find your next high-paying position?
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${SITE_URL}/jobs" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      Browse Jobs
                    </a>
                  </td>
                  <td>
                    <a href="${SITE_URL}/job-alerts" style="display: inline-block; background-color: #ffffff; color: #2563eb; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 14px; border: 2px solid #2563eb;">
                      Set Up Alerts
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                You requested this salary guide from PMHNPHiring.com
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="${SITE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    logger.info('Salary guide email sent successfully', { email: normalizedEmail, emailId: emailResult.data?.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error sending salary guide', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send salary guide' },
      { status: 500 }
    );
  }
}
