/**
 * pSEO state-page accuracy audit.
 *
 * Read-only. Mirrors WHERE clauses in:
 *   app/jobs/state/[state]/page.tsx
 *   lib/pseo/setting-state-template.tsx + setting-state-config.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const STATE_SLUGS = ['california', 'texas', 'florida', 'new-york', 'kansas'];
const CATEGORY_KEYS = ['outpatient', 'telehealth', 'new-grad', 'full-time'];
const CATEGORY_STATES = ['california', 'texas', 'kansas'];

async function run() {
  const { prisma } = await import('@/lib/prisma');
  const { SETTING_CONFIGS, STATE_CODES, resolveStateSlug } = await import(
    '@/lib/pseo/setting-state-config'
  );

  // ── State page audit ──────────────────────────────────────────────────────
  console.log('═'.repeat(78));
  console.log('STATE-PAGE AUDIT (/jobs/state/<slug>)');
  console.log('═'.repeat(78));
  for (const slug of STATE_SLUGS) {
    const stateName = resolveStateSlug(slug)!;
    const stateCode = STATE_CODES[stateName];

    const where = {
      isPublished: true,
      OR: [{ state: stateName }, { stateCode: stateCode }],
    };
    const pageCount = await prisma.job.count({ where });
    const sample = await prisma.job.findMany({
      where,
      select: { id: true, title: true, state: true, stateCode: true, city: true },
      take: 25,
    });

    let mismatches = 0;
    const examples: string[] = [];
    for (const j of sample) {
      const okState = j.state && j.state.trim().toLowerCase() === stateName.toLowerCase();
      const okCode = j.stateCode && j.stateCode.trim().toUpperCase() === stateCode;
      if (!okState && !okCode) {
        mismatches++;
        if (examples.length < 4) {
          examples.push(`${j.title} — state="${j.state}" code="${j.stateCode}"`);
        }
      }
    }
    const flag = mismatches > 0 ? ' ⚠ MISMATCH' : '';
    console.log(
      `/jobs/state/${slug}  →  ${pageCount} jobs (sample ${sample.length}, ${mismatches} mismatched)${flag}`
    );
    for (const ex of examples) console.log(`    · ${ex}`);
  }

  // ── Category×State combos ─────────────────────────────────────────────────
  console.log();
  console.log('═'.repeat(78));
  console.log('CATEGORY × STATE COMBOS (/jobs/<cat>/<state>)');
  console.log('═'.repeat(78));
  for (const cat of CATEGORY_KEYS) {
    for (const st of CATEGORY_STATES) {
      const config = SETTING_CONFIGS[cat];
      const stateName = resolveStateSlug(st)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where = config.buildWhere(stateName) as any;
      const pageCount = await prisma.job.count({ where });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sample = (await prisma.job.findMany({
        where,
        select: { id: true, title: true, state: true, stateCode: true, categoryTags: true } as any,
        take: 25,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any[];

      let stateMis = 0;
      let catMis = 0;
      const ex: string[] = [];
      for (const j of sample) {
        const stateOk = j.state && j.state.toLowerCase() === stateName.toLowerCase();
        const tags: string[] = Array.isArray(j.categoryTags) ? j.categoryTags : [];
        const hasTag = tags.includes(cat);
        const legacyOk = tags.length === 0;
        const catOk = hasTag || legacyOk;
        if (!stateOk) stateMis++;
        if (!catOk) catMis++;
        if ((!stateOk || !catOk) && ex.length < 4) {
          ex.push(`${j.title} | state="${j.state}" | tags=[${tags.join(',')}]`);
        }
      }
      const flag =
        (pageCount === 0 ? ' ⚠ ZERO' : '') +
        (stateMis > 0 ? ' ⚠ STATE-MIS' : '') +
        (catMis > 0 ? ' ⚠ CAT-MIS' : '');
      console.log(
        `/jobs/${cat}/${st}  →  ${pageCount} jobs (sample ${sample.length}, state-mis=${stateMis} cat-mis=${catMis})${flag}`
      );
      for (const e of ex) console.log(`    · ${e}`);
    }
  }

  // ── Stale pseoStats ───────────────────────────────────────────────────────
  console.log();
  console.log('═'.repeat(78));
  console.log('STALE pseoStats — cached>=1 but live=0 (still published)');
  console.log('═'.repeat(78));
  const cached = await prisma.pseoStats.findMany({
    where: { type: 'setting-state', totalJobs: { gte: 1 } },
    select: { categorySlug: true, locationSlug: true, totalJobs: true, updatedAt: true },
  });
  const stale: string[] = [];
  for (const row of cached) {
    const config = SETTING_CONFIGS[row.categorySlug];
    if (!config) continue;
    const stateName = resolveStateSlug(row.locationSlug);
    if (!stateName) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = config.buildWhere(stateName) as any;
    const live = await prisma.job.count({ where });
    if (live === 0 && row.totalJobs >= 1) {
      stale.push(
        `/jobs/${row.categorySlug}/${row.locationSlug}  cached=${row.totalJobs} live=0 updated=${row.updatedAt.toISOString()}`
      );
    }
  }
  if (stale.length === 0) console.log('  (none)');
  else for (const s of stale) console.log(`  · ${s}`);

  // ── State-page MIN_JOBS threshold check ──────────────────────────────────
  console.log();
  console.log('═'.repeat(78));
  console.log('STATE PAGES: counts < 3 (memory says city MIN_JOBS=3; state pages?)');
  console.log('═'.repeat(78));
  // All 50 states + DC slugs same as sitemap
  const slugs = [
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
    'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
    'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
    'missouri','montana','nebraska','nevada','new-hampshire','new-jersey','new-mexico',
    'new-york','north-carolina','north-dakota','ohio','oklahoma','oregon','pennsylvania',
    'rhode-island','south-carolina','south-dakota','tennessee','texas','utah','vermont',
    'virginia','washington','west-virginia','wisconsin','wyoming','district-of-columbia',
  ];
  let zero = 0;
  let thin = 0;
  for (const s of slugs) {
    const stateName = resolveStateSlug(s);
    if (!stateName) continue;
    const stateCode = STATE_CODES[stateName];
    const c = await prisma.job.count({
      where: { isPublished: true, OR: [{ state: stateName }, { stateCode }] },
    });
    if (c === 0) {
      zero++;
      console.log(`  · /jobs/state/${s}  →  0 jobs (notFound() guard fires, sitemap skips)`);
    } else if (c < 3) {
      thin++;
      console.log(`  · /jobs/state/${s}  →  ${c} jobs (thin — no noindex on state page!)`);
    }
  }
  console.log(`  Total: ${zero} empty, ${thin} thin (1–2 jobs) state pages.`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
