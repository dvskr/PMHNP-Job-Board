/**
 * Audit location filters: remote, state pages, city pages.
 *
 * Usage:  npx tsx scripts/_audit-location.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  dotenvConfig({ path: '.env.local' });
}
if (!process.env.DATABASE_URL) {
  dotenvConfig({ path: '.env' });
}

// Use require AFTER env setup so prisma.ts boot check passes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GLOBAL_EXCLUSIONS } = require('../lib/filters') as typeof import('../lib/filters');

const STATE_CODES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'District of Columbia': 'DC',
};
const CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODES).map(([n, c]) => [c, n])
);

/** Detect what U.S. state(s) a free-text description references via "<state>
 *  license" or "licensed in <state>" cues. Returns 2-letter codes. */
function detectStatesInDescription(desc: string): Set<string> {
  if (!desc) return new Set();
  const hits = new Set<string>();
  const lower = desc.toLowerCase();

  for (const [name, code] of Object.entries(STATE_CODES)) {
    // Phrase patterns that indicate license/practice tied to a state
    const patterns = [
      new RegExp(`\\b${name}\\s+(?:state\\s+)?(?:rn\\s+)?(?:np\\s+)?(?:aprn\\s+)?(?:pmhnp\\s+)?license`, 'i'),
      new RegExp(`licens(?:ed|ure)\\s+(?:in\\s+|to\\s+practice\\s+in\\s+)${name}\\b`, 'i'),
      new RegExp(`active\\s+${name}\\s+(?:state\\s+)?license`, 'i'),
      new RegExp(`${name}\\s+(?:state\\s+)?board\\s+of\\s+nursing`, 'i'),
      new RegExp(`current\\s+${name}\\s+(?:rn|np|aprn|pmhnp)`, 'i'),
    ];
    if (patterns.some(p => p.test(lower))) hits.add(code);
  }
  return hits;
}

/** Heuristic: does the description text suggest the role really IS remote? */
function descSuggestsRemote(desc: string): { remote: boolean; hybrid: boolean } {
  if (!desc) return { remote: false, hybrid: false };
  const l = desc.toLowerCase();
  const remote = /\b(100%\s*remote|fully\s*remote|work\s*from\s*home|telehealth\s*only|remote\s*position|remote\s*role|remote\s*pmhnp|remote\s*nurse\s*practitioner)\b/.test(l);
  const hybrid = /\bhybrid\b/.test(l) && !/no\s*hybrid/.test(l);
  const onsiteOnly = /\b(on[-\s]?site\s*only|in[-\s]?person\s*only|must\s*be\s*on[-\s]?site)\b/.test(l);
  return { remote: remote && !onsiteOnly, hybrid };
}

async function auditRemote() {
  console.log('\n========== 1. REMOTE FILTER ==========');
  const REMOTE_FILTER: any = {
    isPublished: true,
    isRemote: true,
    AND: GLOBAL_EXCLUSIONS.map(e => ({ NOT: e })),
  };
  const total = await prisma.job.count({ where: REMOTE_FILTER });
  console.log(`Total isRemote=true (published, post-exclusions): ${total}`);

  const dualFlagged = await prisma.job.count({
    where: { ...REMOTE_FILTER, isHybrid: true },
  });
  console.log(`isRemote=true AND isHybrid=true (ambiguous): ${dualFlagged}`);

  const sample = await prisma.job.findMany({
    where: REMOTE_FILTER,
    take: 15,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, employer: true, isRemote: true, isHybrid: true,
      city: true, state: true, stateCode: true, description: true,
    },
  });

  let trulyRemote = 0;
  let likelyHybrid = 0;
  let unknown = 0;
  for (const j of sample) {
    const sig = descSuggestsRemote(j.description || '');
    const flag = sig.remote ? 'REMOTE' : sig.hybrid ? 'HYBRID-cue' : 'UNCLEAR';
    if (sig.remote) trulyRemote++;
    else if (sig.hybrid && !sig.remote) likelyHybrid++;
    else unknown++;
    console.log(
      `[${flag}] hybrid=${j.isHybrid} | ${j.employer} — ${j.title.slice(0, 70)} | ${j.city || '—'}, ${j.stateCode || j.state || '—'}`
    );
  }
  console.log(`Sample 15: ${trulyRemote} desc-confirmed remote, ${likelyHybrid} hybrid-cued, ${unknown} unclear`);
}

async function auditState(stateName: string, stateCode: string) {
  const where: any = {
    isPublished: true,
    OR: [{ state: stateName }, { stateCode: stateCode }],
  };
  const total = await prisma.job.count({ where });

  const jobs = await prisma.job.findMany({
    where, take: 10, orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, employer: true,
      city: true, state: true, stateCode: true, description: true,
    },
  });

  let mismatches = 0;
  const exampleMismatches: string[] = [];
  for (const j of jobs) {
    const detected = detectStatesInDescription(j.description || '');
    detected.delete(stateCode); // matching state is OK
    if (detected.size > 0) {
      mismatches++;
      const otherCodes = Array.from(detected).join(',');
      exampleMismatches.push(
        `  - [${j.id}] state=${j.stateCode} desc-mentions=${otherCodes} | ${j.employer} — ${j.title.slice(0, 60)} | ${j.city || '—'}`
      );
    }
  }
  console.log(`\n${stateCode} (${stateName}): total=${total}, sampled=${jobs.length}, mismatches=${mismatches}`);
  if (mismatches > 0) console.log(exampleMismatches.join('\n'));
  return { stateCode, total, sampled: jobs.length, mismatches };
}

