/**
 * Audit thin / stale / Google-Jobs-rejection-risk postings.
 *
 * Catches the kinds of issues the live SEO audit found on Job 5 (1-sentence
 * boilerplate description, validThrough already 6 days from now). Read-only —
 * outputs a punch list with job IDs, titles, and the specific failure reason
 * so a human can decide whether to unpublish, re-enrich, or leave.
 *
 * Failure categories:
 *   THIN_DESCRIPTION  — description text < 200 chars (Google JobPosting
 *                       quality bar; ~1-2 sentences fails it).
 *   BOILERPLATE       — description matches known low-effort patterns like
 *                       "Join to apply" / "Apply now to" with no real prose.
 *   IMMINENT_EXPIRY   — expiresAt < 14 days from now AND originalPostedAt
 *                       was set tightly (i.e. expiresAt - originalPostedAt
 *                       < 30 days). Google de-indexes near-expired postings
 *                       quickly; a too-tight window wastes ingest cost.
 *   MISSING_LOCATION  — non-remote job with no city AND no stateCode AND
 *                       no state. Schema can't satisfy `jobLocation`.
 *   STALE_EXPIRY      — expiresAt < now (already expired but still
 *                       isPublished — should have been unpublished by cron).
 *
 * Usage:
 *   npm run audit:thin              → prod (default — most useful)
 *   npm run audit:thin:dev          → local dev DB
 *   npm run audit:thin -- --csv > thin.csv
 */
import { config as dotenvConfig } from 'dotenv';

// ─── env selection (mirrors scripts/check-schema.ts pattern) ────────────────

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
    const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
    if (flag === 'dev' || flag === 'prod') return flag;
    if (process.argv.includes('--dev')) return 'dev';
    if (process.argv.includes('--prod')) return 'prod';
    return 'prod'; // safe default — the dev DB usually has stale fixture data
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

// Lazy import after env is loaded so prisma reads the right DATABASE_URL.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

const CSV_OUTPUT = process.argv.includes('--csv');

const BOILERPLATE_PATTERNS: RegExp[] = [
    /^join\s+to\s+apply/i,
    /^apply\s+now\s+to/i,
    /^we\s+are\s+seeking/i, // also flag — but only if very short
];

interface Finding {
    id: string;
    title: string;
    employer: string;
    category: string;
    detail: string;
}

async function main() {
    console.log(`[audit-thin] env=${ENV}`);
    const now = new Date();
    const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            title: true,
            employer: true,
            description: true,
            descriptionSummary: true,
            originalPostedAt: true,
            expiresAt: true,
            city: true,
            state: true,
            stateCode: true,
            isRemote: true,
        },
    });

    const findings: Finding[] = [];

    for (const job of jobs) {
        const desc = (job.description || '').trim();
        const employer = job.employer || '(unknown)';

        // STALE_EXPIRY — published but already expired
        if (job.expiresAt && job.expiresAt < now) {
            findings.push({
                id: job.id,
                title: job.title,
                employer,
                category: 'STALE_EXPIRY',
                detail: `expiresAt=${job.expiresAt.toISOString().slice(0, 10)} (past)`,
            });
            continue; // don't double-flag
        }

        // THIN_DESCRIPTION
        if (desc.length < 200) {
            findings.push({
                id: job.id,
                title: job.title,
                employer,
                category: 'THIN_DESCRIPTION',
                detail: `${desc.length} chars`,
            });
        }

        // BOILERPLATE — short AND matches a known low-quality opener
        if (desc.length < 400 && BOILERPLATE_PATTERNS.some((p) => p.test(desc))) {
            findings.push({
                id: job.id,
                title: job.title,
                employer,
                category: 'BOILERPLATE',
                detail: desc.slice(0, 80).replace(/\s+/g, ' '),
            });
        }

        // IMMINENT_EXPIRY — narrow validThrough window
        if (
            job.expiresAt
            && job.expiresAt < fourteenDaysOut
            && job.originalPostedAt
        ) {
            const windowDays =
                (job.expiresAt.getTime() - job.originalPostedAt.getTime())
                / (24 * 60 * 60 * 1000);
            if (windowDays < 30) {
                findings.push({
                    id: job.id,
                    title: job.title,
                    employer,
                    category: 'IMMINENT_EXPIRY',
                    detail:
                        `posted=${job.originalPostedAt.toISOString().slice(0, 10)} ` +
                        `expires=${job.expiresAt.toISOString().slice(0, 10)} ` +
                        `window=${Math.round(windowDays)}d`,
                });
            }
        }

        // MISSING_LOCATION — non-remote with no usable address fields
        if (!job.isRemote && !job.city && !job.state && !job.stateCode) {
            findings.push({
                id: job.id,
                title: job.title,
                employer,
                category: 'MISSING_LOCATION',
                detail: 'no city/state/stateCode',
            });
        }
    }

    if (CSV_OUTPUT) {
        // CSV header + rows on stdout
        console.log('id,category,title,employer,detail');
        for (const f of findings) {
            const safe = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
            console.log(`${f.id},${f.category},${safe(f.title)},${safe(f.employer)},${safe(f.detail)}`);
        }
        return;
    }

    // Pretty-print summary
    const byCategory = findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.category] = (acc[f.category] ?? 0) + 1;
        return acc;
    }, {});

    console.log(`[audit-thin] scanned ${jobs.length} published jobs`);
    console.log(`[audit-thin] findings: ${findings.length}`);
    for (const [cat, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${cat.padEnd(20)} ${n}`);
    }
    console.log('');
    console.log('First 20 examples:');
    for (const f of findings.slice(0, 20)) {
        console.log(`  [${f.category}] ${f.id}  ${f.title}`);
        console.log(`    ${f.employer}  —  ${f.detail}`);
    }
    if (findings.length > 20) {
        console.log(`  ... and ${findings.length - 20} more. Re-run with --csv > thin.csv for full list.`);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
