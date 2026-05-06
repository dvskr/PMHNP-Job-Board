/**
 * One-shot probe with an inline key. Costs exactly 1 request.
 */
const KEY = process.argv[2] ?? '';
const HOST = 'ats-jobs-db.p.rapidapi.com';

if (!KEY) {
    console.error('usage: npx tsx scripts/ats-probe-once.ts <KEY>');
    process.exit(1);
}

const url =
    `https://${HOST}/v1/jobs?page_size=2&location=United%20States&q=PMHNP&page=1&posted_after=2026-05-01T00%3A00%3A00Z`;

(async () => {
    const res = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-host': HOST,
            'x-rapidapi-key': KEY,
        },
    });
    console.log(`Status: ${res.status}`);
    for (const [k, v] of res.headers.entries()) {
        if (k.toLowerCase().includes('ratelimit') || k === 'content-type') {
            console.log(`${k}: ${v}`);
        }
    }
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log('--- BODY ---');
    console.log(typeof parsed === 'string' ? parsed.slice(0, 2000) : JSON.stringify(parsed, null, 2).slice(0, 4000));

    // Schema fingerprint — just the field names
    if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('\n--- SCHEMA (first record top-level keys) ---');
        console.log(Object.keys(parsed[0] as Record<string, unknown>).join(', '));
    } else if (parsed && typeof parsed === 'object') {
        const first = Object.values(parsed as Record<string, unknown>).find((v) => Array.isArray(v) && v.length > 0) as
            | Record<string, unknown>[]
            | undefined;
        if (first?.[0]) {
            console.log('\n--- SCHEMA (first record top-level keys) ---');
            console.log(Object.keys(first[0]).join(', '));
        }
    }
})();
