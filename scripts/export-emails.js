const { Pool } = require('pg');
const fs = require('fs');

const PROD_URL = 'postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

async function main() {
    const pool = new Pool({ connectionString: PROD_URL });
    const client = await pool.connect();

    // Get all emails from email_leads
    const leads = await client.query(`
    SELECT email, source, is_subscribed, newsletter_opt_in, created_at
    FROM email_leads
    ORDER BY created_at DESC
  `);

    // Get all emails from user_profiles
    const users = await client.query(`
    SELECT email, first_name, last_name, role, created_at
    FROM user_profiles
    WHERE email IS NOT NULL
    ORDER BY created_at DESC
  `);

    // Get all emails from job_drafts (employers who started posting)
    const drafts = await client.query(`
    SELECT DISTINCT email
    FROM job_drafts
    WHERE email IS NOT NULL
  `);

    console.log('email_leads:   ', leads.rows.length);
    console.log('user_profiles: ', users.rows.length);
    console.log('job_drafts:    ', drafts.rows.length);

    // Build CSV for Beehiiv
    const rows = [];
    const seen = new Set();

    for (const row of leads.rows) {
        const key = row.email.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        const tags = [];
        if (row.source) tags.push(row.source);
        if (row.is_subscribed) tags.push('subscribed');
        if (row.newsletter_opt_in) tags.push('newsletter');
        rows.push({
            email: row.email,
            first_name: '',
            last_name: '',
            created_at: row.created_at ? row.created_at.toISOString().split('T')[0] : '',
            tags: tags.join('; '),
        });
    }

    for (const row of users.rows) {
        const key = row.email.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
            email: row.email,
            first_name: row.first_name || '',
            last_name: row.last_name || '',
            created_at: row.created_at ? row.created_at.toISOString().split('T')[0] : '',
            tags: 'user; ' + (row.role || 'job_seeker'),
        });
    }

    for (const row of drafts.rows) {
        const key = row.email.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
            email: row.email,
            first_name: '',
            last_name: '',
            created_at: '',
            tags: 'employer_draft',
        });
    }

    // Write CSV
    const esc = (v) => '"' + (v || '').replace(/"/g, '""') + '"';
    let csv = 'email,first_name,last_name,created_at,tags\n';
    for (const r of rows) {
        csv += [esc(r.email), esc(r.first_name), esc(r.last_name), esc(r.created_at), esc(r.tags)].join(',') + '\n';
    }

    const outPath = 'beehiiv-email-export.csv';
    fs.writeFileSync(outPath, csv);
    console.log('\nTotal unique emails:', seen.size);
    console.log('Saved to:', outPath);

    client.release();
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
