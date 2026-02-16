import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * Verify that the request is from an authenticated admin user.
 * Works for API routes (checks Supabase session cookie).
 *
 * @returns null if authorized, or a NextResponse (401/403) to return immediately.
 */
export async function requireApiAdmin(): Promise<NextResponse | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { role: true },
        });

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }

        return null; // Authorized
    } catch {
        return NextResponse.json(
            { error: 'Authentication failed' },
            { status: 401 }
        );
    }
}
