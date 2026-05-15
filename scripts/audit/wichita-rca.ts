/**
 * RCA: TeamHealth "Wichita | PMHNP | FT (5d/w)" rendering "New grad welcome"
 * despite the body requiring 1 year of experience.
 *
 * Reads from prod by default (audit pattern shared with audit-thin-job-postings.ts).
 * Run:  npx tsx scripts/audit/wichita-rca.ts
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
  const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (flag === 'dev' || flag === 'prod') return flag;
  if (process.argv.includes('--dev')) return 'dev';
  if (process.argv.includes('--prod')) return 'prod';
  return 'prod';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

async function main() {
  console.log(`[wichita-rca] env=${ENV}\n`);

  // First — what experience columns exist in the live DB? Prod may lag the
  // migration in prisma/migrations/20260514_add_experience_fields/.
  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='jobs'
       AND column_name IN ('min_years_experience','max_years_experience',
                           'new_grad_friendly','experience_qualifier',
                           'experience_label','experience_level')
     ORDER BY column_name`,
  );
  console.log('Experience columns present in live DB:');
  console.log(cols.map((c) => '  ' + c.column_name).join('\n') || '  (none)');
  console.log('');

  // Dynamic SELECT — only project experience columns that actually exist.
  const present = new Set(cols.map((c) => c.column_name));
  const optionalCols = [
    'experience_label',
    'min_years_experience',
    'max_years_experience',
    'new_grad_friendly',
    'experience_qualifier',
    'experience_level',
  ].filter((c) => present.has(c));
  const selectCols = [
    'id', 'slug', 'title', 'employer', 'city', 'state_code',
    ...optionalCols,
    'description', 'source_type', 'source_provider', 'source_site',
    'original_posted_at', 'created_at', 'last_enriched_at', 'is_published',
  ];
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${selectCols.join(', ')}
     FROM jobs
     WHERE (title ILIKE '%PMHNP%' AND title ILIKE '%Wichita%')
        OR (employer ILIKE '%TeamHealth%' AND city ILIKE '%Wichita%')
        OR slug ILIKE '%wichita%teamhealth%'
        OR slug ILIKE '%wichita-pmhnp%'
     ORDER BY created_at DESC
     LIMIT 20`,
  );

  console.log(`Found ${rows.length} candidate job(s).\n`);
  for (const j of rows) {
    console.log('────────────────────────────────────────');
    for (const [k, v] of Object.entries(j)) {
      if (k === 'description') continue;
      console.log(`${k.padEnd(22)} ${typeof v === 'object' && v instanceof Date ? v.toISOString() : JSON.stringify(v)}`);
    }
    console.log('---  description (full)  ---');
    console.log(String(j.description));
    console.log('');
  }

  await prisma.$disconnect();
  return;

  // unreachable — kept for future local-DB runs after migration ships
  // eslint-disable-next-line @typescript-eslint/no-unreachable
  await prisma.job.findMany({
    where: {
      OR: [
        {
          AND: [
            { title: { contains: 'PMHNP', mode: 'insensitive' } },
            { title: { contains: 'Wichita', mode: 'insensitive' } },
          ],
        },
        {
          AND: [
            { employer: { contains: 'TeamHealth', mode: 'insensitive' } },
            { city: { contains: 'Wichita', mode: 'insensitive' } },
          ],
        },
        { slug: { contains: 'wichita', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      employer: true,
      city: true,
      stateCode: true,
      experienceLabel: true,
      minYearsExperience: true,
      maxYearsExperience: true,
      newGradFriendly: true,
      experienceLevel: true,
      description: true,
      sourceType: true,
      sourceProvider: true,
      sourceSite: true,
      originalPostedAt: true,
      lastEnrichedAt: true,
      createdAt: true,
      isPublished: true,
    },
  });

  console.log(`Found ${candidates.length} candidate job(s).\n`);
  for (const j of candidates) {
    console.log('────────────────────────────────────────');
    console.log(`id:               ${j.id}`);
    console.log(`slug:             ${j.slug}`);
    console.log(`title:            ${j.title}`);
    console.log(`employer:         ${j.employer}`);
    console.log(`city/state:       ${j.city} / ${j.stateCode}`);
    console.log(`isPublished:      ${j.isPublished}`);
    console.log(`sourceType:       ${j.sourceType}`);
    console.log(`sourceProvider:   ${j.sourceProvider}`);
    console.log(`sourceSite:       ${j.sourceSite}`);
    console.log(`originalPostedAt: ${j.originalPostedAt?.toISOString() ?? 'null'}`);
    console.log(`lastEnrichedAt:   ${j.lastEnrichedAt?.toISOString() ?? 'null'}`);
    console.log(`createdAt:        ${j.createdAt.toISOString()}`);
    console.log(`---`);
    console.log(`experienceLabel:      ${JSON.stringify(j.experienceLabel)}`);
    console.log(`minYearsExperience:   ${j.minYearsExperience}`);
    console.log(`maxYearsExperience:   ${j.maxYearsExperience}`);
    console.log(`newGradFriendly:      ${j.newGradFriendly}`);
    console.log(`experienceLevel:      ${JSON.stringify(j.experienceLevel)}`);
    console.log(`---`);
    console.log(`description (full):`);
    console.log(j.description);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
