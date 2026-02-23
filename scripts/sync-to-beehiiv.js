/**
 * Bulk Sync: Push all existing email_leads from production DB to Beehiiv.
 *
 * Usage:
 *   node scripts/sync-to-beehiiv.js                 # Dry run (shows what would be sent)
 *   node scripts/sync-to-beehiiv.js --execute       # Actually sync to Beehiiv
 *
 * Requires env vars: BEEHIIV_API, BEEHIIV_PUBLICATION_ID, PROD_DATABASE_URL
 */

const { Pool } = require('pg');

const BEEHIIV_API_KEY = process.env.BEEHIIV_API || process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUB_ID = process.env.BEEHIIV_PUBLICATION_ID;
const PROD_URL = process.env.PROD_DATABASE_URL;
const DRY_RUN = !process.argv.includes('--execute');
const DELAY_MS = 300; // 300ms between requests to avoid rate limiting

async function syncEmail(email, source) {
    const url = `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${BEEHIIV_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: email.toLowerCase().trim(),
            reactivate_existing: false,
            send_welcome_email: false,
            utm_source: source || 'bulk_import',
            utm_medium: 'migration',
            referring_site: 'https://pmhnphiring.com',
        }),
    });

    if (res.status === 409) return 'already_exists';
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status}: ${text}`);
    }
    return 'created';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    // Validate env vars
    if (!BEEHIIV_API_KEY) {
        console.error('Missing BEEHIIV_API or BEEHIIV_API_KEY env var');
        process.exit(1);
    }
    if (!BEEHIIV_PUB_ID) {
        console.error('Missing BEEHIIV_PUBLICATION_ID env var');
        process.exit(1);
    }
    if (!PROD_URL) {
        console.error('Missing PROD_DATABASE_URL env var');
        process.exit(1);
    }

    console.log(DRY_RUN ? '\n=== DRY RUN (add --execute to sync) ===' : '\n=== LIVE SYNC ===');
    console.log(`Publication: ${BEEHIIV_PUB_ID}\n`);

    // Get all emails from production
    const pool = new Pool({ connectionString: PROD_URL });
    const client = await pool.connect();

    const result = await client.query(`
    SELECT DISTINCT email, source
    FROM email_leads
    WHERE is_subscribed = true
    ORDER BY email
  `);

    console.log(`Found ${result.rows.length} subscribed emails in production DB\n`);

    let created = 0, existing = 0, errors = 0;

    for (const row of result.rows) {
        const email = row.email.toLowerCase().trim();

        if (DRY_RUN) {
            console.log(`  [DRY] Would sync: ${email} (source: ${row.source || 'unknown'})`);
            continue;
        }

        try {
            const status = await syncEmail(email, row.source);
            if (status === 'created') {
                console.log(`  ✅ ${email} — added`);
                created++;
            } else {
                console.log(`  ⏭️  ${email} — already exists`);
                existing++;
            }
        } catch (err) {
            console.error(`  ❌ ${email} — ${err.message}`);
            errors++;
        }

        await sleep(DELAY_MS);
    }

    client.release();
    await pool.end();

    console.log(`
Summary:
  Total:    ${result.rows.length}
  Created:  ${created}
  Existing: ${existing}
  Errors:   ${errors}
`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
