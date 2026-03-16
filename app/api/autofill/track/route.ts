import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyExtensionToken } from '@/lib/verify-extension-token';


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
