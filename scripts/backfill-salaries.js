/**
 * Backfill Salaries Script
 * Re-extracts salary from job descriptions for published jobs that have $ in their
 * description but no salary data. Uses the improved extractSalary patterns.
 * 
 * Usage: npx tsx --require ./scripts/env-preload.js scripts/backfill-salaries.js
 * 
 * Pass --dry-run to preview without writing (default)
 * Pass --apply to actually update the database
 */

require('dotenv').config({ path: '.env.local' });
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const { extractSalary, validateAndNormalizeSalary } = require(path.join(projectRoot, 'lib', 'job-normalizer'));
const { normalizeSalary } = require(path.join(projectRoot, 'lib', 'salary-normalizer'));
const { formatDisplaySalary } = require(path.join(projectRoot, 'lib', 'salary-display'));

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dryRun = !process.argv.includes('--apply');

async function main() {
    console.log(`=== Salary Backfill ${dryRun ? '(DRY RUN)' : '(APPLYING)'} ===\n`);

    // Get all published jobs with $ in description but no salary
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            minSalary: null,
            displaySalary: null,
            description: { contains: '$' },
        },
        select: {
            id: true,
            title: true,
            employer: true,
            description: true,
            sourceProvider: true,
        },
    });

    console.log(`Found ${jobs.length} jobs with $ in description but no salary\n`);

    let extracted = 0;
    let skippedInvalid = 0;
    let noMatch = 0;

    for (const job of jobs) {
        const fullText = `${job.title} ${job.description}`;
        const result = extractSalary(fullText);

        if (!result.min && !result.max) {
            noMatch++;
            continue;
        }

        // Validate
        const validated = validateAndNormalizeSalary(
            result.min,
            result.max,
            fullText,
            job.title,
            result.period
        );

        if (!validated.minSalary && !validated.maxSalary) {
            skippedInvalid++;
            continue;
        }

        // Normalize to annual for normalized columns
        const normalized = normalizeSalary({
            minSalary: validated.minSalary,
            maxSalary: validated.maxSalary,
            salaryPeriod: validated.salaryPeriod,
            title: job.title,
        });

        // Format display salary
        const displaySalary = formatDisplaySalary(
            validated.minSalary,
            validated.maxSalary,
            validated.salaryPeriod
        );

        console.log(
            `  [${job.sourceProvider}] "${job.title}" @ ${job.employer}` +
            `\n    → ${displaySalary} (${validated.salaryPeriod})` +
            `\n    → Annual: $${normalized.normalizedMinSalary?.toLocaleString() || '?'} - $${normalized.normalizedMaxSalary?.toLocaleString() || '?'}`
        );

        if (!dryRun) {
            await prisma.job.update({
                where: { id: job.id },
                data: {
                    minSalary: validated.minSalary,
                    maxSalary: validated.maxSalary,
                    salaryPeriod: validated.salaryPeriod,
                    displaySalary,
                    normalizedMinSalary: normalized.normalizedMinSalary,
                    normalizedMaxSalary: normalized.normalizedMaxSalary,
                    salaryIsEstimated: normalized.salaryIsEstimated,
                },
            });
        }

        extracted++;
    }

    console.log(`\n=== Summary ${dryRun ? '(DRY RUN)' : '(APPLIED)'} ===`);
    console.log(`  Processed:       ${jobs.length}`);
    console.log(`  Salary extracted: ${extracted}`);
    console.log(`  No match:         ${noMatch}`);
    console.log(`  Invalid/rejected: ${skippedInvalid}`);

    if (dryRun && extracted > 0) {
        console.log(`\nRun with --apply to update the database`);
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
