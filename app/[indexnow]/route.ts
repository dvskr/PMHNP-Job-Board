import { NextResponse } from 'next/server';

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
        return new NextResponse('Not found', { status: 404 });
    }

    const { indexnow } = await params;

    // Only respond for the exact key or key.txt path
    if (indexnow !== key && indexnow !== `${key}.txt`) {
        return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(key, {
        headers: { 'Content-Type': 'text/plain' },
    });
}
