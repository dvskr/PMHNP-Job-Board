require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Check if tables exist
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('job_reports', 'user_feedback')
            ORDER BY table_name
        `);
        console.log('Tables found:', result.rows.map(r => r.table_name));

        if (result.rows.length === 0) {
            console.log('\nTables do NOT exist! Creating them...');

            // Create job_reports table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS job_reports (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    reason TEXT NOT NULL,
                    details TEXT,
                    ip_hash TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_job_reports_job_id ON job_reports(job_id);
            `);
            console.log('Created job_reports table');

            // Create user_feedback table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_feedback (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    rating INTEGER NOT NULL,
                    message TEXT,
                    page TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            `);
            console.log('Created user_feedback table');
        } else {
            console.log('\nTables already exist!');

            // Test insert into user_feedback
            try {
                const testResult = await pool.query(
                    'INSERT INTO user_feedback (id, rating, message, page) VALUES ($1, $2, $3, $4) RETURNING id',
                    ['test-' + Date.now(), 5, 'test feedback', '/test']
                );
                console.log('Test insert OK:', testResult.rows[0]);
                // Clean up
                await pool.query('DELETE FROM user_feedback WHERE id = $1', [testResult.rows[0].id]);
                console.log('Test cleanup OK');
            } catch (e) {
                console.error('Test insert FAILED:', e.message);
            }
        }
    } catch (e) {
        console.error('ERROR:', e.message);
    }

    await pool.end();
}
main();
