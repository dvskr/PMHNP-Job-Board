import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Increment applyClickCount
    await prisma.job.update({
      where: { id },
      data: {
        applyClickCount: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // If job not found, still return success (don't break the apply flow)
    console.error('Error tracking apply click:', error);
    return NextResponse.json({ success: true });
  }
}

