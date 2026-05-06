/**
 * Single-call probe of ats-jobs-db. Hits the simplest GET endpoint with
 * minimal params, dumps the FULL raw response so we can see:
 *   - exact field names returned (id / title / company vs organization / etc.)
 *   - response wrapper shape (array vs { jobs: [] } vs { results: [] })
 *   - whether unknown params are silently ignored or 400'd
 *
 * Costs at most 1 request from your monthly quota.
 */
import 'dotenv/config';

const KEY = process.env.RAPIDAPI_KEY ?? '';
const HOST = 'ats-jobs-db.p.rapidapi.com';

async function call(label: string, url: string, init?: RequestInit) {
    console.log(`\n=== ${label} ===`);
    console.log(`URL: ${url}`);
    if (init?.body) console.log(`Body: ${init.body}`);
    const res = await fetch(url, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            'x-rapidapi-host': HOST,
            'x-rapidapi-key': KEY,
        },
    });
    console.log(`Status: ${res.status}`);
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null) console.log(`Remaining: ${remaining}`);
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log('Response:');
    console.log(typeof parsed === 'string' ? parsed.slice(0, 1500) : JSON.stringify(parsed, null, 2).slice(0, 2500));
    return parsed;
}

async function main() {
    if (!KEY) {
        console.error('RAPIDAPI_KEY not set');
        process.exit(1);
    }

    // ONE call: simplest GET with bare minimum params. If quota is 0 we
    // get 429 and learn nothing new — but if a single request slips
    // through (quotas sometimes reset on plan upgrade) we get the full
    // job-record schema.
    await call(
        'GET /v1/jobs?q=PMHNP&location=United%20States&page_size=1',
        `https://${HOST}/v1/jobs?q=PMHNP&location=United%20States&page_size=1`,
    );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
