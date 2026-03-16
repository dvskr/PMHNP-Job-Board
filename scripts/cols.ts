import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL })

async function main() {
    const c = await pool.connect()
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND table_schema = 'public' ORDER BY ordinal_position`)
    console.log(r.rows.map((x: any) => x.column_name).join('\n'))
    c.release()
    await pool.end()
}

main()
