import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { buildSalaryGuideHtml } from '@/lib/email-service';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

// Environment-aware URLs
const PDF_URL = process.env.SALARY_GUIDE_URL || 'https://zdmpmncrcpgpmwdqvekg.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

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
      html: buildSalaryGuideHtml(PDF_URL, unsubscribeToken),
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
