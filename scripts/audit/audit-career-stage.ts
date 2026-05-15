/**
 * Career-stage filter audit.
 *
 * For each of entry-level, mid-career, senior:
 *   - Counts matches using buildCategoryWhereClause (which already applies
 *     CATEGORY_FILTERS + CATEGORY_EXCLUSIONS + GLOBAL_EXCLUSIONS).
 *   - Samples 15 jobs (title, minYearsExperience, newGradFriendly).
 *
 * Cross-validation:
 *   - entry-level vs new-grad overlap (heavy overlap expected).
 *   - mid-career minYearsExperience distribution.
 *   - senior leakage: junior signals + EXCLUSIONS bleed-through.
 *
 * Read-only. Targets prod via .env.prod.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause, CATEGORY_EXCLUSIONS } from '@/lib/filters';
import { Prisma } from '@prisma/client';

interface JobSample {
    id: string;
    title: string;
    minYearsExperience: number | null;
    newGradFriendly: boolean | null;
}

const STAGES = ['entry-level', 'mid-career', 'senior'] as const;

// Detect once whether the experience columns exist in this database.
// Migration 20260514_add_experience_fields is unapplied in prod as of
// 2026-05-14 — gracefully degrade so the audit still produces counts +
// title samples on prod, and full chip stats on dev where the migration ran.
let experienceColumnsExist: boolean | null = null;
async function detectExperienceColumns(): Promise<boolean> {
    if (experienceColumnsExist !== null) return experienceColumnsExist;
    try {
        const rows = await prisma.$queryRaw<{ column_name: string }[]>`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'jobs'
              AND column_name IN ('min_years_experience', 'new_grad_friendly')
        `;
        experienceColumnsExist = rows.length === 2;
    } catch {
        experienceColumnsExist = false;
    }
    return experienceColumnsExist;
}

async function summarize(slug: string): Promise<{
    slug: string;
    count: number;
    avgMinYears: number | null;
    newGradPct: number;
    topTitles: string[];
    sample: JobSample[];
}> {
    const where = buildCategoryWhereClause(slug);
    const hasExp = await detectExperienceColumns();
    const count = await prisma.job.count({ where });

    const titleRows = (await prisma.job.findMany({
        where,
        select: { id: true, title: true },
        orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
        take: 15,
    })) as { id: string; title: string }[];

    let avgMinYears: number | null = null;
    let newGradPct = 0;
    let sample: JobSample[] = titleRows.map(r => ({
        id: r.id,
        title: r.title,
        minYearsExperience: null,
        newGradFriendly: null,
    }));

    if (hasExp) {
        const ids = titleRows.map(r => r.id);
        const expRows = await prisma.$queryRaw<{
            id: string;
            min_years_experience: number | null;
            new_grad_friendly: boolean | null;
        }[]>`
            SELECT id, min_years_experience, new_grad_friendly
            FROM "jobs"
            WHERE id = ANY(${ids}::text[])
        `;
        const expMap = new Map(expRows.map(r => [r.id, r]));
        sample = titleRows.map(r => {
            const e = expMap.get(r.id);
            return {
                id: r.id,
                title: r.title,
                minYearsExperience: e?.min_years_experience ?? null,
                newGradFriendly: e?.new_grad_friendly ?? null,
            };
        });

        const minYearsAgg = await prisma.job.aggregate({
            where: { ...where, minYearsExperience: { not: null } },
            _avg: { minYearsExperience: true },
        });
        avgMinYears = minYearsAgg._avg.minYearsExperience;

        const newGradCount = await prisma.job.count({
            where: { ...where, newGradFriendly: true },
        });
        newGradPct = count > 0 ? (newGradCount / count) * 100 : 0;
    }

    return {
        slug,
        count,
        avgMinYears,
        newGradPct,
        topTitles: sample.slice(0, 3).map(j => j.title),
        sample,
    };
}

async function overlapEntryVsNewGrad(): Promise<{
    both: number;
    entryOnly: number;
    newGradOnly: number;
}> {
    const entryWhere = buildCategoryWhereClause('entry-level');
    const newGradWhere = buildCategoryWhereClause('new-grad');

    const [entryIds, newGradIds] = await Promise.all([
        prisma.job.findMany({ where: entryWhere, select: { id: true } }),
        prisma.job.findMany({ where: newGradWhere, select: { id: true } }),
    ]);

    const entrySet = new Set(entryIds.map(r => r.id));
    const newGradSet = new Set(newGradIds.map(r => r.id));

    let both = 0;
    for (const id of entrySet) if (newGradSet.has(id)) both++;

    return {
        both,
        entryOnly: entrySet.size - both,
        newGradOnly: newGradSet.size - both,
    };
}

async function seniorLeakage(): Promise<{
    juniorByMinYears: { count: number; sampleTitle: string | null };
    juniorByNewGrad: { count: number; sampleTitle: string | null };
    exclusionsLeak: { count: number; sampleTitle: string | null };
    experienceFieldsAvailable: boolean;
}> {
    const seniorWhere = buildCategoryWhereClause('senior');
    const hasExp = await detectExperienceColumns();

    let juniorByMinYearsList: { title: string }[] = [];
    let juniorByNewGradList: { title: string }[] = [];

    if (hasExp) {
        juniorByMinYearsList = await prisma.job.findMany({
            where: { ...seniorWhere, minYearsExperience: { lte: 2, not: null } },
            select: { title: true },
            take: 5,
        });
        juniorByNewGradList = await prisma.job.findMany({
            where: { ...seniorWhere, newGradFriendly: true },
            select: { title: true },
            take: 5,
        });
    }

    // Exclusion bleed-through — apply the CATEGORY_FILTERS['senior'] OR
    // and check if any exclusion title patterns still survive.
    // CATEGORY_EXCLUSIONS['senior'] explicitly lists Nursing Director,
    // HR Director, IT Director, Finance Director, Rise Director, Non-Supervisory.
    const exclusionPatterns = [
        'Nursing Director',
        'HR Director',
        'IT Director',
        'Finance Director',
        'Rise Director',
    ];
    const exclusionOr: Prisma.JobWhereInput[] = exclusionPatterns.map(p => ({
        title: { contains: p, mode: 'insensitive' },
    }));

    const leakedList = await prisma.job.findMany({
        where: {
            AND: [seniorWhere, { OR: exclusionOr }],
        },
        select: { title: true },
        take: 5,
    });

    return {
        juniorByMinYears: {
            count: juniorByMinYearsList.length,
            sampleTitle: juniorByMinYearsList[0]?.title ?? null,
        },
        juniorByNewGrad: {
            count: juniorByNewGradList.length,
            sampleTitle: juniorByNewGradList[0]?.title ?? null,
        },
        exclusionsLeak: {
            count: leakedList.length,
            sampleTitle: leakedList[0]?.title ?? null,
        },
        experienceFieldsAvailable: hasExp,
    };
}

async function main(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('CAREER-STAGE FILTER AUDIT');
    console.log(`CATEGORY_EXCLUSIONS['senior'] = ${CATEGORY_EXCLUSIONS['senior']?.length ?? 0} rules`);
    console.log('═'.repeat(80));

    const summaries = await Promise.all(STAGES.map(s => summarize(s)));

    console.log('\n| Filter | Count | Avg minYears | newGradFriendly% | Top 3 sample titles |');
    console.log('|---|---|---|---|---|');
    for (const s of summaries) {
        const avg = s.avgMinYears !== null ? s.avgMinYears.toFixed(2) : 'n/a';
        const titles = s.topTitles.map(t => `"${t}"`).join(', ');
        console.log(`| ${s.slug} | ${s.count} | ${avg} | ${s.newGradPct.toFixed(1)}% | ${titles} |`);
    }

    // Print sample tables for transparency.
    for (const s of summaries) {
        console.log(`\n─── 15-row sample: ${s.slug} ───`);
        for (const j of s.sample) {
            const my = j.minYearsExperience ?? 'null';
            const ng = j.newGradFriendly === null ? 'null' : j.newGradFriendly ? 'YES' : 'no';
            console.log(`  minYears=${String(my).padEnd(4)} newGrad=${String(ng).padEnd(4)} | ${j.title}`);
        }
    }

    console.log('\n═'.repeat(80));
    console.log('ENTRY-LEVEL vs NEW-GRAD OVERLAP');
    console.log('═'.repeat(80));
    const overlap = await overlapEntryVsNewGrad();
    console.log('\n| Entry-level vs new-grad overlap | N matching both | N exclusive entry | N exclusive new-grad |');
    console.log('|---|---|---|---|');
    console.log(`| (counts) | ${overlap.both} | ${overlap.entryOnly} | ${overlap.newGradOnly} |`);

    console.log('\n═'.repeat(80));
    console.log('SENIOR LEAKAGE');
    console.log('═'.repeat(80));
    const leak = await seniorLeakage();
    console.log('\n| Senior leakage check | Count | Sample title |');
    console.log('|---|---|---|');
    const expNote = leak.experienceFieldsAvailable ? '' : ' (N/A — migration unapplied)';
    console.log(`| Jobs in 'senior' with minYears <= 2 | ${leak.experienceFieldsAvailable ? leak.juniorByMinYears.count : 'n/a'}${expNote} | "${leak.juniorByMinYears.sampleTitle ?? '—'}" |`);
    console.log(`| Jobs in 'senior' with newGradFriendly=true | ${leak.experienceFieldsAvailable ? leak.juniorByNewGrad.count : 'n/a'}${expNote} | "${leak.juniorByNewGrad.sampleTitle ?? '—'}" |`);
    console.log(`| Jobs in 'senior' matching EXCLUSIONS (should be 0) | ${leak.exclusionsLeak.count} | "${leak.exclusionsLeak.sampleTitle ?? '—'}" |`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
