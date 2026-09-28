/**
 * Rewrite separator dashes out of job titles that were stored before
 * lib/title-punctuation.ts existed.
 *
 * New titles are normalized at both write chokepoints (job-normalizer for
 * ingest, sanitizeJobPosting for the employer post and edit paths), so this
 * is a one-off for history. It is safe to re-run: normalizeTitlePunctuation
 * is idempotent, and rows already clean are filtered out before any write.
 *
 * SLUGS ARE DELIBERATELY NOT TOUCHED. A slug is a published URL. slugify
 * already collapses every non-alphanumeric to a hyphen, so the dash never
 * reached it, and regenerating slugs here would break live links and every
 * ranking attached to them for a cosmetic change to the title.
 *
 *   Dry run (default, writes nothing):
 *     npx tsx scripts/backfill-title-punctuation.ts
 *   Apply:
 *     npx tsx scripts/backfill-title-punctuation.ts --apply
 *
 * Target the production database by exporting PROD_DIRECT_DATABASE_URL as
 * DIRECT_URL first; the script prints the host it is about to touch and
 * refuses to write until you have seen it.
 */
// The shared client, like every other script here. It reads DIRECT_URL then
// DATABASE_URL through prisma.config.ts, which is what lets this point at
// production by exporting PROD_DIRECT_DATABASE_URL into DIRECT_URL.
import { prisma } from '@/lib/prisma';
import { normalizeTitlePunctuation } from '@/lib/title-punctuation';

/** Same set lib/title-punctuation.ts rewrites. */
const DASH_CLASS = '[‒–—―−]';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const host = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
    .replace(/^.*@([^/:]+).*$/, '$1');
  console.log(`database host: ${host || 'unknown'}`);
  console.log(apply ? 'mode: APPLY (will write)' : 'mode: dry run (no writes)');
  console.log('');

  // Postgres regex, so the scan happens in the database rather than by
  // pulling every job title into node.
  const rows = await prisma.$queryRawUnsafe<{ id: string; title: string }[]>(
    `SELECT id, title FROM jobs WHERE title ~ '${DASH_CLASS}' ORDER BY created_at DESC`,
  );

  const changes = rows
    .map((r) => ({ id: r.id, from: r.title, to: normalizeTitlePunctuation(r.title) }))
    .filter((c) => c.to !== c.from && c.to.length > 0);

  console.log(`titles containing a separator dash: ${rows.length}`);
  console.log(`titles that would change:           ${changes.length}`);

  if (changes.length === 0) {
    console.log('nothing to do.');
    return;
  }

  // Printed to the console only, never written to a file in the repo: these
  // are real employer job titles and the repo is public.
  console.log('\nfirst 15 rewrites:');
  for (const c of changes.slice(0, 15)) {
    console.log(`  - ${c.from}`);
    console.log(`  + ${c.to}`);
  }

  if (!apply) {
    console.log('\ndry run. re-run with --apply to write.');
    return;
  }

  // One row at a time rather than a single UPDATE with a CASE: the set is
  // small, and a per-row failure should not abandon the rest of the run.
  let written = 0;
  const failures: string[] = [];
  for (const c of changes) {
    try {
      await prisma.job.update({ where: { id: c.id }, data: { title: c.to } });
      written++;
    } catch (e) {
      failures.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nwritten: ${written}`);
  if (failures.length) {
    console.log(`failed:  ${failures.length}`);
    failures.slice(0, 10).forEach((f) => console.log(`  ${f}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
