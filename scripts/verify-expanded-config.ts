import { fetchJSearchJobs } from '../lib/aggregators/jsearch';
import {
    SEARCH_QUERIES,
    STATES,
    TOP_500_CITIES,
    NOTABLE_COUNTIES,
    TOP_EMPLOYERS
} from '../lib/aggregators/constants';

async function verify() {
    console.log('='.repeat(70));
    console.log('  PMHNP HIRING — HYPER-SCALE CONFIGURATION AUDIT');
    console.log('='.repeat(70));

    console.log('\n📊 BASE CONSTANTS:');
    console.log(`  Search Keywords:  ${SEARCH_QUERIES.length}`);
    console.log(`  States:           ${STATES.length}`);
    console.log(`  Top 500 Cities:   ${TOP_500_CITIES.length}`);
    console.log(`  Notable Counties: ${NOTABLE_COUNTIES.length}`);
    console.log(`  Top Employers:    ${TOP_EMPLOYERS.length}`);

    console.log('\n🔍 QUEUE STRATEGY (JSearch):');
    const kwCount = 6; // JSearch uses a subset of keywords for location multipliers
    console.log(`  National:         ${kwCount}`);
    console.log(`  Employers:        ${TOP_EMPLOYERS.length}`);
    console.log(`  States Multi:     ${kwCount * STATES.length}`);
    console.log(`  Cities Multi:     ${kwCount * TOP_500_CITIES.length}`);
    console.log(`  Counties Multi:   ${kwCount * NOTABLE_COUNTIES.length}`);

    const totalQueries = kwCount + TOP_EMPLOYERS.length + (kwCount * STATES.length) + (kwCount * TOP_500_CITIES.length) + (kwCount * NOTABLE_COUNTIES.length);
    console.log(`\n🚀 TOTAL ESTIMATED QUERIES: ${totalQueries}`);
    console.log(`📈 ESTIMATED API CALLS (5 pages/query): ${totalQueries * 5}`);

    console.log('\n🧪 SAMPLE QUERIES:');
    // We can't easily peek into the internal queue without modifying the function or exporting the logic
    // But we know the logic from the code:
    console.log(`  1. National: PMHNP`);
    console.log(`  2. Employer: ${TOP_EMPLOYERS[0]} PMHNP`);
    console.log(`  3. State:    PMHNP ${STATES[0]}`);
    console.log(`  4. City:     PMHNP ${TOP_500_CITIES[0]}`);
    console.log(`  5. County:   PMHNP ${NOTABLE_COUNTIES[0].split(',')[0]} County, ${NOTABLE_COUNTIES[0].split(',')[1].trim()}`);

    console.log('\n' + '='.repeat(70));
}

verify().catch(console.error);
