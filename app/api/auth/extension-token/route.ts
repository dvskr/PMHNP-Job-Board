import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.EXTENSION_JWT_SECRET || process.env.NEXTAUTH_SECRET || '';

export async function GET() {
    try {
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Fetch user profile
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: {
                id: true,
                email: true,
                firstName: true,
                role: true,
            },
        });

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Generate a JWT for the extension
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const secret = new TextEncoder().encode(JWT_SECRET);

        const token = await new SignJWT({
            userId: profile.id,
            supabaseId: user.id,
            email: profile.email,
            role: profile.role,
            purpose: 'extension',
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('1h')
            .setIssuedAt()
            .sign(secret);

        return NextResponse.json({
            token,
            userId: profile.id,
            email: profile.email,
            firstName: profile.firstName || '',
            expiresAt: expiresAt.toISOString(),
        });
    } catch (error) {
        console.error('Extension token error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
