/**
 * Re-classify rows where the legacy `experienceLevel` was set to "New Grad"
 * but the description body contains an explicit minimum-year requirement
 * (e.g. "1 year experience as PMHNP").
 *
 * Why: prior to 2026-05-14, `lib/job-normalizer.ts:detectExperienceLevel`
 * treated phrases like "1 year of experience" as a new-grad signal. That
 * propagated through the Phase-0 backfill into `newGradFriendly=true /
 * minYearsExperience=0 / experienceLabel="New grad welcome"`. With the
 * normalizer + inference disconfirmation guard now in place, re-running
 * `inferExperience` on these rows downgrades them.
 *
 * This is a one-shot remediation script — not the regular backfill.
 * The standard `scripts/backfill-experience.ts` only targets rows where
 * `minYearsExperience IS NULL AND newGradFriendly = false`; it won't
 * touch the misfires because their flags were already (wrongly) set.
 *
 * Usage:
 *   npx tsx scripts/reclassify-new-grad-misfires.ts --env=prod          # dry-run
 *   npx tsx scripts/reclassify-new-grad-misfires.ts --env=prod --apply  # commit
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
    const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
    if (flag === 'dev' || flag === 'prod') return flag;
    if (process.argv.includes('--dev')) return 'dev';
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

// Use require() (not import) for prisma so DATABASE_URL is set before
// the client constructs. ESM/TS imports hoist above the dotenv call.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
import { deriveExperienceLabel } from '@/lib/experience-label';
import { inferExperience } from '@/lib/experience-inference';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 200;

async function main(): Promise<void> {
    console.error(`[reclassify-new-grad] env=${ENV} apply=${APPLY}`);

    // Pull rows that were tagged new-grad-friendly (legacy enum OR
    // current flag) but whose body indicates an explicit experience
    // floor. The hardened `inferExperience` returns the downgraded
    // classification for these.
    const targets = await prisma.job.findMany({
        where: {
            OR: [
                { experienceLevel: { equals: 'New Grad', mode: 'insensitive' } },
                { newGradFriendly: true },
            ],
        },
        select: {
            id: true,
            employer: true,
            title: true,
            experienceLevel: true,
            description: true,
            minYearsExperience: true,
            newGradFriendly: true,
            experienceLabel: true,
        },
    });
    console.error(`[reclassify-new-grad] candidates: ${targets.length}`);

    interface Change {
        id: string;
        employer: string;
        title: string;
        before: { min: number | null; newGrad: boolean; label: string | null };
        after: { min: number | null; max: number | null; newGrad: boolean; label: string | null };
        source: string;
    }
    const changes: Change[] = [];

    for (const job of targets) {
        const inferred = inferExperience({
            experienceLevel: job.experienceLevel,
            description: job.description ?? '',
        });
        if (!inferred) continue;
        if (!inferred.source.startsWith('legacy:new grad->text:')) continue;

        const label = deriveExperienceLabel(inferred);
        changes.push({
            id: job.id,
            employer: job.employer,
            title: job.title,
            before: {
                min: job.minYearsExperience,
                newGrad: job.newGradFriendly,
                label: job.experienceLabel,
            },
            after: {
                min: inferred.minYearsExperience,
                max: inferred.maxYearsExperience,
                newGrad: inferred.newGradFriendly,
                label,
            },
            source: inferred.source,
        });
    }

    console.error(`[reclassify-new-grad] will-update: ${changes.length}`);
    console.log('id,employer,title,beforeMin,beforeNewGrad,beforeLabel,afterMin,afterMax,afterNewGrad,afterLabel,source');
    for (const c of changes) {
        const esc = (s: string): string => `"${s.replace(/"/g, '""')}"`;
        console.log(
            [
                c.id,
                esc(c.employer),
                esc(c.title),
                c.before.min ?? '',
                c.before.newGrad,
                esc(c.before.label ?? ''),
                c.after.min ?? '',
                c.after.max ?? '',
                c.after.newGrad,
                esc(c.after.label ?? ''),
                esc(c.source),
            ].join(','),
        );
    }

    if (!APPLY) {
        console.error('[reclassify-new-grad] dry-run — pass --apply to commit');
        return;
    }

    let written = 0;
    let failed = 0;
    for (let i = 0; i < changes.length; i += BATCH_SIZE) {
        const batch = changes.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map((c) =>
                prisma.job.update({
                    where: { id: c.id },
                    data: {
                        minYearsExperience: c.after.min,
                        maxYearsExperience: c.after.max,
                        newGradFriendly: c.after.newGrad,
                        experienceLabel: c.after.label,
                    },
                }),
            ),
        );
        for (let j = 0; j < results.length; j += 1) {
            const r = results[j];
            if (r.status === 'fulfilled') {
                written += 1;
            } else {
                failed += 1;
                console.error(
                    `[reclassify-new-grad] update failed id=${batch[j].id}:`,
                    r.reason instanceof Error ? r.reason.message : r.reason,
                );
            }
        }
        console.error(`[reclassify-new-grad] progress ${written + failed}/${changes.length}`);
    }
    console.error(`[reclassify-new-grad] done. written=${written} failed=${failed}`);
}

main()
    .catch((err) => {
        console.error('[reclassify-new-grad] fatal', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
