/**
 * Bulk Search Engine Indexing Script
 * 
 * Submits all site URLs to Google, Bing, and IndexNow for faster indexing.
 * 
 * Usage:
 *   npx tsx scripts/google-index.ts                    # Submit all URLs to all engines
 *   npx tsx scripts/google-index.ts --url https://pmhnphiring.com/blog/my-post  # Single URL
 *   npx tsx scripts/google-index.ts --engine google     # Google only
 *   npx tsx scripts/google-index.ts --engine bing       # Bing only
 *   npx tsx scripts/google-index.ts --engine indexnow   # IndexNow only
 * 
 * Requires env vars in .env.local:
 *   GOOGLE_INDEXING_CREDENTIALS  — Google service account JSON
 *   BING_WEBMASTER_API_KEY       — Bing Webmaster Tools API key
 *   INDEXNOW_API_KEY             — IndexNow key (must match public/{key}.txt)
 * 
 * Quotas: Google 200/day, Bing 10,000/day, IndexNow 10,000/batch
 */

import * as dotenv from 'dotenv';
import {
    pingGoogle,
    pingBingBatch,
    pingIndexNow,
    pingAllSearchEnginesBatch,
} from '../lib/search-indexing';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'https://pmhnphiring.com';

// ─── Fetch All URLs ──────────────────────────────────────────────────────────

async function getAllUrls(): Promise<string[]> {
    const urls: string[] = [];

    // Static pages
    const staticPages = [
        '', '/jobs', '/blog', '/for-employers', '/for-job-seekers',
        '/about', '/contact', '/faq', '/privacy', '/terms',
    ];
    urls.push(...staticPages.map(p => `${BASE_URL}${p}`));

    // Fetch sitemap for dynamic URLs
    try {
        const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
        if (sitemapResponse.ok) {
            const sitemapText = await sitemapResponse.text();
            const urlMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g) || [];
            const sitemapUrls = urlMatches
                .map(match => match.replace(/<\/?loc>/g, ''))
                .filter(url => !urls.includes(url));
            urls.push(...sitemapUrls);
        } else {
            console.warn('⚠️  Could not fetch sitemap.xml, using static pages only');
        }
    } catch (error) {
        console.warn('⚠️  Error fetching sitemap:', error);
    }

    return [...new Set(urls)];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    let singleUrl: string | null = null;
    let engine: 'all' | 'google' | 'bing' | 'indexnow' = 'all';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--url' && args[i + 1]) {
            singleUrl = args[i + 1];
            i++;
        } else if (args[i] === '--engine' && args[i + 1]) {
            engine = args[i + 1] as typeof engine;
            i++;
        }
    }

    console.log('🔍 Search Engine Bulk Indexing');
    console.log('─'.repeat(50));
    console.log(`   Engines: ${engine === 'all' ? 'Google + Bing + IndexNow' : engine}`);

    // Check configured engines
    const configured = {
        google: !!process.env.GOOGLE_INDEXING_CREDENTIALS,
        bing: !!process.env.BING_WEBMASTER_API_KEY,
        indexnow: !!process.env.INDEXNOW_API_KEY,
    };
    console.log(`   Google:   ${configured.google ? '✅ configured' : '⚠️  GOOGLE_INDEXING_CREDENTIALS not set'}`);
    console.log(`   Bing:     ${configured.bing ? '✅ configured' : '⚠️  BING_WEBMASTER_API_KEY not set'}`);
    console.log(`   IndexNow: ${configured.indexnow ? '✅ configured' : '⚠️  INDEXNOW_API_KEY not set'}`);
    console.log('');

    // Get URLs
    let urls: string[];
    if (singleUrl) {
        urls = [singleUrl];
        console.log(`📌 Single URL: ${singleUrl}\n`);
    } else {
        console.log('📋 Fetching all site URLs from sitemap...');
        urls = await getAllUrls();
        console.log(`   Found ${urls.length} URLs\n`);
    }

    if (engine === 'all') {
        // Cap Google at 200
        const googleUrls = urls.slice(0, 200);
        if (urls.length > 200) {
            console.warn(`⚠️  Google capped at 200/day. Submitting ${googleUrls.length} of ${urls.length} to Google.`);
            console.warn(`   Bing and IndexNow will get all ${urls.length} URLs.\n`);
        }

        console.log('🚀 Submitting to all engines...\n');

        const results = await pingAllSearchEnginesBatch(urls);

        // Summary
        const gSuccess = results.google.filter(r => r.success).length;
        const bSuccess = results.bing.filter(r => r.success).length;
        const iSuccess = results.indexNow.filter(r => r.success).length;

        console.log('\n' + '─'.repeat(50));
        console.log('📊 Results:');
        console.log(`   Google:   ${gSuccess}/${results.google.length} submitted`);
        console.log(`   Bing:     ${bSuccess}/${results.bing.length} submitted`);
        console.log(`   IndexNow: ${iSuccess}/${results.indexNow.length} submitted`);
    } else {
        console.log(`🚀 Submitting ${urls.length} URLs to ${engine}...\n`);

        let success = 0;
        let total = urls.length;

        if (engine === 'google') {
            const capped = urls.slice(0, 200);
            total = capped.length;
            for (let i = 0; i < capped.length; i++) {
                const result = await pingGoogle(capped[i]);
                if (result.success) {
                    console.log(`  ✅ [${i + 1}/${total}] ${capped[i]}`);
                    success++;
                } else {
                    console.log(`  ❌ [${i + 1}/${total}] ${capped[i]} — ${result.error}`);
                }
                await new Promise(r => setTimeout(r, 100));
            }
        } else if (engine === 'bing') {
            const results = await pingBingBatch(urls);
            success = results.filter(r => r.success).length;
            for (const r of results) {
                console.log(`  ${r.success ? '✅' : '❌'} ${r.url}${r.error ? ' — ' + r.error : ''}`);
            }
        } else if (engine === 'indexnow') {
            const results = await pingIndexNow(urls);
            success = results.filter(r => r.success).length;
            console.log(`  ${success > 0 ? '✅' : '❌'} Batch submitted ${urls.length} URLs`);
        }

        console.log('\n' + '─'.repeat(50));
        console.log(`📊 ${engine}: ${success}/${total} submitted`);
    }
}

main().catch((error) => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});
