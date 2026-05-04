/**
 * Preview the deterministic narrative output for a few sample cities so you
 * can eyeball what users / Googlebot will see on the live page.
 *
 *   npx tsx scripts/preview-narrative.ts
 *   npx tsx scripts/preview-narrative.ts boston-ma
 *   npx tsx scripts/preview-narrative.ts boston-ma va
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

async function main() {
    const { CITIES, getCityBySlug } = await import('@/lib/pseo/city-data/cities');
    const { buildCityFacts, buildCityNarrative, buildTaxonomyCityNarrative } = await import('@/lib/pseo/city-narrative');

    const slug = process.argv[2];
    const taxonomy = process.argv[3];

    let samples: { slug: string; jobs: number }[];
    if (slug) {
        samples = [{ slug, jobs: 14 }];
    } else {
        // Default: a spread of population tiers and shortage statuses
        samples = [
            { slug: 'boston-ma', jobs: 14 },
            { slug: 'phoenix-az', jobs: 22 },
            { slug: 'charleston-wv', jobs: 4 },
            { slug: 'austin-tx', jobs: 18 },
            { slug: 'st-louis-mo', jobs: 9 },
        ];
    }

    for (const s of samples) {
        const city = getCityBySlug(s.slug) ?? CITIES.find((c) => c.slug === s.slug);
        if (!city) {
            console.log(`\n✗ City "${s.slug}" not found in CITIES dataset`);
            continue;
        }
        const facts = buildCityFacts(city);

        console.log(`\n${'═'.repeat(76)}`);
        console.log(`SLUG: ${s.slug}  |  jobs=${s.jobs}  |  pop=${city.population.toLocaleString('en-US')}  |  COL=${city.costOfLivingIndex}  |  HPSA=${facts.shortage}  |  authority=${facts.practiceAuthority ?? 'unknown'}`);
        console.log(`${'═'.repeat(76)}`);

        if (taxonomy) {
            console.log(`\n[/jobs/${taxonomy}/city/${s.slug}]`);
            console.log(buildTaxonomyCityNarrative(facts, taxonomy, s.jobs));
        } else {
            console.log(`\n[/jobs/city/${s.slug}]  (base city page)`);
            console.log(buildCityNarrative(facts, s.jobs));

            // Sample two taxonomies to show the difference
            for (const tax of ['va', 'community-health', 'private-practice']) {
                console.log(`\n[/jobs/${tax}/city/${s.slug}]`);
                console.log(buildTaxonomyCityNarrative(facts, tax, s.jobs));
            }
        }
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