async function auditStates() {
  console.log('\n========== 2. STATE PAGES ==========');
  const results = [];
  for (const [n, c] of [['California', 'CA'], ['Texas', 'TX'], ['Florida', 'FL'], ['New York', 'NY'], ['Kansas', 'KS']] as const) {
    results.push(await auditState(n, c));
  }

  // Specific Kansas check: KS-tagged jobs whose description says "Missouri"
  console.log('\n--- Kansas deep dive: state=KS but description mentions Missouri ---');
  const ksJobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [{ state: 'Kansas' }, { stateCode: 'KS' }],
    },
    select: {
      id: true, title: true, employer: true, city: true,
      state: true, stateCode: true, description: true,
    },
  });
  const ksWithMissouri = ksJobs.filter(j => {
    const det = detectStatesInDescription(j.description || '');
    return det.has('MO');
  });
  console.log(`Found ${ksWithMissouri.length} / ${ksJobs.length} KS-tagged jobs that mention Missouri license cues.`);
  ksWithMissouri.slice(0, 8).forEach(j =>
    console.log(`  [${j.id}] ${j.employer} — ${j.title.slice(0, 70)} | ${j.city}, ${j.stateCode}`)
  );

  return results;
}

async function auditCities() {
  console.log('\n========== 3. CITY PAGES ==========');
  // Top cities by job count
  const cityCounts = await prisma.job.groupBy({
    by: ['city', 'stateCode'],
    where: { isPublished: true, city: { not: null }, stateCode: { not: null } },
    _count: { city: true },
    orderBy: { _count: { city: 'desc' } },
    take: 10,
  });
  console.log('Top 10 cities by job count:');
  cityCounts.forEach(c =>
    console.log(`  ${c.city}, ${c.stateCode} — ${c._count.city} jobs`)
  );

  // Cities below threshold (mem: MIN_JOBS=3)
  const allCities = await prisma.job.groupBy({
    by: ['city', 'stateCode'],
    where: { isPublished: true, city: { not: null }, stateCode: { not: null } },
    _count: { city: true },
  });
  const below3 = allCities.filter(c => c._count.city < 3);
  const tot = allCities.length;
  console.log(`\nAll distinct city/state combos: ${tot}; <3 jobs: ${below3.length} (${((below3.length / tot) * 100).toFixed(1)}%)`);
  console.log('NOTE: /jobs/city/[slug] only 404s when stats.totalJobs===0 (page.tsx:387-389) — no MIN_JOBS≥3 enforcement there.');

  // Sample top-3 high-volume cities and verify location.city matches
  console.log('\n--- Sampling 3 top cities (verify location.city matches) ---');
  for (const c of cityCounts.slice(0, 3)) {
    const jobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        city: { equals: c.city!, mode: 'insensitive' },
        stateCode: c.stateCode!,
      },
      take: 10,
      select: { id: true, city: true, stateCode: true, title: true },
    });
    const allMatch = jobs.every(j => j.city?.toLowerCase() === c.city!.toLowerCase() && j.stateCode === c.stateCode);
    console.log(`  ${c.city}, ${c.stateCode}: sampled ${jobs.length}, all city matches: ${allMatch}`);
  }
}

async function wichitaTeamHealth() {
  console.log('\n========== 4. WICHITA TEAMHEALTH ==========');
  // Match the title with flexibility — "Wichita | PMHNP | FT" pattern
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { title: { contains: 'Wichita', mode: 'insensitive' } },
        { city: { equals: 'Wichita', mode: 'insensitive' } },
      ],
      employer: { contains: 'TeamHealth', mode: 'insensitive' },
    },
    select: {
      id: true, title: true, employer: true, city: true, state: true,
      stateCode: true, description: true, isPublished: true,
      location: true, slug: true, applyLink: true,
    },
  });
  console.log(`Found ${jobs.length} TeamHealth Wichita-related rows`);
  for (const j of jobs) {
    console.log(`\n  ID:           ${j.id}`);
    console.log(`  Title:        ${j.title}`);
    console.log(`  Employer:     ${j.employer}`);
    console.log(`  city:         ${j.city}`);
    console.log(`  state:        ${j.state}`);
    console.log(`  stateCode:    ${j.stateCode}`);
    console.log(`  isPublished:  ${j.isPublished}`);
    console.log(`  slug:         ${j.slug}`);
    console.log(`  location:     ${j.location}`);
    console.log(`  applyLink:    ${j.applyLink?.slice(0, 100)}`);
    const detected = detectStatesInDescription(j.description || '');
    console.log(`  desc states detected: ${Array.from(detected).join(',') || '(none via license cues)'}`);
    console.log(`  description[0..800]:`);
    console.log(`    ${(j.description || '').slice(0, 800).replace(/\s+/g, ' ')}`);
  }
}

async function main() {
  try {
    await auditRemote();
    await auditStates();
    await auditCities();
    await wichitaTeamHealth();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
