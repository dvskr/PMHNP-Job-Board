import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

type JsonInputValue =
  | string
  | number
  | boolean
  | { [key: string]: JsonInputValue }
  | JsonInputValue[];

// Helper function to mask email (e.g., "s***@email.com")
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***@***.***';

  const maskedLocal = localPart.length > 1
    ? localPart[0] + '***'
    : localPart + '***';

  return `${maskedLocal}@${domain}`;
}

// GET - Get current subscription status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token is required' },
        { status: 400 }
      );
    }

    // Find EmailLead by unsubscribeToken
    const emailLead = await prisma.emailLead.findUnique({
      where: { unsubscribeToken: token },
      select: {
        email: true,
        isSubscribed: true,
        newsletterOptIn: true,
        preferences: true,
      },
    });

    if (!emailLead) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      email: maskEmail(emailLead.email),
      isSubscribed: emailLead.isSubscribed,
      newsletterOptIn: emailLead.newsletterOptIn,
      preferences: emailLead.preferences,
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

// POST - Update subscription status and preferences
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, isSubscribed, preferences } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token is required' },
        { status: 400 }
      );
    }

    // Find EmailLead by unsubscribeToken
    const emailLead = await prisma.emailLead.findUnique({
      where: { unsubscribeToken: token },
    });

    if (!emailLead) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: {
      isSubscribed?: boolean;
      newsletterOptIn?: boolean;
      preferences?: JsonInputValue;
    } = {};

    if (typeof isSubscribed === 'boolean') {
      updateData.isSubscribed = isSubscribed;
    }

    if (typeof body.newsletterOptIn === 'boolean') {
      updateData.newsletterOptIn = body.newsletterOptIn;
    }

    if (preferences !== undefined && preferences !== null) {
      updateData.preferences = preferences as JsonInputValue;
    }

    // Update EmailLead
    const updatedEmailLead = await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      data: updateData,
      select: {
        email: true,
        isSubscribed: true,
        newsletterOptIn: true,
        preferences: true,
      },
    });

    return NextResponse.json({
      success: true,
      email: maskEmail(updatedEmailLead.email),
      isSubscribed: updatedEmailLead.isSubscribed,
      newsletterOptIn: updatedEmailLead.newsletterOptIn,
      preferences: updatedEmailLead.preferences,
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

