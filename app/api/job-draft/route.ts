import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDraftSavedEmail } from '@/lib/email-service';
import { Prisma } from '@prisma/client';

interface SaveDraftBody {
  email: string;
  formData: Record<string, unknown>;
}

// POST - Save draft
export async function POST(request: NextRequest) {
  try {
    const body: SaveDraftBody = await request.json();
    const { email, formData } = body;

    // Validate required fields
    if (!email || !formData) {
      return NextResponse.json(
        { error: 'Missing required fields: email and formData' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Calculate expiration date (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Check if draft already exists for this email
    const existingDraft = await prisma.jobDraft.findFirst({
      where: { email },
    });

    let draft;
    if (existingDraft) {
      // Update existing draft
      draft = await prisma.jobDraft.update({
        where: { id: existingDraft.id },
        data: {
          formData: formData as Prisma.InputJsonValue,
          expiresAt,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new draft
      draft = await prisma.jobDraft.create({
        data: {
          email,
          formData: formData as Prisma.InputJsonValue,
          expiresAt,
        },
      });

      // Send resume email for new drafts
      try {
        await sendDraftSavedEmail(email, draft.resumeToken);
      } catch (emailError) {
        console.error('Error sending draft saved email:', emailError);
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: existingDraft ? 'Draft updated!' : 'Draft saved!',
      resumeToken: draft.resumeToken,
    });
  } catch (error) {
    console.error('Error saving draft:', error);
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 }
    );
  }
}

// GET - Retrieve draft by token
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    // Validate token parameter
    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      );
    }

    // Find draft by resume token
    const draft = await prisma.jobDraft.findUnique({
      where: { resumeToken: token },
    });

    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      );
    }

    // Check if draft has expired
    if (new Date() > new Date(draft.expiresAt)) {
      // Delete expired draft
      await prisma.jobDraft.delete({
        where: { id: draft.id },
      });

      return NextResponse.json(
        { error: 'Draft has expired' },
        { status: 410 }
      );
    }

    return NextResponse.json({
      success: true,
      formData: draft.formData,
      email: draft.email,
      expiresAt: draft.expiresAt,
    });
  } catch (error) {
    console.error('Error retrieving draft:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve draft' },
      { status: 500 }
    );
  }
}

// DELETE - Delete draft by token
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    // Validate token parameter
    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      );
    }

    // Find and delete draft
    const draft = await prisma.jobDraft.findUnique({
      where: { resumeToken: token },
    });

    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      );
    }

    await prisma.jobDraft.delete({
      where: { id: draft.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Draft deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting draft:', error);
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500 }
    );
  }
}

