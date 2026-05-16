/**
 * Show where an employer's ProfileView unlocks are attributed.
 * Helps diagnose the "counter not moving" symptom — unlocks may be
 * debiting a different posting than the one selected in the UI.
 *
 *   npx tsx scripts/check-unlock-attribution.ts <email>
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

async function main(): Promise<void> {
    const email = process.argv[2];
    if (!email) {
        console.error('Usage: npx tsx scripts/check-unlock-attribution.ts <email>');
        process.exit(1);
    }

    const profile = await prisma.userProfile.findFirst({
        where: { email },
        select: { supabaseId: true, email: true },
    });
    if (!profile) {
        console.error(`No UserProfile for ${email}`);
        process.exit(1);
    }

    const views = await prisma.profileView.findMany({
        where: { viewerId: profile.supabaseId },
        select: { id: true, candidateId: true, employerJobId: true, viewedAt: true },
        orderBy: { viewedAt: 'desc' },
    });

    console.log(`Employer: ${email}`);
    console.log(`Total unlocks: ${views.length}\n`);

    const byPosting = new Map<string, number>();
    for (const v of views) {
        const key = v.employerJobId ?? '(null — no posting attributed)';
        byPosting.set(key, (byPosting.get(key) ?? 0) + 1);
    }

    console.log('Unlocks by employerJobId:');
    for (const [pid, count] of byPosting.entries()) {
        if (pid === '(null — no posting attributed)') {
            console.log(`  ${pid}: ${count}`);
        } else {
            const posting = await prisma.employerJob.findUnique({
                where: { id: pid },
                include: { job: { select: { title: true } } },
            });
            console.log(`  ${pid}: ${count} (${posting?.job?.title ?? 'unknown'})`);
        }
    }

    console.log('\nActive postings for this employer:');
    const postings = await prisma.employerJob.findMany({
        where: {
            OR: [{ userId: profile.supabaseId }, { contactEmail: profile.email ?? '' }],
            job: { isPublished: true, expiresAt: { gt: new Date() } },
        },
        include: { job: { select: { title: true } } },
    });
    for (const p of postings) {
        const count = await prisma.profileView.count({ where: { employerJobId: p.id } });
        console.log(`  ${p.id}: ${p.job?.title} — ${count} unlocks attributed`);
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
