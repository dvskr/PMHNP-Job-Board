/**
 * Apply pending Prisma migrations to PROD.
 *
 * Why this wrapper: `prisma migrate deploy` reads DATABASE_URL from the
 * default `.env`. Running it against prod requires loading `.env.prod`
 * first AND remapping PROD_DATABASE_URL/PROD_DIRECT_URL into the names
 * Prisma expects. Mirroring the env-load logic from check-schema.ts so
 * a single `npm run db:migrate:prod` invocation Just Works.
 *
 * Usage:
 *   npm run db:migrate:prod
 *
 * Exits with the same code as `prisma migrate deploy`.
 */
import { config as dotenvConfig } from 'dotenv';
import { spawnSync } from 'node:child_process';

dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

console.log('[migrate-prod] applying pending migrations to PROD...');

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
