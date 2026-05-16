/**
 * Deletes all ProfileView records (unlocks) where the viewer matches a
 * given email. Lets you re-test the unlock flow as that user without
 * having to manually un-unlock candidates in the dashboard.
 *
 * Defaults to dev env. Pass --env=prod to target prod (gated behind .env.prod).
 *
 * Usage:
 *   npx tsx scripts/reset-unlocks-for-user.ts test@pmhnphiring.com           # dry-run
 *   npx tsx scripts/reset-unlocks-for-user.ts test@pmhnphiring.com --apply   # delete
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
    const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
    if (flag === 'dev' || flag === 'prod') return flag;
    if (process.argv.includes('--prod')) return 'prod';
    return 'dev';
}
const ENV: EnvKind = parseEnvFlag();
if (ENV === 'prod') {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    }
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
        process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
    }
} else {
    dotenvConfig({ path: '.env' });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
    const email = process.argv.find((a) => !a.startsWith('--') && a.includes('@'));
    if (!email) {
        console.error('Usage: npx tsx scripts/reset-unlocks-for-user.ts <email> [--apply] [--env=dev|prod]');
        process.exit(1);
    }

    const profile = await prisma.userProfile.findFirst({
        where: { email },
        select: { supabaseId: true, email: true, role: true },
    });
    if (!profile) {
        console.error(`No UserProfile found for email=${email}`);
        process.exit(1);
    }

    const count = await prisma.profileView.count({
        where: { viewerId: profile.supabaseId },
    });

    console.log(`Found ${count} ProfileView records for ${email} (supabaseId=${profile.supabaseId}, role=${profile.role}) in env=${ENV}`);

    if (count === 0) {
        console.log('Nothing to delete.');
        return;
    }

    if (!APPLY) {
        console.log('Dry-run. Pass --apply to commit the delete.');
        return;
    }

    const result = await prisma.profileView.deleteMany({
        where: { viewerId: profile.supabaseId },
    });
    console.log(`Deleted ${result.count} ProfileView records.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
