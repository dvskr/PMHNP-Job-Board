import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';

/**
 * IndexNow key verification endpoint.
 * IndexNow requires the key file to be accessible at /{key}.txt
 * This route serves it dynamically from the env var.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ indexnow: string }> }
) {
    const key = process.env.INDEXNOW_API_KEY;
    if (!key) {
        notFound();
    }

    const { indexnow } = await params;

    // Only respond for the exact key or key.txt path
    if (indexnow !== key && indexnow !== `${key}.txt`) {
        notFound();
    }

    return new NextResponse(key, {
        headers: { 'Content-Type': 'text/plain' },
    });
}
