/**
 * Dump all live employer-posted jobs from prod for social sharing.
 *
 *   npx tsx scripts/list-employer-jobs-prod.ts                # tabular
 *   npx tsx scripts/list-employer-jobs-prod.ts --json         # JSON array
 *   npx tsx scripts/list-employer-jobs-prod.ts --fb           # one FB-post block per job
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
import { formatSalary } from '@/lib/utils';
// Import from the leaf module so we don't transitively pull in
// `tracker.ts` (which imports prisma at module load — that crashes the
// script because dotenv hasn't injected DATABASE_URL by the time ESM
// imports are hoisted).
import { ACTIVE_CAMPAIGN } from '@/lib/shortlinks/campaigns';

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Resolve a job's slug to its /r/f<id> short code (Facebook platform).
// Falls back to the bare /jobs/<slug> URL if the job isn't in the active
// campaign so the script still produces something usable for off-list
// jobs — but in --fb mode unmapped jobs will warn so they can be added.
function shortLinkFor(slug: string | null, jobId: string): string | null {
    if (!slug) return null;
    const job = ACTIVE_CAMPAIGN.jobs.find((j) => j.slug === slug);
    if (!job) return null;
    return `${BASE}/r/f${job.id}`;
}

// Use the same formatter the JD pages render so /hr vs /yr is canonical
// (this script's previous inline formatter only matched the bare 'hour'
// string and showed /yr for the 'hourly' variant in the DB).
function fmtSalary(min: number | null, max: number | null, period: string | null): string {
    return formatSalary(min, max, period);
}

async function main(): Promise<void> {
    const jobs = await prisma.job.findMany({
        where: { isPublished: true, sourceType: 'employer' },
        select: {
            id: true, slug: true, title: true, employer: true,
            location: true, city: true, state: true, mode: true, jobType: true,
            minSalary: true, maxSalary: true, salaryPeriod: true,
            experienceLabel: true, newGradFriendly: true,
            originalPostedAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    const json = process.argv.includes('--json');
    const fb = process.argv.includes('--fb');

    if (json) {
        const out = jobs.map((j) => ({
            url: `${BASE}/jobs/${j.slug ?? j.id}`,
            title: j.title,
            employer: j.employer,
            location: j.location,
            salary: fmtSalary(j.minSalary, j.maxSalary, j.salaryPeriod),
            jobType: j.jobType ?? '',
            mode: j.mode ?? '',
            experience: j.experienceLabel ?? '',
            postedAt: (j.originalPostedAt ?? j.createdAt).toISOString().slice(0, 10),
        }));
        console.log(JSON.stringify(out, null, 2));
        return;
    }

    if (fb) {
        // One copy/paste-ready Facebook post per job. Uses /r/f<id> short
        // links so FB's auto-linkifier picks them up (long /jobs/<uuid>
        // URLs were rendering as plain text inside multi-job posts).
        const unmapped: string[] = [];
        for (const j of jobs) {
            const short = shortLinkFor(j.slug, j.id);
            const url = short ?? `${BASE}/jobs/${j.slug ?? j.id}`;
            if (!short) unmapped.push(`${j.employer} — ${j.title}`);
            const salary = fmtSalary(j.minSalary, j.maxSalary, j.salaryPeriod);
            const lines = [
                `🩺 ${j.title} @ ${j.employer}`,
                `📍 ${j.location}${j.mode ? ` · ${j.mode}` : ''}${j.jobType ? ` · ${j.jobType}` : ''}`,
                salary ? `💰 ${salary}` : '',
                j.experienceLabel ? `🎓 ${j.experienceLabel}` : '',
                ``,
                url,
                ``,
                `#PMHNP #PsychNP #NursePractitioner #MentalHealthJobs #PMHNPJobs`,
            ].filter(Boolean);
            console.log(lines.join('\n'));
            console.log('\n---\n');
        }
        if (unmapped.length > 0) {
            console.error(`\n⚠  ${unmapped.length} job(s) not in ACTIVE_CAMPAIGN — falling back to long URLs:`);
            for (const u of unmapped) console.error(`   - ${u}`);
            console.error(`   Add them to lib/shortlinks/campaigns.ts to get short links.`);
        }
        return;
    }

    // Default: TSV-ish dump
    console.log(`title\temployer\tlocation\tsalary\tposted\turl`);
    for (const j of jobs) {
        const url = `${BASE}/jobs/${j.slug ?? j.id}`;
        const salary = fmtSalary(j.minSalary, j.maxSalary, j.salaryPeriod);
        const posted = (j.originalPostedAt ?? j.createdAt).toISOString().slice(0, 10);
        console.log(`${j.title}\t${j.employer}\t${j.location}\t${salary}\t${posted}\t${url}`);
    }
    console.error(`\n${jobs.length} employer-posted jobs total`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
