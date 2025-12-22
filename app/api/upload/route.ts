import { NextRequest, NextResponse } from 'next/server';
import { uploadResume, uploadAvatar, validateFile } from '@/lib/supabase-storage';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from Supabase session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const uploadType = formData.get('type') as 'resume' | 'avatar';

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!uploadType || !['resume', 'avatar'].includes(uploadType)) {
      return NextResponse.json(
        { error: 'Invalid upload type. Must be "resume" or "avatar"' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file
    const validation = validateFile(buffer, file.name, file.type, uploadType);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Upload based on type (using authenticated user's ID)
    let result;
    if (uploadType === 'resume') {
      result = await uploadResume(buffer, file.name, file.type, user.id);
      
      // Update user profile with resume URL
      await prisma.userProfile.update({
        where: { supabaseId: user.id },
        data: { resumeUrl: result.url },
      });
    } else {
      result = await uploadAvatar(buffer, file.name, file.type, user.id);
      
      // Update user profile with avatar URL
      await prisma.userProfile.update({
        where: { supabaseId: user.id },
        data: { avatarUrl: result.url },
      });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      path: result.path,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

