
import 'dotenv/config';

interface AshbyJob {
    id: string;
    title: string;
    location: string;
    publishedAt: string;
}

interface AshbyResponse {
    jobs: AshbyJob[];
}

const ASHBY_COMPANIES = [
    { slug: "equip", name: "Equip Health" },
    { slug: "ReklameHealth", name: "Reklame Health" },
    { slug: "legionhealth", name: "Legion Health" },
    { slug: "array-behavioral-care", name: "Array Behavioral Care" },
    { slug: "blossom-health", name: "Blossom Health" },
];

async function debugAshby() {
    for (const company of ASHBY_COMPANIES) {
        console.log(`\n--- ${company.name} (${company.slug}) ---`);
        try {
            const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${company.slug}`);
            const data: AshbyResponse = await response.json();
            const jobs = data.jobs || [];
            console.log(`Found ${jobs.length} total jobs.`);
            jobs.forEach(j => {
                console.log(`- [${j.publishedAt.split('T')[0]}] ${j.title}`);
            });
        } catch (e) {
            console.error(`Error for ${company.name}:`, e);
        }
    }
}

debugAshby();
