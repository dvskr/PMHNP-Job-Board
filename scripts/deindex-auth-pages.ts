/**
 * GSC Indexing Crisis (P2.3): one-shot URL_DELETED submission for the 5
 * auth pages stuck in "Indexed, though blocked by robots.txt".
 *
 * Run AFTER deploying the robots.ts change that unblocks these paths.
 * Sequence:
 *   1. Deploy the P2.3 robots.ts change → Googlebot can now crawl these paths
 *   2. Run this script → submit URL_DELETED for each (instant signal)
 *   3. Wait ~14 days → Google re-crawls, sees X-Robots-Tag: noindex, drops
 *   4. Manually re-add paths to FULL_DISALLOW (see AUTH_REBLOCK_DATE in robots.ts)
 *
 * Each URL uses the Google Indexing API DELETION quota (100/day, separate
 * from the creation quota). 5 URLs is well within budget.
 *
 * Run:
 *   npx tsx scripts/deindex-auth-pages.ts          # submit
 *   npx tsx scripts/deindex-auth-pages.ts --dry    # print what would be submitted
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const BASE = 'https://pmhnphiring.com';

// The 5 URLs from GSC's "Indexed, though blocked by robots.txt" drilldown
// (GSC ISSUES/https___pmhnphiring.com_-Coverage-Drilldown-2026-05-04 (3)/Table.csv).
const AUTH_URLS = [
    `${BASE}/signup`,
    `${BASE}/messages`,
    `${BASE}/job-alerts/manage`,
    `${BASE}/employer/login`,
    `${BASE}/saved`,
];

async function main() {
    console.log(`P2.3: de-indexing ${AUTH_URLS.length} auth URLs.`);
    for (const url of AUTH_URLS) console.log(`  - ${url}`);

    if (DRY) {
        console.log(`\n--dry: not submitting. Re-run without --dry to submit.`);
        return;
    }

    // PRE-FLIGHT: confirm robots.txt actually permits crawling these paths.
    // If FULL_DISALLOW still blocks them, Google will see noindex on next crawl
    // attempt only AFTER seeing it's allowed; submitting URL_DELETED before
    // unblocking wastes the deletion quota with no effect.
    try {
        const robotsRes = await fetch(`${BASE}/robots.txt`);
        if (robotsRes.ok) {
            const txt = await robotsRes.text();
            const stillBlocked = AUTH_URLS.filter((u) => {
                const path = new URL(u).pathname;
                // crude line scan
                return new RegExp(`^Disallow:\\s*${path.replace(/[/.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'm').test(txt);
            });
            if (stillBlocked.length > 0) {
                console.error(`\n⚠ robots.txt still blocks the following paths:`);
                for (const u of stillBlocked) console.error(`    ${u}`);
                console.error(`\nDeploy the P2.3 robots.ts change first, then re-run this script.`);
                process.exit(1);
            }
            console.log(`\nrobots.txt pre-flight: OK — paths are now crawlable.`);
        }
    } catch (err) {
        console.warn(`Could not fetch robots.txt for pre-flight (${err}). Proceeding anyway.`);
    }

    const { pingGoogle, pingIndexNow } = await import('@/lib/search-indexing');

    let googleOk = 0;
    let googleFail = 0;
    for (const url of AUTH_URLS) {
        const r = await pingGoogle(url, 'URL_DELETED');
        if (r.success) {
            googleOk++;
            console.log(`  ✓ Google URL_DELETED: ${url}`);
        } else {
            googleFail++;
            console.error(`  ✗ Google URL_DELETED failed: ${url} — ${r.error}`);
        }
        await new Promise((r) => setTimeout(r, 200)); // gentle pacing
    }

    console.log(`\nIndexNow batch...`);
    const indexNowResults = await pingIndexNow(AUTH_URLS);
    const indexNowOk = indexNowResults.filter((r) => r.success).length;

    console.log(`\nDone.`);
    console.log(`  Google: ${googleOk} ok, ${googleFail} failed`);
    console.log(`  IndexNow: ${indexNowOk}/${indexNowResults.length} ok`);
    console.log(`\nNext: wait ~14 days → re-pull GSC Coverage report → confirm`);
    console.log(`"Indexed, though blocked by robots.txt" count drops to 0.`);
    console.log(`Then re-add paths to FULL_DISALLOW per AUTH_REBLOCK_DATE in robots.ts.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
