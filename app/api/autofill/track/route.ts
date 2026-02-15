import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.EXTENSION_JWT_SECRET || process.env.NEXTAUTH_SECRET || '';

async function verifyExtensionToken(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        if (payload.purpose !== 'extension') return null;
        return payload as { userId: string; supabaseId: string; email: string; role: string };
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await verifyExtensionToken(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { pageUrl, atsName, fieldsFilled, aiGenerations } = body;

        if (!pageUrl) {
            return NextResponse.json({ error: 'pageUrl is required' }, { status: 400 });
        }

        await prisma.autofillUsage.create({
            data: {
                userId: user.userId,
                pageUrl,
                atsName: atsName || null,
                fieldsFilled: fieldsFilled || 0,
                aiGenerations: aiGenerations || 0,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Track autofill error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
