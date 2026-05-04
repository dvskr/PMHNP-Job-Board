/**
 * Compare Layer 1 (deterministic narrative) vs Layer 2 (DB snippet) for a
 * given city. Use this to decide whether the LLM version is actually better
 * before approving it.
 *
 *   npx tsx scripts/diff-snippets.ts boston-ma                 # base city
 *   npx tsx scripts/diff-snippets.ts boston-ma va              # va × boston
 *   npx tsx scripts/diff-snippets.ts boston-ma --all-taxonomy  # base + every taxonomy
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

const ARGS = process.argv.slice(2);
const SLUG = ARGS.find((a) => !a.startsWith('--'));
const TAX_ARG = ARGS.filter((a) => !a.startsWith('--'))[1];
const ALL_TAX = ARGS.includes('--all-taxonomy');

if (!SLUG) {
    console.error('Usage: npx tsx scripts/diff-snippets.ts <city-slug> [taxonomy] [--all-taxonomy]');
    process.exit(1);
}

const TAXONOMY_LABELS = [
    'va', 'community-health', 'hospital', 'remote', 'telehealth', 'inpatient',
    'outpatient', 'travel', 'full-time', 'part-time', 'contract', 'addiction',
    'new-grad', '1099', 'behavioral-health', 'correctional', 'child-adolescent',
    'crisis', 'entry-level', 'geriatric', 'lgbtq', 'locum-tenens', 'mid-career',
    'per-diem', 'private-practice', 'senior', 'substance-abuse', 'veterans',
];

async function main() {
    const { CITIES, getCityBySlug } = await import('@/lib/pseo/city-data/cities');
    const { buildCityFacts, buildCityNarrative, buildTaxonomyCityNarrative } = await import('@/lib/pseo/city-narrative');
    const { prisma } = await import('@/lib/prisma');

    const city = getCityBySlug(SLUG!) ?? CITIES.find((c) => c.slug === SLUG);
    if (!city) {
        console.error(`City "${SLUG}" not found.`);
        process.exit(1);
    }
    const facts = buildCityFacts(city);

    // Look up active job count for the totalJobs param.
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            city: { equals: city.name, mode: 'insensitive' },
            stateCode: city.stateCode,
        },
    });

    function showPair(label: string, layer1: string, layer2: { body: string; approvedAt: Date | null } | null) {
        console.log(`\n${'═'.repeat(76)}`);
        console.log(label);
        console.log('═'.repeat(76));
        console.log(`\n— LAYER 1 (deterministic, what's live now if no Layer 2) —\n`);
        console.log(layer1);
        if (!layer2) {
            console.log(`\n— LAYER 2 (LLM-generated): not generated yet —`);
        } else {
            const status = layer2.approvedAt ? `APPROVED (live)` : `PENDING REVIEW (not rendered)`;
            console.log(`\n— LAYER 2 [${status}] —\n`);
            console.log(layer2.body);
        }
    }

    if (!TAX_ARG && !ALL_TAX) {
        // Base city only
        const layer1 = buildCityNarrative(facts, totalJobs);
        const layer2 = await prisma.citySnippet.findUnique({ where: { citySlug: SLUG! } });
        showPair(`/jobs/city/${SLUG}    [pop=${city.population.toLocaleString('en-US')}, jobs=${totalJobs}]`, layer1, layer2);
    } else if (TAX_ARG) {
        const layer1 = buildTaxonomyCityNarrative(facts, TAX_ARG, totalJobs);
        const layer2 = await prisma.categoryCitySnippet.findUnique({
            where: { categorySlug_citySlug: { categorySlug: TAX_ARG, citySlug: SLUG! } },
        });
        showPair(`/jobs/${TAX_ARG}/city/${SLUG}    [jobs=${totalJobs}]`, layer1, layer2);
    } else {
        // All taxonomies
        const layer1Base = buildCityNarrative(facts, totalJobs);
        const layer2Base = await prisma.citySnippet.findUnique({ where: { citySlug: SLUG! } });
        showPair(`/jobs/city/${SLUG}    (base city)`, layer1Base, layer2Base);

        for (const tax of TAXONOMY_LABELS) {
            const layer1 = buildTaxonomyCityNarrative(facts, tax, totalJobs);
            const layer2 = await prisma.categoryCitySnippet.findUnique({
                where: { categorySlug_citySlug: { categorySlug: tax, citySlug: SLUG! } },
            });
            showPair(`/jobs/${tax}/city/${SLUG}`, layer1, layer2);
        }
    }

    await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
