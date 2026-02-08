
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const SOURCES = ['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble', 'jsearch'];

async function inspectAllSourcesRaw() {
    console.log('🔍 Starting Job Source Validation (SQL-based)...\n');
    console.log('Criteria: Title OR Description must contain at least one PMHNP keyword.');
    console.log('----------------------------------------------------------------\n');

    const results = [];

    // SQL Regex Pattern for PMHNP keywords
    const regexPattern = 'pmhnp|psychiatric nurse|psych np|mental health nurse practitioner|psychiatric mental health|psych mental health|psychiatric aprn|pmhnp-bc|psychiatric prescriber|behavioral health nurse practitioner|behavioral health np|psych nurse practitioner';

    for (const source of SOURCES) {
        process.stdout.write(`Checking ${source}... `);

        try {
            // Count Total
            const totalCount: any = await prisma.$queryRaw`
                SELECT COUNT(*)::int as count FROM jobs 
                WHERE source_provider = ${source} AND is_published = true
            `;
            const total = totalCount[0].count;

            if (total === 0) {
                console.log(`(No jobs found)`);
                results.push({ source, total: 0, invalid: 0, rate: 'N/A' });
                continue;
            }

            // Count Invalid (NOT matching regex)
            const invalidCountRes: any = await prisma.$queryRaw`
                SELECT COUNT(*)::int as count FROM jobs 
                WHERE source_provider = ${source} AND is_published = true
                AND NOT (
                    title ~* ${regexPattern} 
                    OR 
                    description ~* ${regexPattern}
                )
            `;
            const invalidCount = invalidCountRes[0].count;
            const invalidRate = ((invalidCount / total) * 100).toFixed(1);

            console.log(`Done. ${invalidCount}/${total} Invalid (${invalidRate}%)`);

            // Fetch Samples
            const samples: any = await prisma.$queryRaw`
                SELECT title, employer, LEFT(description, 100) as snippet 
                FROM jobs 
                WHERE source_provider = ${source} AND is_published = true
                AND NOT (
                    title ~* ${regexPattern} 
                    OR 
                    description ~* ${regexPattern}
                )
                LIMIT 3
            `;

            results.push({
                source,
                total,
                invalid: invalidCount,
                rate: `${invalidRate}%`,
                samples
            });

        } catch (err: any) {
            console.log('Error!');
            console.error(`Error checking ${source}:`, err.message);
        }
    }

    console.log('\n================ SUMMARY ================');
    console.table(results.map(r => ({
        Source: r.source,
        Total: r.total,
        Invalid: r.invalid,
        'Invalid %': r.rate
    })));

    console.log('\n================ SAMPLES OF INVALID JOBS (Up to 3 per source) ================');

    results.filter(r => r.invalid > 0).forEach(r => {
        if (r.samples && r.samples.length > 0) {
            console.log(`\n--- ${r.source.toUpperCase()} (${r.rate} Invalid) ---`);
            r.samples.forEach((job: any, i: number) => {
                console.log(`${i + 1}. [${job.title}] @ ${job.employer}`);
                console.log(`   Snippet: "${job.snippet}..."`);
            });
        }
    });

    await prisma.$disconnect();
}

inspectAllSourcesRaw().catch(e => {
    console.error(e);
    process.exit(1);
});
