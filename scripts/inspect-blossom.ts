
import 'dotenv/config';

async function inspectBlossomJob() {
    const companySlug = 'blossom-health';
    try {
        const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${companySlug}`);
        const data = await response.json();
        const jobs = data.jobs || [];

        console.log(`\n--- Blossom Health Jobs (${jobs.length}) ---`);
        jobs.forEach((j: any) => {
            console.log(`\nTITLE: ${j.title}`);
            console.log(`URL: ${j.jobUrl}`);
            // Only print first 500 chars of description to verify
            const desc = j.descriptionPlain || j.descriptionHtml || "";
            console.log(`DESC: ${desc.substring(0, 1000)}...`);
        });
    } catch (e) {
        console.error(`Error:`, e);
    }
}

inspectBlossomJob();
