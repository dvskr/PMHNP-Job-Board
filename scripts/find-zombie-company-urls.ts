/**
 * GSC Indexing Crisis (P2.4): identify "zombie" company URLs.
 *
 * Background: a pre-Mar-19 sitemap generated company slugs from `Job.employer`
 * via regex (e.g. "Bee Better Health" → "bee-better-health"), but the actual
 * page route uses Company.normalizedName from the companies table. When the
 * two don't match (or no Company row exists), the URL 404s. Many of these
 * are still in Google's index from the pre-fix sitemap submissions.
 *
 * This script:
 *   1. Pulls every distinct Job.employer string
 *   2. Generates the regex-derived slug for each (the slug pattern Google has
 *      cached from old sitemaps)
 *   3. Cross-references against Company.normalizedName
 *   4. Any employer whose slug doesn't match a Company gets enqueued in
 *      deindex_queue as 'gsc-zombie-company' so the historical-deindex cron
 *      can submit URL_DELETED
 *
 * Run:
 *   npx tsx scripts/find-zombie-company-urls.ts
 *   npx tsx scripts/find-zombie-company-urls.ts --dry-run
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });

const DRY_RUN = process.argv.includes('--dry-run');
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

// Mirrors the pre-fix slug generator. Anything that didn't go through
// Company.normalizedName ended up here.
function slugifyEmployer(employer: string): string {
    return employer
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

async function main() {
    const prisma = await getPrisma();
    // 1. All distinct employer strings on currently published jobs +
    //    everything ever published (to catch employers no longer hiring).
    const employerRows = await prisma.job.findMany({
        select: { employer: true },
        distinct: ['employer'],
        where: { employer: { not: '' } },
    });
    const employers = employerRows.map((r) => r.employer).filter(Boolean);
    console.log(`Found ${employers.length} distinct employer strings.`);

    // 2. All Company.normalizedName values.
    const companies = await prisma.company.findMany({
        select: { normalizedName: true },
    });
    const normalizedNames = new Set(companies.map((c) => c.normalizedName.toLowerCase()));
    console.log(`Found ${companies.length} Company rows with normalized names.`);

    // 3. Build candidate URLs from regex-slugified employers that don't match.
    const zombieUrls = new Set<string>();
    for (const employer of employers) {
        const slug = slugifyEmployer(employer);
        if (!slug) continue;

        // If the slugified employer equals a normalizedName, the URL would resolve.
        // Also check the encoded (space-preserving) form — Company.normalizedName
        // sometimes stores spaces, which the page route handles via decodeURIComponent.
        const lowerEmployer = employer.toLowerCase();
        if (normalizedNames.has(slug)) continue;
        if (normalizedNames.has(lowerEmployer)) continue;

        // This URL would 404. Add it to the dead pile.
        zombieUrls.add(`${BASE_URL}/companies/${slug}`);
        // The encoded-space variant Google may also have indexed.
        if (lowerEmployer !== slug) {
            zombieUrls.add(`${BASE_URL}/companies/${encodeURIComponent(lowerEmployer)}`);
        }
    }

    console.log(`\n${zombieUrls.size} candidate zombie URLs identified.`);
    if (DRY_RUN) {
        let i = 0;
        for (const url of zombieUrls) {
            console.log(`  ${url}`);
            if (++i >= 30) {
                console.log(`  ... (${zombieUrls.size - 30} more)`);
                break;
            }
        }
        return;
    }

    let inserted = 0;
    for (const url of zombieUrls) {
        try {
            await prisma.deindexQueue.upsert({
                where: { url },
                update: {},
                create: { url, source: 'zombie-company' },
            });
            inserted++;
        } catch (err) {
            console.error(`  upsert failed for ${url}:`, err);
        }
        if (inserted % 200 === 0) console.log(`  ...inserted ${inserted}/${zombieUrls.size}`);
    }
    console.log(`\nDone. Upserted ${inserted} zombie company URLs into deindex_queue.`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        if (prismaCache) await prismaCache.$disconnect();
    });
