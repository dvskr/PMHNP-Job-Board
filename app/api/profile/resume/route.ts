import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/profile/resume
 * Securely deletes the current user's resume from storage and clears the DB reference.
 * Server-side only — prevents client-side storage access with anon key.
 */
export async function DELETE(request: NextRequest) {
    // Rate limiting — 5 deletions per hour
    const rateLimitResult = await rateLimit(request, 'resume-delete', { limit: 5, windowSeconds: 3600 });
    if (rateLimitResult) return rateLimitResult;

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get current resume URL from profile
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { resumeUrl: true },
        });

        if (!profile?.resumeUrl) {
            return NextResponse.json({ error: 'No resume found' }, { status: 404 });
        }

        // Extract storage path from the URL
        const storagePath = extractStoragePath(profile.resumeUrl);

        if (storagePath) {
            // Use service role key to delete from storage (bypasses RLS)
            const adminClient = createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            const { error: deleteError } = await adminClient.storage
                .from('resumes')
                .remove([storagePath]);

            if (deleteError) {
                logger.error('Failed to delete resume from storage', deleteError);
                // Continue to clear DB reference even if storage deletion fails
            }
        }

        // Clear resume URL from profile
        await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                resumeUrl: null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Resume deletion error:', error);
        return NextResponse.json(
            { error: 'Failed to delete resume' },
            { status: 500 }
        );
    }
}

/**
 * Extract the storage path from a Supabase storage URL.
 * Handles both signed URLs and public URLs.
 */
function extractStoragePath(url: string): string | null {
    try {
        // Signed URL: /storage/v1/object/sign/resumes/path?token=...
        const signMatch = url.match(/\/storage\/v1\/object\/sign\/resumes\/(.+?)(?:\?|$)/);
        if (signMatch) return decodeURIComponent(signMatch[1]);

        // Public URL: /storage/v1/object/public/resumes/path
        const publicMatch = url.match(/\/storage\/v1\/object\/public\/resumes\/(.+?)(?:\?|$)/);
        if (publicMatch) return decodeURIComponent(publicMatch[1]);

        // Fallback: try to extract path after last /resumes/
        const fallbackMatch = url.match(/\/resumes\/(.+?)(?:\?|$)/);
        if (fallbackMatch) return decodeURIComponent(fallbackMatch[1]);

        return null;
    } catch {
        return null;
    }
}
