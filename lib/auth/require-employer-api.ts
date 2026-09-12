import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * Shared employer auth check for API routes.
 * Returns the authenticated user, their profile, and whether they are an admin.
 * Returns null + a NextResponse error if auth fails.
 */
export async function requireEmployerApi(): Promise<
    | { user: { id: string; email: string }; profile: { id: string; role: string; company: string | null }; isAdmin: boolean; error?: never }
    | { user?: never; profile?: never; isAdmin?: never; error: NextResponse }
> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    // `company` rides along because callers that attribute a row to the
    // employer (testimonials, outreach) otherwise fall back to the account
    // email as a display name, which writes PII into a public-facing field.
    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true, company: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    return {
        user: { id: user.id, email: user.email! },
        profile,
        isAdmin: profile.role === 'admin',
    };
}
