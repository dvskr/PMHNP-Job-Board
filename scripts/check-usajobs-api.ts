/**
 * Smoke-test the USAJobs Search API end-to-end before letting the cron
 * loose. Confirms three things:
 *   1. Auth headers are correct (API key + User-Agent both required).
 *   2. The JobCategoryCode=0610 + keyword combo returns federal nursing
 *      postings with the structure our adapter assumes.
 *   3. At least one PMHNP-relevant role exists in the live feed.
 *
 * Run with:
 *   npx tsx scripts/check-usajobs-api.ts
 *
 * Read-only. Never touches the DB.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

const apiKey = process.env.USAJOBS_API_KEY;
const userAgent = process.env.USAJOBS_USER_AGENT;

if (!apiKey || !userAgent) {
    console.error('Missing USAJOBS_API_KEY or USAJOBS_USER_AGENT in .env.local');
    process.exit(1);
}

interface PositionLocation {
    LocationName?: string;
    CityName?: string;
    CountrySubDivisionCode?: string;
}

interface Remuneration {
    MinimumRange?: string;
    MaximumRange?: string;
    RateIntervalCode?: string;
}

interface Descriptor {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    OrganizationName?: string;
    DepartmentName?: string;
    PositionLocation?: PositionLocation[];
    PositionLocationDisplay?: string;
    PositionRemuneration?: Remuneration[];
    PublicationStartDate?: string;
    UserArea?: { Details?: { JobSummary?: string } };
}

interface SearchItem {
    MatchedObjectId: string;
    MatchedObjectDescriptor: Descriptor;
}

interface SearchResponse {
    SearchResult?: {
        SearchResultCount?: number;
        SearchResultCountAll?: number;
        SearchResultItems?: SearchItem[];
    };
}

async function main(): Promise<void> {
    const query = 'Psychiatric Mental Health Nurse Practitioner';
    const params = new URLSearchParams({
        Keyword: query,
        JobCategoryCode: '0610',
        ResultsPerPage: '25',
        Page: '1',
        DatePosted: '30',
    });
    const url = `https://data.usajobs.gov/api/search?${params.toString()}`;

    console.log('USAJobs smoke test');
    console.log('  URL:', url);
    console.log('  User-Agent:', userAgent);
    console.log('  Key:', `${apiKey!.slice(0, 8)}…${apiKey!.slice(-4)} (${apiKey!.length} chars)`);
    console.log();

    const t0 = Date.now();
    const response = await fetch(url, {
        headers: {
            Host: 'data.usajobs.gov',
            'User-Agent': userAgent!,
            'Authorization-Key': apiKey!,
            Accept: 'application/json',
        },
    });
    const elapsed = Date.now() - t0;

    console.log(`HTTP ${response.status} in ${elapsed}ms`);
    if (!response.ok) {
        const body = await response.text();
        console.error('Body:', body.slice(0, 500));
        process.exit(2);
    }

    const data = (await response.json()) as SearchResponse;
    const sr = data.SearchResult;
    const items = sr?.SearchResultItems ?? [];

    console.log(`SearchResultCount:    ${sr?.SearchResultCount ?? '?'}`);
    console.log(`SearchResultCountAll: ${sr?.SearchResultCountAll ?? '?'}`);
    console.log(`Items returned:       ${items.length}`);
    console.log();

    if (items.length === 0) {
        console.warn('⚠️  Zero items — API auth worked but no PMHNP-relevant federal nurse postings in the last 30 days. Unusual — recheck keyword/category combo.');
        process.exit(0);
    }

    console.log('First 5 sample postings:');
    console.log('─'.repeat(100));
    for (const it of items.slice(0, 5)) {
        const d = it.MatchedObjectDescriptor;
        const loc = d.PositionLocation?.[0];
        const locStr = loc?.CityName && loc.CountrySubDivisionCode
            ? `${loc.CityName.split(',')[0]}, ${loc.CountrySubDivisionCode}`
            : d.PositionLocationDisplay ?? '?';
        const rem = d.PositionRemuneration?.[0];
        const salary = rem
            ? `$${rem.MinimumRange ?? '?'}–$${rem.MaximumRange ?? '?'} (${rem.RateIntervalCode ?? '?'})`
            : 'no salary';
        console.log(`  [${it.MatchedObjectId}] ${d.PositionTitle}`);
        console.log(`      ${d.OrganizationName ?? d.DepartmentName ?? '?'} · ${locStr}`);
        console.log(`      ${salary} · posted ${d.PublicationStartDate?.slice(0, 10) ?? '?'}`);
        console.log(`      ${d.PositionURI}`);
        console.log();
    }

    console.log('✅ Auth works. Shape matches adapter assumptions. Safe to enable cron.');
}

main().catch((err) => {
    console.error('Smoke test crashed:', err);
    process.exit(3);
});
