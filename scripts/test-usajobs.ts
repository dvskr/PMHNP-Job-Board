
import 'dotenv/config';
import { fetchUSAJobs } from '../lib/aggregators/usajobs';

async function main() {
    console.log('🇺🇸 Testing USAJobs Aggregator...');

    if (!process.env.USAJOBS_API_KEY) {
        console.error('❌ USAJOBS_API_KEY is missing in .env');
        process.exit(1);
    }

    try {
        const jobs = await fetchUSAJobs(); // Fetch all (limited to 5 pages per keyword in code)

        console.log(`\n✅ Fetched ${jobs.length} jobs.`);

        if (jobs.length > 0) {
            console.log('\n📄 Sample Job 1:');
            console.log(JSON.stringify(jobs[0], null, 2));

            // Check for salary parsing effectiveness
            const withSalary = jobs.filter(j => j.salary_min !== null || j.salary_max !== null);
            console.log(`\n💰 Jobs with Salary: ${withSalary.length}/${jobs.length}`);
            if (withSalary.length > 0) {
                console.log(`   Sample Salary: $${withSalary[0].salary_min} - $${withSalary[0].salary_max} (${withSalary[0].salary_period})`);
            }

            // Check for multiple locations (USAJobs often has them)
            // The current aggregator takes the *first* location.
            // We might want to see if we are missing data.
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
