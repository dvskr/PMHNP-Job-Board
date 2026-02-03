import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

// GET - Unsubscribe
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
    });

    if (!emailLead) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 404 }
      );
    }

    // Update isSubscribed to false
    await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      data: { isSubscribed: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Unsubscribed successfully',
    });
  } catch (error) {
    logger.error('Error unsubscribing:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}

// POST - Resubscribe
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

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

    // Update isSubscribed to true
    await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      data: { isSubscribed: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Resubscribed successfully',
    });
  } catch (error) {
    logger.error('Error resubscribing:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to resubscribe' },
      { status: 500 }
    );
  }
}

