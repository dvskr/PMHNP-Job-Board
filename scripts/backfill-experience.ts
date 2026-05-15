/**
 * Backfill structured experience fields on existing Job rows.
 *
 * Why: Phase 0 of the UI refresh runbook adds minYearsExperience,
 * maxYearsExperience, newGradFriendly, and experienceLabel to the Job
 * model. New writes populate them, but ~tens of thousands of existing
 * rows (aggregated + legacy employer-posted) have only the free-text
 * `experienceLevel` and the description body to go on.
 *
 * Strategy (regex first, LLM never — keep this script free + fast):
 *   1. Map the legacy three-bucket `experienceLevel` to structured fields:
 *        "New Grad"     → min=0, newGrad=true
 *        "Mid-Level"    → min=2, max=5
 *        "Senior"       → min=5
 *      Confidence: high — the values were enums in the original UI.
 *
 *   2. Mine the description for patterns:
 *        "new grad/new graduate/entry-level/0 years"   → newGrad=true, min=0
 *        "X+ years" / "X plus years" / "minimum X yr"  → min=X (snapped)
 *        "X-Y years" / "X to Y years"                  → min=X, max=Y
 *      Confidence: medium — false positives possible ("5 years of …").
 *
 *   3. Derive experienceLabel via lib/experience-label.ts so the UI
 *      sees the same string the post-job form would produce.
 *
 * Output: a CSV of (id, employer, title, before, after, confidence)
 * to stdout. Dry-run by default; --apply commits the writes in batches.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register --project scripts/tsconfig.json scripts/backfill-experience.ts --env=dev
 *   npx ts-node -r tsconfig-paths/register --project scripts/tsconfig.json scripts/backfill-experience.ts --env=prod --apply
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
    const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
    if (flag === 'dev' || flag === 'prod') return flag;
    if (process.argv.includes('--dev')) return 'dev';
    if (process.argv.includes('--prod')) return 'prod';
    return 'prod';
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
import { deriveExperienceLabel } from '@/lib/experience-label';
import {
    inferExperience,
    type InferredExperience,
    type ExperienceConfidence,
} from '@/lib/experience-inference';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 200;

interface Row {
    id: string;
    employer: string;
    title: string;
    inferred: InferredExperience;
    label: string | null;
}

async function main() {
    console.error(`[backfill-experience] env=${ENV} apply=${APPLY}`);

    const targets = await prisma.job.findMany({
        where: {
            minYearsExperience: null,
            newGradFriendly: false,
        },
        select: { id: true, employer: true, title: true, experienceLevel: true, description: true },
    });
    console.error(`[backfill-experience] candidates: ${targets.length}`);

    const rows: Row[] = [];
    let unclassified = 0;
    for (const job of targets) {
        const inferred = inferExperience(job);
        if (!inferred) {
            unclassified += 1;
            continue;
        }
        const label = deriveExperienceLabel(inferred);
        rows.push({ id: job.id, employer: job.employer, title: job.title, inferred, label });
    }

    // CSV to stdout for review.
    console.log('id,employer,title,min,max,newGrad,label,confidence,source');
    for (const r of rows) {
        const csvEscape = (s: string) => `"${s.replace(/"/g, '""')}"`;
        console.log(
            [
                r.id,
                csvEscape(r.employer),
                csvEscape(r.title),
                r.inferred.minYearsExperience ?? '',
                r.inferred.maxYearsExperience ?? '',
                r.inferred.newGradFriendly,
                csvEscape(r.label ?? ''),
                r.inferred.confidence,
                csvEscape(r.inferred.source),
            ].join(','),
        );
    }

    const byConfidence = rows.reduce<Record<ExperienceConfidence, number>>(
        (acc, r) => {
            acc[r.inferred.confidence] += 1;
            return acc;
        },
        { high: 0, medium: 0, low: 0 },
    );
    console.error(`[backfill-experience] classified=${rows.length} unclassified=${unclassified}`);
    console.error(`[backfill-experience] by confidence: high=${byConfidence.high} medium=${byConfidence.medium} low=${byConfidence.low}`);

    if (!APPLY) {
        console.error('[backfill-experience] dry-run — pass --apply to commit');
        return;
    }

    // Each row is independent — we don't need transactional atomicity, and
    // a single 200-row $transaction was hitting Prisma's 5s default timeout
    // (P2028) on prod against a remote DB. Parallel Promise.all per batch
    // is faster AND removes the timeout class. Per-row failures get counted
    // and logged but don't abort the rest of the batch.
    let written = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map((r) =>
                prisma.job.update({
                    where: { id: r.id },
                    data: {
                        minYearsExperience: r.inferred.minYearsExperience,
                        maxYearsExperience: r.inferred.maxYearsExperience,
                        newGradFriendly: r.inferred.newGradFriendly,
                        experienceLabel: r.label,
                    },
                }),
            ),
        );
        for (let j = 0; j < results.length; j += 1) {
            const result = results[j];
            if (result.status === 'fulfilled') {
                written += 1;
            } else {
                failed += 1;
                console.error(`[backfill-experience] update failed id=${batch[j].id}:`, result.reason instanceof Error ? result.reason.message : result.reason);
            }
        }
        console.error(`[backfill-experience] progress ${written + failed}/${rows.length} (written=${written} failed=${failed})`);
    }
    console.error(`[backfill-experience] done. written=${written} failed=${failed}`);
}

main()
    .catch((err) => {
        console.error('[backfill-experience] fatal', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
