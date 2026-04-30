/**
 * Probe the Active Jobs DB (RapidAPI) to find under-utilized parameters.
 * Read-only — makes a small number of test calls and reports.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });

const API_HOST = 'active-jobs-db.p.rapidapi.com';
const KEY = process.env.RAPIDAPI_KEY;

if (!KEY) {
    console.error('RAPIDAPI_KEY not set in .env.prod');
    process.exit(1);
}

interface Probe {
    label: string;
    endpoint: string;
    params: Record<string, string>;
}

const PROBES: Probe[] = [
    // Baseline — what we currently do.
    {
        label: 'baseline: title_filter PMHNP',
        endpoint: '/active-ats-7d',
        params: { limit: '10', offset: '0', title_filter: 'PMHNP', location_filter: 'United States' },
    },
    // Try advanced_title_filter with OR syntax
    {
        label: 'advanced_title_filter with OR',
        endpoint: '/active-ats-7d',
        params: { limit: '10', offset: '0', advanced_title_filter: 'PMHNP OR "Psychiatric Nurse Practitioner"' },
    },
    // Description filter — catch "Nurse Practitioner" jobs where description mentions psychiatric
    {
        label: 'description_filter psychiatric',
        endpoint: '/active-ats-7d',
        params: { limit: '10', offset: '0', title_filter: 'Nurse Practitioner', description_filter: 'psychiatric' },
    },
    {
        label: 'description_filter mental health',
        endpoint: '/active-ats-7d',
        params: { limit: '10', offset: '0', title_filter: 'Nurse Practitioner', description_filter: 'mental health' },
    },
    // include_total to see catalog size
    {
        label: 'include_total - PMHNP universe',
        endpoint: '/active-ats-7d',
        params: { limit: '1', offset: '0', title_filter: 'PMHNP', location_filter: 'United States', include_total: 'true' },
    },
    {
        label: 'include_total - broader Nurse Practitioner',
        endpoint: '/active-ats-7d',
        params: { limit: '1', offset: '0', title_filter: 'Nurse Practitioner', description_filter: 'psychiatric OR mental health', include_total: 'true' },
    },
    // ai_work_arrangement
    {
        label: 'ai_work_arrangement remote',
        endpoint: '/active-ats-7d',
        params: { limit: '10', offset: '0', title_filter: 'Psychiatric', ai_work_arrangement_filter: 'Remote Solely OR Remote OK' },
    },
    // ai_employment_type
    {
        label: 'ai_employment_type FULL_TIME',
        endpoint: '/active-ats-7d',
        params: { limit: '10', offset: '0', title_filter: 'Psychiatric', ai_employment_type_filter: 'FULL_TIME' },
    },
    // 6-month endpoint
    {
        label: '6m endpoint - PMHNP',
        endpoint: '/active-ats-6m',
        params: { limit: '1', offset: '0', title_filter: 'PMHNP', include_total: 'true' },
    },
];

interface ProbeResult {
    label: string;
    endpoint: string;
    params: Record<string, string>;
    status: number;
    total?: number | null;
    sampleCount?: number;
    sampleTitles?: string[];
    headers: Record<string, string | null>;
    error?: string;
}

async function probe(p: Probe): Promise<ProbeResult> {
    const qs = new URLSearchParams(p.params).toString();
    const url = `https://${API_HOST}${p.endpoint}?${qs}`;
    try {
        const res = await fetch(url, {
            headers: { 'x-rapidapi-key': KEY!, 'x-rapidapi-host': API_HOST },
            signal: AbortSignal.timeout(15000),
        });

        const headers: Record<string, string | null> = {
            remaining: res.headers.get('x-ratelimit-requests-remaining'),
            limit: res.headers.get('x-ratelimit-requests-limit'),
        };

        if (!res.ok) {
            const text = await res.text();
            return { label: p.label, endpoint: p.endpoint, params: p.params, status: res.status, headers, error: text.slice(0, 200) };
        }

        const data = await res.json();
        // Some shapes return { items: [...], total: N }; others return [...]
        if (Array.isArray(data)) {
            return {
                label: p.label,
                endpoint: p.endpoint,
                params: p.params,
                status: res.status,
                headers,
                sampleCount: data.length,
                sampleTitles: data.slice(0, 3).map((d) => d.title ?? '(no title)'),
            };
        }
        return {
            label: p.label,
            endpoint: p.endpoint,
            params: p.params,
            status: res.status,
            headers,
            total: data.total ?? null,
            sampleCount: Array.isArray(data.items) ? data.items.length : 0,
            sampleTitles: Array.isArray(data.items) ? data.items.slice(0, 3).map((d: { title?: string }) => d.title ?? '(no title)') : [],
        };
    } catch (e) {
        return { label: p.label, endpoint: p.endpoint, params: p.params, status: -1, headers: {}, error: e instanceof Error ? e.message : String(e) };
    }
}

async function main(): Promise<void> {
    console.log('Probing Active Jobs DB (RapidAPI)...\n');
    for (const p of PROBES) {
        const r = await probe(p);
        console.log(`▶ ${r.label}`);
        console.log(`  endpoint: ${r.endpoint}`);
        console.log(`  params: ${JSON.stringify(r.params)}`);
        console.log(`  status: ${r.status}`);
        if (r.headers.remaining) console.log(`  remaining: ${r.headers.remaining}`);
        if (r.error) console.log(`  ERROR: ${r.error}`);
        if (r.total !== undefined) console.log(`  total: ${r.total}`);
        if (r.sampleCount !== undefined) console.log(`  returned: ${r.sampleCount}`);
        if (r.sampleTitles && r.sampleTitles.length > 0) {
            console.log(`  sample titles:`);
            for (const t of r.sampleTitles) console.log(`    - ${t}`);
        }
        console.log();
        // gentle pacing
        await new Promise((r) => setTimeout(r, 300));
    }
}

main().catch((e) => {
    console.error('probe failed:', e);
    process.exit(1);
});
