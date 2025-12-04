import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

interface UpdateAlertBody {
  frequency?: string;
  isActive?: boolean;
}

// PATCH - Update alert by token
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const body: UpdateAlertBody = await request.json();
    const { frequency, isActive } = body;

    // Validate frequency if provided
    if (frequency !== undefined && !['daily', 'weekly'].includes(frequency)) {
      return NextResponse.json(
        { success: false, error: 'Frequency must be "daily" or "weekly"' },
        { status: 400 }
      );
    }

    const jobAlert = await prisma.jobAlert.findUnique({
      where: { token },
    });

    if (!jobAlert) {
      return NextResponse.json(
        { success: false, error: 'Job alert not found' },
        { status: 404 }
      );
    }

    const updatedAlert = await prisma.jobAlert.update({
      where: { token },
      data: {
        ...(frequency !== undefined && { frequency }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({
      success: true,
      alert: {
        id: updatedAlert.id,
        token: updatedAlert.token,
        frequency: updatedAlert.frequency,
        isActive: updatedAlert.isActive,
      },
    });
  } catch (error) {
    console.error('Error updating job alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update job alert' },
      { status: 500 }
    );
  }
}

