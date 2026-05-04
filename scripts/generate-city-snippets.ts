/**
 * GSC Indexing Crisis (P3.4 — Layer 2): generate LLM-authored snippets for
 * top-N cities and store them in city_snippets / category_city_snippets so
 * the renderer prefers them over the deterministic Layer 1 narrative.
 *
 * Designed for repeated iterative runs — won't redo work you've already done
 * unless you ask it to.
 *
 * Run modes (mutually exclusive — pick one):
 *   (default)            : skip cities that already have an approved snippet
 *                          (default safety — never re-spend $ on done work)
 *   --only-missing       : only generate for cities with NO snippet row at all
 *   --only-unapproved    : re-roll cities whose latest draft is unapproved
 *                          (use when you didn't like the first draft)
 *   --all                : regenerate everything in --top N (forces re-spend)
 *
 * Run:
 *   npx tsx scripts/generate-city-snippets.ts --top 50                       # default mode (skip approved)
 *   npx tsx scripts/generate-city-snippets.ts --top 50 --with-taxonomy       # base + per-taxonomy
 *   npx tsx scripts/generate-city-snippets.ts --top 5 --dry                  # preview only, no $ spent
 *   npx tsx scripts/generate-city-snippets.ts --top 50 --auto-approve        # auto-flip approved=true
 *   npx tsx scripts/generate-city-snippets.ts --top 100 --only-missing       # add new cities, skip existing
 *   npx tsx scripts/generate-city-snippets.ts --top 50 --only-unapproved     # re-roll rejected drafts
 *
 * Generated snippets land with approvedAt = NULL by default — renderer skips
 * un-approved drafts and falls back to Layer 1. Use scripts/approve-snippets.ts
 * to review and approve in bulk. Use scripts/diff-snippets.ts to compare
 * Layer 1 vs Layer 2 for a city before approving.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const WITH_TAXONOMY = process.argv.includes('--with-taxonomy');
const AUTO_APPROVE = process.argv.includes('--auto-approve');
const ONLY_MISSING = process.argv.includes('--only-missing');
const ONLY_UNAPPROVED = process.argv.includes('--only-unapproved');
const FORCE_ALL = process.argv.includes('--all');
const topIdx = process.argv.indexOf('--top');
const TOP_N = topIdx > 0 ? parseInt(process.argv[topIdx + 1], 10) || 50 : 50;

// Validate mutually-exclusive mode flags.
const modeFlags = [ONLY_MISSING, ONLY_UNAPPROVED, FORCE_ALL].filter(Boolean).length;
if (modeFlags > 1) {
    console.error('Pass at most one of: --only-missing, --only-unapproved, --all');
    process.exit(1);
}

type RunMode = 'skip-approved' | 'only-missing' | 'only-unapproved' | 'all';
const RUN_MODE: RunMode = ONLY_MISSING ? 'only-missing'
    : ONLY_UNAPPROVED ? 'only-unapproved'
    : FORCE_ALL ? 'all'
    : 'skip-approved';

// Per-call cost guard — refuse to run if estimated spend exceeds this cap.
// gpt-5.4 ≈ $5/M input + $15/M output. Each generation is ~400 input + ~250
// output tokens → ~$0.005 per call. 50 cities × (1 base + 28 taxonomy) = 1450
// calls ≈ $7.25. Cap stops accidental 1000-city runs that would cost $145+.
const MAX_SPEND_USD = 25;
const COST_PER_CALL_USD = 0.005;

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

const SYSTEM_PROMPT = `You are an SEO content writer for a psychiatric mental health nurse practitioner (PMHNP) job board. Write concise, factual paragraphs about job markets in specific U.S. cities.

Style rules:
- 2-4 sentences, 60-120 words total
- Plain prose only (no markdown, no headings, no bullet lists)
- US English, third person, no first-person ("I", "we")
- No salesy claims ("the best", "premier")
- Reference concrete facts the user provides — do not invent numbers, employers, or programs
- If a fact contradicts an obvious claim, prefer the fact

Output: just the paragraph. No preamble, no quotation marks, no explanation.`;

interface CityFactBlock {
    cityName: string;
    stateName: string;
    stateCode: string;
    population: number;
    costOfLivingIndex: number;
    medianIncome: number;
    metroArea?: string;
    mentalHealthShortage: boolean;
    healthcareSystems: string[];
    practiceAuthority: 'full' | 'reduced' | 'restricted' | null;
    practiceDetails: string | null;
}

function buildCityPrompt(facts: CityFactBlock, totalJobs: number): string {
    return [
        `Write a market-context paragraph for the page "PMHNP Jobs in ${facts.cityName}, ${facts.stateCode}".`,
        ``,
        `Facts:`,
        `- City: ${facts.cityName}, ${facts.stateCode} (${facts.stateName})`,
        `- Population: ${facts.population.toLocaleString('en-US')}`,
        facts.metroArea ? `- Metro area: ${facts.metroArea}` : null,
        `- Cost of living index: ${facts.costOfLivingIndex} (US average = 100)`,
        facts.medianIncome > 0 ? `- Median household income: $${facts.medianIncome.toLocaleString('en-US')}` : null,
        `- HRSA Mental Health Shortage Area: ${facts.mentalHealthShortage ? 'Yes — federally designated' : 'No'}`,
        facts.practiceAuthority ? `- ${facts.stateName} NP practice authority: ${facts.practiceAuthority} (${facts.practiceDetails ?? ''})` : null,
        facts.healthcareSystems.length > 0 ? `- Major healthcare employers: ${facts.healthcareSystems.slice(0, 4).join(', ')}` : null,
        `- Active PMHNP listings on this page: ${totalJobs}`,
        ``,
        `Mention shortage status if Yes (it implies NHSC loan repayment eligibility).`,
        `Mention practice authority because it directly shapes PMHNP scope and earning potential.`,
    ].filter(Boolean).join('\n');
}

function buildTaxonomyPrompt(facts: CityFactBlock, taxonomy: string, taxonomyLabel: string, totalJobs: number): string {
    return [
        `Write a market-context paragraph for "${taxonomyLabel} PMHNP Jobs in ${facts.cityName}, ${facts.stateCode}".`,
        ``,
        `The page covers ${taxonomyLabel.toLowerCase()} positions specifically — open with the taxonomy-specific compensation/benefit nuance for this category, then ground in city facts.`,
        ``,
        `Facts:`,
        `- City: ${facts.cityName}, ${facts.stateCode}`,
        `- Population: ${facts.population.toLocaleString('en-US')}`,
        `- Cost of living index: ${facts.costOfLivingIndex} (US average = 100)`,
        `- HRSA shortage: ${facts.mentalHealthShortage ? 'Yes' : 'No'}`,
        facts.practiceAuthority ? `- NP practice authority: ${facts.practiceAuthority}` : null,
        `- Active ${taxonomyLabel.toLowerCase()} PMHNP listings: ${totalJobs}`,
        ``,
        `Category context for ${taxonomy}:`,
        TAXONOMY_HINTS[taxonomy] ?? `- General psychiatric NP role with conventional W-2 employment.`,
    ].filter(Boolean).join('\n');
}

const TAXONOMY_HINTS: Record<string, string> = {
    'va': '- Federal GS-12 to GS-14 pay scale, FEHB health, TSP retirement match, 26 days PTO\n- Federal practice authority supersedes state restrictions for VA-employed providers',
    'community-health': '- FQHC/community health center setting\n- NHSC Loan Repayment ($50K+ over 2 years) commonly available\n- 340B drug pricing program at most sites',
    'hospital': '- Inpatient psychiatry, consult-liaison, or emergency psychiatric assessment\n- Shift differentials, on-call stipends, CME funding',
    'remote': '- Salary range typically $130K-$200K+\n- Requires HIPAA-compliant home setup and active state license',
    'telehealth': '- Mix of asynchronous documentation and scheduled video visits\n- Multi-state Compact licensure expands earnings',
    'inpatient': '- Acute psychiatric units, crisis stabilization, locked unit care\n- Shift premiums, weekend differentials',
    'outpatient': '- Community mental health, group practice, or integrated primary care\n- Caseloads 12-18 patients/day with documentation time',
    'travel': '- 8-26 week assignments with tax-free housing stipends\n- 20-50% premium pay over permanent equivalents',
    'full-time': '- Comprehensive benefits (health, dental, vision, retirement match, malpractice)\n- 4-6 weeks PTO standard',
    'part-time': '- 16-32 hours/week with prorated benefits or 1099 contractor structure',
    'contract': '- 1099 engagements at $90-$150/hour\n- Self-employment tax responsibility',
    'addiction': '- DEA X-waiver required for buprenorphine prescribing\n- MAT (medication-assisted treatment) programs\n- NHSC loan repayment broadly available',
    'new-grad': '- 6-12 months structured supervision\n- Slower initial caseload ramp\n- Most accept applicants within 6 months of board certification',
    '1099': '- Independent contractor at $80-$150/hour\n- Self-pay malpractice and tail coverage required',
    'behavioral-health': '- Full DSM-5 spectrum: mood, anxiety, psychosis, trauma\n- Outpatient and integrated care settings',
    'correctional': '- State employee benefits + pension plans\n- State-specific educational debt forgiveness',
    'child-adolescent': '- CAPMHNP post-graduate certificate or supervised hours required\n- Caseload weighted toward ADHD, anxiety, depression, autism',
    'crisis': '- Psych ED, mobile crisis teams, 988 follow-up programs\n- Evening/overnight/holiday differentials',
    'entry-level': '- 1-2 years post-board-certification accepted\n- Structured onboarding + senior PMHNP mentorship',
    'geriatric': '- Long-term care, memory care, home-based primary care\n- Medicare reimbursement; per-visit RVU bonuses',
    'lgbtq': '- Gender-affirming psychiatric care\n- Minority stress and integrated behavioral health focus',
    'locum-tenens': '- $90-$160/hour with malpractice and travel covered\n- 4-26 week assignments',
    'mid-career': '- 3-7 years post-certification\n- Lead-clinician roles or expanded scope',
    'per-diem': '- $80-$130/hour without scheduled commitment\n- Often stacked with primary employer',
    'private-practice': '- Solo, group, or concierge models\n- Self-employed retain 65-75% of collected revenue after overhead',
    'senior': '- 7+ years experience\n- Clinical leadership and protocol-development stipends',
    'substance-abuse': '- DEA X-waiver for buprenorphine/naltrexone\n- NHSC and HRSA loan repayment at FQHCs',
    'veterans': '- VA medical centers, CBOCs, Vet Centers\n- PTSD, MST, TBI emphasis',
};

const TAXONOMY_LABELS: Record<string, string> = {
    'va': 'VA',
    'community-health': 'Community Health',
    'hospital': 'Hospital',
    'remote': 'Remote',
    'telehealth': 'Telehealth',
    'inpatient': 'Inpatient',
    'outpatient': 'Outpatient',
    'travel': 'Travel',
    'full-time': 'Full-Time',
    'part-time': 'Part-Time',
    'contract': 'Contract',
    'addiction': 'Addiction',
    'new-grad': 'New Grad',
    '1099': '1099',
    'behavioral-health': 'Behavioral Health',
    'correctional': 'Correctional',
    'child-adolescent': 'Child & Adolescent',
    'crisis': 'Crisis',
    'entry-level': 'Entry Level',
    'geriatric': 'Geriatric',
    'lgbtq': 'LGBTQ',
    'locum-tenens': 'Locum Tenens',
    'mid-career': 'Mid-Career',
    'per-diem': 'Per Diem',
    'private-practice': 'Private Practice',
    'senior': 'Senior',
    'substance-abuse': 'Substance Abuse',
    'veterans': 'Veterans',
};

async function main() {
    const prisma = await getPrisma();

    // Pick top-N cities by current active-job count.
    const cityRows = await prisma.job.groupBy({
        by: ['city', 'state'],
        where: {
            isPublished: true,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
            ],
            city: { not: null },
            state: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: TOP_N,
    });

    const { CITIES } = await import('@/lib/pseo/city-data/cities');
    const { buildCityFacts } = await import('@/lib/pseo/city-narrative');
    const { complete } = await import('@/lib/ai/gateway');

    // Resolve each (city, state) pair to a CITIES entry by name + state.
    const allTargets: { citySlug: string; cityName: string; stateName: string; stateCode: string; totalJobs: number; facts: ReturnType<typeof buildCityFacts> }[] = [];
    for (const row of cityRows) {
        if (!row.city || !row.state) continue;
        const match = CITIES.find(
            (c) => c.name.toLowerCase() === row.city!.toLowerCase()
                && c.state.toLowerCase() === row.state!.toLowerCase()
        );
        if (!match) continue;
        allTargets.push({
            citySlug: match.slug,
            cityName: match.name,
            stateName: match.state,
            stateCode: match.stateCode,
            totalJobs: row._count._all,
            facts: buildCityFacts(match),
        });
    }

    // Apply run-mode filter against existing snippet state.
    // Pull every snippet row in one query so we don't issue per-city lookups.
    const existingCitySnippets = new Map<string, { approvedAt: Date | null }>();
    const allSnippetRows = await prisma.citySnippet.findMany({
        where: { citySlug: { in: allTargets.map((t) => t.citySlug) } },
        select: { citySlug: true, approvedAt: true },
    });
    for (const r of allSnippetRows) existingCitySnippets.set(r.citySlug, { approvedAt: r.approvedAt });

    const targets = allTargets.filter((t) => {
        const existing = existingCitySnippets.get(t.citySlug);
        switch (RUN_MODE) {
            case 'only-missing':
                return !existing;
            case 'only-unapproved':
                return existing && !existing.approvedAt;
            case 'skip-approved':
                // Skip if already approved (don't re-spend); generate if missing or unapproved.
                return !existing || !existing.approvedAt;
            case 'all':
                return true;
        }
    });

    const skipped = allTargets.length - targets.length;
    if (skipped > 0) {
        console.log(`Filter mode: ${RUN_MODE} → skipping ${skipped} cities (already in desired state).`);
    }

    // Same pre-fetch for per-(taxonomy, city) snippets so we can apply the
    // mode filter on the inner loop too.
    const existingTaxSnippets = new Map<string, { approvedAt: Date | null }>();
    if (WITH_TAXONOMY && targets.length > 0) {
        const taxRows = await prisma.categoryCitySnippet.findMany({
            where: { citySlug: { in: targets.map((t) => t.citySlug) } },
            select: { categorySlug: true, citySlug: true, approvedAt: true },
        });
        for (const r of taxRows) {
            existingTaxSnippets.set(`${r.categorySlug}|${r.citySlug}`, { approvedAt: r.approvedAt });
        }
    }
    function shouldGenerateTaxonomy(tax: string, citySlug: string): boolean {
        const existing = existingTaxSnippets.get(`${tax}|${citySlug}`);
        switch (RUN_MODE) {
            case 'only-missing': return !existing;
            case 'only-unapproved': return !!existing && !existing.approvedAt;
            case 'skip-approved': return !existing || !existing.approvedAt;
            case 'all': return true;
        }
    }

    // Calculate exact call count based on the run-mode filter.
    const baseCalls = targets.length;
    let taxCalls = 0;
    if (WITH_TAXONOMY) {
        for (const t of targets) {
            for (const tax of Object.keys(TAXONOMY_LABELS)) {
                if (shouldGenerateTaxonomy(tax, t.citySlug)) taxCalls++;
            }
        }
    }
    const totalCalls = baseCalls + taxCalls;
    const estCost = totalCalls * COST_PER_CALL_USD;
    console.log(`Targets: ${targets.length} cities (after ${RUN_MODE} filter)`);
    console.log(`Mode: ${WITH_TAXONOMY ? 'base + per-taxonomy' : 'base only'}`);
    console.log(`Base-city calls: ${baseCalls}${WITH_TAXONOMY ? `,  per-taxonomy calls: ${taxCalls}` : ''}`);
    console.log(`Total LLM calls planned: ${totalCalls}`);
    console.log(`Estimated cost: ~$${estCost.toFixed(2)}`);
    console.log(`Auto-approve: ${AUTO_APPROVE ? 'YES (skips human review)' : 'NO (rows insert with approvedAt = NULL)'}`);

    if (totalCalls === 0) {
        console.log(`\nNothing to generate. All targets are already in the desired state for mode "${RUN_MODE}".`);
        return;
    }

    if (estCost > MAX_SPEND_USD) {
        console.error(`\n✗ Estimated cost $${estCost.toFixed(2)} exceeds MAX_SPEND_USD ($${MAX_SPEND_USD}). Reduce --top or omit --with-taxonomy.`);
        process.exit(1);
    }

    if (DRY) {
        console.log(`\n--dry: would process the targets above. Sample target:`);
        if (targets[0]) {
            console.log(`  ${targets[0].citySlug} (${targets[0].cityName}, ${targets[0].stateCode}) — ${targets[0].totalJobs} jobs`);
            const factBlock: CityFactBlock = {
                cityName: targets[0].facts.city.name,
                stateName: targets[0].facts.city.state,
                stateCode: targets[0].facts.city.stateCode,
                population: targets[0].facts.city.population,
                costOfLivingIndex: targets[0].facts.city.costOfLivingIndex,
                medianIncome: targets[0].facts.city.medianIncome,
                metroArea: targets[0].facts.city.metroArea,
                mentalHealthShortage: targets[0].facts.shortage,
                healthcareSystems: targets[0].facts.topEmployers,
                practiceAuthority: targets[0].facts.practiceAuthority,
                practiceDetails: targets[0].facts.practiceDetails,
            };
            console.log(`\nSample base prompt:\n${buildCityPrompt(factBlock, targets[0].totalJobs)}`);
        }
        return;
    }

    let cityOk = 0;
    let cityFail = 0;
    let taxOk = 0;
    let taxFail = 0;

    for (const target of targets) {
        const factBlock: CityFactBlock = {
            cityName: target.facts.city.name,
            stateName: target.facts.city.state,
            stateCode: target.facts.city.stateCode,
            population: target.facts.city.population,
            costOfLivingIndex: target.facts.city.costOfLivingIndex,
            medianIncome: target.facts.city.medianIncome,
            metroArea: target.facts.city.metroArea,
            mentalHealthShortage: target.facts.shortage,
            healthcareSystems: target.facts.topEmployers,
            practiceAuthority: target.facts.practiceAuthority,
            practiceDetails: target.facts.practiceDetails,
        };

        // Base city snippet
        try {
            const res = await complete({
                task: 'seo_content',
                tenant: 'system',
                promptId: 'pseo_city_narrative',
                promptVersion: 'v1',
                cacheKey: ['city', target.citySlug, target.totalJobs],
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: buildCityPrompt(factBlock, target.totalJobs) },
                ],
            });
            const body = res.content?.trim();
            if (body && body.length > 50) {
                await prisma.citySnippet.upsert({
                    where: { citySlug: target.citySlug },
                    update: {
                        body,
                        sourceModel: res.model,
                        generatedAt: new Date(),
                        ...(AUTO_APPROVE && { approvedAt: new Date() }),
                    },
                    create: {
                        citySlug: target.citySlug,
                        body,
                        sourceModel: res.model,
                        approvedAt: AUTO_APPROVE ? new Date() : null,
                    },
                });
                cityOk++;
                console.log(`  ✓ ${target.citySlug} (city)`);
            } else {
                cityFail++;
                console.error(`  ✗ ${target.citySlug} (city) — empty/short response`);
            }
        } catch (err) {
            cityFail++;
            console.error(`  ✗ ${target.citySlug} (city) — ${err instanceof Error ? err.message : String(err)}`);
        }

        if (!WITH_TAXONOMY) continue;

        for (const [tax, label] of Object.entries(TAXONOMY_LABELS)) {
            if (!shouldGenerateTaxonomy(tax, target.citySlug)) continue;
            try {
                const res = await complete({
                    task: 'seo_content',
                    tenant: 'system',
                    promptId: 'pseo_taxcity_narrative',
                    promptVersion: 'v1',
                    cacheKey: ['taxcity', tax, target.citySlug, target.totalJobs],
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: buildTaxonomyPrompt(factBlock, tax, label, target.totalJobs) },
                    ],
                });
                const body = res.content?.trim();
                if (body && body.length > 50) {
                    await prisma.categoryCitySnippet.upsert({
                        where: {
                            categorySlug_citySlug: { categorySlug: tax, citySlug: target.citySlug },
                        },
                        update: {
                            body,
                            sourceModel: res.model,
                            generatedAt: new Date(),
                            ...(AUTO_APPROVE && { approvedAt: new Date() }),
                        },
                        create: {
                            categorySlug: tax,
                            citySlug: target.citySlug,
                            body,
                            sourceModel: res.model,
                            approvedAt: AUTO_APPROVE ? new Date() : null,
                        },
                    });
                    taxOk++;
                } else {
                    taxFail++;
                }
            } catch (err) {
                taxFail++;
                console.error(`  ✗ ${target.citySlug} × ${tax} — ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        console.log(`  …${target.citySlug} done (taxonomy ok=${taxOk}, fail=${taxFail})`);
    }

    console.log(`\nDone.`);
    console.log(`  City snippets:     ok=${cityOk}, fail=${cityFail}`);
    if (WITH_TAXONOMY) console.log(`  Taxonomy snippets: ok=${taxOk}, fail=${taxFail}`);
    if (!AUTO_APPROVE) {
        console.log(`\n${cityOk + taxOk} rows inserted with approvedAt = NULL — they won't render until approved.`);
        console.log(`To approve a single row: UPDATE city_snippets SET approved_at = NOW() WHERE city_slug = '...';`);
        console.log(`To approve all rows generated this run: UPDATE city_snippets SET approved_at = NOW() WHERE generated_at >= NOW() - INTERVAL '1 hour' AND approved_at IS NULL;`);
    }
}

main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(async () => { if (prismaCache) await prismaCache.$disconnect(); });
