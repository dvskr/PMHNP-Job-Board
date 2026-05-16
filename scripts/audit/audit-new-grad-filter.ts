/**
 * Audit the unified new-grad filter.
 *
 * Confirms the three surfaces agree:
 *   1. /jobs?newGrad=1            → buildWhereClause({ ...DEFAULT_FILTERS, newGradFriendly: true })
 *   2. /jobs/new-grad             → buildCategoryWhereClause('new-grad')
 *   3. /api/jobs/filter-counts    → newGradMatchClause built inline (mirrors #1)
 *
 * The live pages do NOT apply an additional freshness gate — they rely on
 * `isPublished: true` + GLOBAL_EXCLUSIONS only. So this audit mirrors that.
 *
 * Run: npx tsx scripts/audit/audit-new-grad-filter.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
    buildWhereClause,
    buildCategoryWhereClause,
    CATEGORY_FILTERS,
    CATEGORY_EXCLUSIONS,
} from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

type Verdict = 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'AMBIGUOUS';

interface SampleRow {
    id: string;
    slug: string | null;
    title: string;
    experienceLabel: string | null;
    newGradFriendly: boolean | null;
    minYearsExperience: number | null;
    verdict: Verdict;
    reason: string;
}

const NEW_GRAD_KEYWORDS = [
    'new grad',
    'new graduate',
    'entry level',
    'entry-level',
    'fellowship',
    'residency',
    'recent graduate',
    'training program',
];

const SENIOR_KEYWORDS = [
    'senior',
    'lead ',
    'director',
    'supervisor',
    'manager',
    'chief',
    'experienced',
    'vp ',
    'principal',
];

function classify(job: {
    title: string;
    newGradFriendly: boolean | null;
    minYearsExperience: number | null;
}): { verdict: Verdict; reason: string } {
    const t = job.title.toLowerCase();
    const hasNewGradKw = NEW_GRAD_KEYWORDS.some((kw) => t.includes(kw));
    const hasSeniorKw = SENIOR_KEYWORDS.some((kw) => t.includes(kw));

    // Strong false positive: title screams senior/exp AND minYears >= 2
    if (hasSeniorKw && (job.minYearsExperience ?? 0) >= 2) {
        return {
            verdict: 'FALSE_POSITIVE',
            reason: `senior-keyword title + minYears=${job.minYearsExperience}`,
        };
    }
    if ((job.minYearsExperience ?? 0) >= 3) {
        return {
            verdict: 'FALSE_POSITIVE',
            reason: `minYears=${job.minYearsExperience} (>=3 = experienced)`,
        };
    }
    // Strong true positive: explicit flag or new-grad keyword in title
    if (job.newGradFriendly === true) {
        return { verdict: 'TRUE_POSITIVE', reason: 'newGradFriendly=true' };
    }
    if (hasNewGradKw) {
        return { verdict: 'TRUE_POSITIVE', reason: 'title matches new-grad keyword' };
    }
    // Senior keyword in title but minYears low — still suspicious
    if (hasSeniorKw) {
        return { verdict: 'FALSE_POSITIVE', reason: 'senior-keyword title' };
    }
    return { verdict: 'AMBIGUOUS', reason: 'no strong signal either way' };
}

function md(rows: string[][], header: string[]): string {
    const sep = header.map(() => '---');
    const all = [header, sep, ...rows];
    return all.map((r) => `| ${r.join(' | ')} |`).join('\n');
}

async function main(): Promise<void> {
    // ── Surface 1: /jobs?newGrad=1 (buildWhereClause) ──────────────────────
    const whereCheckbox = buildWhereClause({
        ...DEFAULT_FILTERS,
        newGradFriendly: true,
    });
    const countCheckbox = await prisma.job.count({ where: whereCheckbox });

    // ── Surface 2: /jobs/new-grad (buildCategoryWhereClause) ───────────────
    const whereCategory = buildCategoryWhereClause('new-grad');
    const countCategory = await prisma.job.count({ where: whereCategory });

    // ── Surface 3: /api/jobs/filter-counts.newGradCount ────────────────────
    // Reconstruct the exact clause shape used in route.ts so we audit the
    // same SQL the badge produces.
    const newGradOrClauses: Prisma.JobWhereInput[] = [
        { newGradFriendly: true },
        ...(CATEGORY_FILTERS['new-grad'] ?? []),
    ];
    const newGradNotClauses: Prisma.JobWhereInput[] = (
        CATEGORY_EXCLUSIONS['new-grad'] ?? []
    ).map((ex) => ({ NOT: ex }));
    const newGradMatchClause: Prisma.JobWhereInput = {
        AND: [{ OR: newGradOrClauses }, ...newGradNotClauses],
    };
    // The badge applies the unified clause AGAINST the base (filters with
    // newGradFriendly stripped). With DEFAULT_FILTERS that base equals
    // buildWhereClause({...DEFAULT_FILTERS, newGradFriendly: null}).
    const newGradBase = buildWhereClause({
        ...DEFAULT_FILTERS,
        newGradFriendly: null,
    });
    const countFilterCountsApi = await prisma.job.count({
        where: { AND: [newGradBase, newGradMatchClause] },
    });

    // ── Sample 20 from the checkbox surface for verdict classification ────
    const sampleRaw = await prisma.job.findMany({
        where: whereCheckbox,
        select: {
            id: true,
            slug: true,
            title: true,
            experienceLabel: true,
            newGradFriendly: true,
            minYearsExperience: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    const samples: SampleRow[] = sampleRaw.map((j) => {
        const { verdict, reason } = classify(j);
        return { ...j, verdict, reason };
    });

    // ── Edge-case probes ──────────────────────────────────────────────────
    const edgeCases = await Promise.all([
        prisma.job.findMany({
            where: {
                AND: [
                    whereCheckbox,
                    { title: { contains: 'residency', mode: 'insensitive' } },
                ],
            },
            select: { slug: true, title: true },
            take: 3,
        }),
        prisma.job.findMany({
            where: {
                AND: [
                    whereCheckbox,
                    { title: { contains: 'senior', mode: 'insensitive' } },
                    { newGradFriendly: true },
                ],
            },
            select: { slug: true, title: true, newGradFriendly: true, minYearsExperience: true },
            take: 5,
        }),
        prisma.job.findMany({
            where: {
                AND: [
                    whereCheckbox,
                    { title: { contains: 'wichita', mode: 'insensitive' } },
                ],
            },
            select: { slug: true, title: true, newGradFriendly: true, minYearsExperience: true },
            take: 5,
        }),
    ]);
    const [residencyHits, seniorFlagged, wichitaHits] = edgeCases;

    // ── False-positive aggregate (across full set, not just sample 20) ────
    const fpHard = await prisma.job.count({
        where: {
            AND: [
                whereCheckbox,
                { minYearsExperience: { gte: 3 } },
            ],
        },
    });
    const fpSeniorTitle = await prisma.job.count({
        where: {
            AND: [
                whereCheckbox,
                {
                    OR: [
                        { title: { contains: 'senior', mode: 'insensitive' } },
                        { title: { contains: 'lead PMHNP', mode: 'insensitive' } },
                        { title: { contains: 'supervisor', mode: 'insensitive' } },
                        { title: { contains: 'manager', mode: 'insensitive' } },
                        { title: { contains: 'chief', mode: 'insensitive' } },
                    ],
                },
            ],
        },
    });

    // ── Report ────────────────────────────────────────────────────────────
    console.log('# New-Grad Filter Audit');
    console.log('');
    console.log(
        md(
            [
                ['?newGrad=1 (buildWhereClause)', String(countCheckbox)],
                ['/jobs/new-grad (buildCategoryWhereClause)', String(countCategory)],
                ['/api/jobs/filter-counts.newGradCount', String(countFilterCountsApi)],
            ],
            ['Surface', 'Count'],
        ),
    );
    console.log('');

    console.log(
        md(
            samples.map((s) => [
                s.slug ?? s.id,
                s.title.length > 60 ? s.title.slice(0, 57) + '...' : s.title,
                String(s.newGradFriendly ?? 'null'),
                String(s.minYearsExperience ?? 'null'),
                `${s.verdict} (${s.reason})`,
            ]),
            ['Sample slug', 'Title', 'newGradFriendly', 'minYears', 'Verdict'],
        ),
    );
    console.log('');

    const sampleFp = samples.filter((s) => s.verdict === 'FALSE_POSITIVE').length;
    const disagreement =
        Math.max(countCheckbox, countCategory, countFilterCountsApi) -
        Math.min(countCheckbox, countCategory, countFilterCountsApi);

    console.log(
        md(
            [
                [
                    'Sample false positives',
                    `${sampleFp}/20`,
                    'classified via senior-keyword + minYears>=2 heuristic',
                ],
                [
                    'Hard FP (minYears>=3) across full set',
                    String(fpHard),
                    'jobs requiring 3+ years that still match',
                ],
                [
                    'Senior-title FP across full set',
                    String(fpSeniorTitle),
                    'titles containing senior/lead/supervisor/manager/chief',
                ],
                [
                    'Disagreement between surfaces (max-min)',
                    String(disagreement),
                    disagreement === 0 ? 'all three surfaces agree' : 'investigate',
                ],
            ],
            ['Mismatches', 'Count', 'Note'],
        ),
    );
    console.log('');

    console.log('## Edge-case probes');
    console.log('');
    console.log(`- "residency" title hits (must match): ${residencyHits.length}`);
    residencyHits.forEach((j) => console.log(`    • ${j.slug ?? '(no slug)'} — ${j.title}`));
    console.log(`- "senior" + newGradFriendly=true (legacy mis-flag): ${seniorFlagged.length}`);
    seniorFlagged.forEach((j) =>
        console.log(
            `    • ${j.slug ?? '(no slug)'} — ${j.title}  [flag=${j.newGradFriendly}, minY=${j.minYearsExperience}]`,
        ),
    );
    console.log(`- "Wichita" title leak probe: ${wichitaHits.length}`);
    wichitaHits.forEach((j) =>
        console.log(
            `    • ${j.slug ?? '(no slug)'} — ${j.title}  [flag=${j.newGradFriendly}, minY=${j.minYearsExperience}]`,
        ),
    );
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
