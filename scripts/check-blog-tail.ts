import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

// Load prod env
const prodEnv = fs.readFileSync(path.join(process.cwd(), '.env.prod'), 'utf-8');
const prodDbUrl = prodEnv.match(/^PROD_DIRECT_DATABASE_URL=(.+)$/m)?.[1];
if (!prodDbUrl) throw new Error('PROD_DIRECT_DATABASE_URL not found in .env.prod');

const pool = new Pool({ connectionString: prodDbUrl, max: 1 });
(async () => {
    const { rows } = await pool.query(
        `SELECT RIGHT(content, 600) as tail FROM blog_posts WHERE slug = 'how-to-become-a-pmhnp'`
    );
    console.log('=== PROD DB: LAST 600 CHARS OF how-to-become-a-pmhnp ===');
    console.log(rows[0]?.tail || 'NOT FOUND');
    await pool.end();
})();
