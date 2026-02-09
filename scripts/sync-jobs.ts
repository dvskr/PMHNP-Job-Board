
import 'dotenv/config';
import { Pool } from 'pg';

// Connection Strings (Loaded from .env)
const PROD_URL = process.env.PROD_DATABASE_URL;
const DEV_URL = process.env.DATABASE_URL;

if (!PROD_URL || !DEV_URL) {
    console.error('❌ Missing PROD_DATABASE_URL or DATABASE_URL in .env');
    process.exit(1);
}

async function syncJobs() {
    console.log('🔄 Starting Job Sync...');

    // 1. Connect to PROD
    const prodPool = new Pool({
        connectionString: PROD_URL,
        ssl: { rejectUnauthorized: false } // Required for Supabase
    });

    // 2. Connect to DEV
    const devPool = new Pool({
        connectionString: DEV_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('📡 Connecting to PROD...');
        const prodClient = await prodPool.connect();

        // Fetch all PUBLISHED jobs from Prod (can filter if needed)
        console.log('📦 Fetching jobs from PROD...');
        const res = await prodClient.query('SELECT * FROM jobs');
        prodClient.release();

        const jobs = res.rows;
        console.log(`✅ Fetched ${jobs.length} jobs from PROD.`);

        if (jobs.length === 0) {
            console.log('No jobs to sync.');
            return;
        }


        // --- STEP 1: Sync Companies ---
        console.log('🏢 Fetching companies from PROD...');
        const companyRes = await prodClient.query('SELECT * FROM companies');
        const companies = companyRes.rows;
        console.log(`✅ Fetched ${companies.length} companies from PROD.`);

        console.log('📡 Connecting to DEV...');
        const devClient = await devPool.connect();

        if (companies.length > 0) {
            console.log('💾 Inserting companies into DEV...');
            let companySuccess = 0;
            let companyError = 0;

            for (const company of companies) {
                try {
                    const col = Object.keys(company).map(k => `"${k}"`).join(', ');
                    const val = Object.values(company);
                    const pl = val.map((_, i) => `$${i + 1}`).join(', ');

                    const q = `
                  INSERT INTO companies (${col}) 
                  VALUES (${pl})
                  ON CONFLICT (id) DO NOTHING;
                `;
                    await devClient.query(q, val);
                    companySuccess++;
                } catch (err: any) {
                    // Ignore errors for now, probably duplicates
                    companyError++;
                }
            }
            console.log(`   - Companies Imported: ${companySuccess}`);
        }

        // Optional: Clear Dev Jobs first?
        // console.log('🧹 Clearing DEV jobs table...');
        // await devClient.query('TRUNCATE TABLE jobs CASCADE'); 

        console.log('💾 Inserting jobs into DEV...');
        let successCount = 0;
        let errorCount = 0;

        for (const job of jobs) {
            try {
                // Construct INSERT statement dynamically
                const columns = Object.keys(job).map(k => `"${k}"`).join(', '); // Quote columns for safety (camelCase vs snake_case)
                const values = Object.values(job);
                const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

                const query = `
          INSERT INTO jobs (${columns}) 
          VALUES (${placeholders})
          ON CONFLICT (id) DO NOTHING;
        `;

                await devClient.query(query, values);
                successCount++;
                if (successCount % 100 === 0) process.stdout.write('.');
            } catch (err: any) {
                if (errorCount < 5) {
                    console.error(`Failed to insert job ${job.id}:`, err.message);
                }
                errorCount++;
            }
        }

        devClient.release();
        console.log(`\n\n🎉 Sync Complete!`);
        console.log(`   - Imported: ${successCount}`);
        console.log(`   - Skipped/Failed: ${errorCount}`);

    } catch (error) {
        console.error('❌ Fatal Error:', error);
    } finally {
        await prodPool.end();
        await devPool.end();
    }
}

syncJobs();
