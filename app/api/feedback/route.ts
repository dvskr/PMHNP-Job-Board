import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

// Simple in-memory rate limit (per IP, 3 submissions per hour)
const feedbackCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = feedbackCounts.get(ip);
    if (!entry || now > entry.resetAt) {
        feedbackCounts.set(ip, { count: 1, resetAt: now + 3600000 });
        return false;
    }
    if (entry.count >= 3) return true;
    entry.count++;
    return false;
}

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Too many submissions. Please try again later.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { rating, message, page } = body;

        if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Rating must be between 1 and 5' },
                { status: 400 }
            );
        }

        await prisma.userFeedback.create({
            data: {
                rating,
                message: message?.slice(0, 500) || null,
                page: page?.slice(0, 255) || null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Feedback] Error:', error);
        return NextResponse.json(
            { error: 'Failed to submit feedback' },
            { status: 500 }
        );
    }
}
