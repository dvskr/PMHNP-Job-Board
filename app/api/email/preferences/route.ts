import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

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
      preferences?: Record<string, unknown>;
    } = {};

    if (typeof isSubscribed === 'boolean') {
      updateData.isSubscribed = isSubscribed;
    }

    if (preferences !== undefined) {
      updateData.preferences = preferences;
    }

    // Update EmailLead
    const updatedEmailLead = await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      data: updateData,
      select: {
        email: true,
        isSubscribed: true,
        preferences: true,
      },
    });

    return NextResponse.json({
      success: true,
      email: maskEmail(updatedEmailLead.email),
      isSubscribed: updatedEmailLead.isSubscribed,
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

