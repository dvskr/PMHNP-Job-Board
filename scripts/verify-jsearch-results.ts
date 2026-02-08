
import 'dotenv/config';
import { fetchJSearchJobs } from '../lib/aggregators/jsearch';

async function verifyJSearch() {
    console.log("🧪 Testing JSearch with a few targeted queries...");

    // Test 1: A national term
    // Test 2: A location term
    // Test 3: A "Psychiatrist/PMHNP" edge case if possible
    const results = await fetchJSearchJobs({
        specificQueries: ["PMHNP New York", "Psychiatric Nurse Practitioner Texas", "PMHNP Remote"]
    });

    console.log(`\n✅ Found ${results.length} total jobs matching queries.`);

    // Inspect first 30 for relevance
    console.log("\n--- Top 30 Titles for Relevance Check ---");
    results.slice(0, 30).forEach((job: any, i) => {
        console.log(`${i + 1}. [${job.location}] ${job.title} (@ ${job.employer})`);
    });
}

verifyJSearch();
