
import 'dotenv/config';
import { Pool } from 'pg';

// Connection Strings
const PROD_URL = "postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"; // Explicitly NO SSL verify for scripts usually
// Removing pgbouncer=true for direct connection if pooler fails, but let's try with it first.
// Often scripts need query mode 'transaction' or simple strings.

const DEV_URL = "postgresql://postgres:6174jirayasensei@db.zdmpmncrcpgpmwdqvekg.supabase.co:6543/postgres"; // Removing pgbouncer for standard connection usually safer for scripts

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

        console.log('📡 Connecting to DEV...');
        const devClient = await devPool.connect();

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
