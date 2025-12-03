import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const idSuffix = resolvedParams.id;

    // Find job where ID ends with the provided suffix (last 8 chars of UUID)
    const job = await prisma.job.findFirst({
      where: {
        id: { endsWith: idSuffix },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    await prisma.job.update({
      where: { id: job.id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

