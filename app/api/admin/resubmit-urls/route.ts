/**
 * POST /api/admin/resubmit-urls
 * 
 * Batch resubmit URLs to search engines. Expects a JSON body with an array of URLs.
 * Uses the Google Indexing API, Bing, and IndexNow (which are configured on production via Vercel env vars).
 * 
 * Protected by CRON_SECRET for admin-only access.
 * 
 * Body: { urls: string[] }
 * Query: ?secret=CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { pingAllSearchEnginesBatch } from '@/lib/search-indexing';

export async function POST(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { urls } = await req.json();

        if (!Array.isArray(urls) || urls.length === 0) {
            return NextResponse.json({ error: 'urls array required' }, { status: 400 });
        }

        // Cap at 500 per request to avoid timeouts
        const batch = urls.slice(0, 500);
        console.log(`[resubmit-urls] Submitting ${batch.length} URLs...`);

        const results = await pingAllSearchEnginesBatch(batch);

        const googleSuccess = results.google.filter(r => r.success).length;
        const bingSuccess = results.bing.filter(r => r.success).length;
        const indexNowSuccess = results.indexNow.filter(r => r.success).length;

        console.log(`[resubmit-urls] Google: ${googleSuccess}/${results.google.length}, Bing: ${bingSuccess}/${results.bing.length}, IndexNow: ${indexNowSuccess}/${results.indexNow.length}`);

        return NextResponse.json({
            submitted: batch.length,
            results: {
                google: { success: googleSuccess, total: results.google.length },
                bing: { success: bingSuccess, total: results.bing.length },
                indexNow: { success: indexNowSuccess, total: results.indexNow.length },
            },
            // Show first few errors for debugging
            errors: {
                google: results.google.filter(r => !r.success).slice(0, 5).map(r => ({ url: r.url, error: r.error })),
                bing: results.bing.filter(r => !r.success).slice(0, 3).map(r => ({ url: r.url, error: r.error })),
            },
        });
    } catch (error) {
        console.error('[resubmit-urls] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
