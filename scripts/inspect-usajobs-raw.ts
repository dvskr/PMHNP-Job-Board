
import 'dotenv/config';
import { fetchUSAJobs } from '../lib/aggregators/usajobs';

async function main() {
    console.log('🇺🇸 Testing USAJobs Aggregator...');

    try {
        // We need to modify fetchUSAJobs to return the raw object OR we just check the source code.
        // Since fetchUSAJobs returns USAJobRaw (our format), we can't see the original "PositionLocation" array 
        // unless we modify the aggregator temporarily or trust the aggregator to tell us.

        // Actually, I can't check "Multiple Locations" from the *output* of fetchUSAJobs 
        // because it already reduces it to a single string. 
        // I need to use the `test-usajobs.ts` to call the API *directly* 
        // OR modify the aggregator to log when it drops locations.

        // Let's call the API directly in this test script to inspect the raw JSON structure for a few jobs.

        const apiKey = process.env.USAJOBS_API_KEY;
        const url = 'https://data.usajobs.gov/api/search?Keyword=PMHNP&ResultsPerPage=5';

        const response = await fetch(url, {
            headers: {
                'Authorization-Key': apiKey!,
                'User-Agent': process.env.USAJOBS_USER_AGENT || 'pmhnp-jobs@example.com',
                'Host': 'data.usajobs.gov',
            },
        });

        const data = await response.json();
        const items = data.SearchResult.SearchResultItems;

        console.log(`\n🔍 Inspecting ${items.length} raw items for multiple locations...`);

        for (const item of items) {
            const job = item.MatchedObjectDescriptor;
            const locs = job.PositionLocation;

            console.log(`\nJob: ${job.PositionTitle}`);
            console.log(`Locations Found: ${locs.length}`);
            if (locs.length > 1) {
                console.log('   ⚠️  MULTIPLE LOCATIONS DETECTED:');
                locs.forEach((l: any) => console.log(`      - ${l.LocationName}`));
            } else {
                console.log(`   📍 Single Location: ${locs[0]?.LocationName}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
