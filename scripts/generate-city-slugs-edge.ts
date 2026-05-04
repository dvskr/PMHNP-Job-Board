/**
 * Generate the slim edge-runtime-safe city-slugs file from cities.ts.
 *
 * Why: middleware.ts runs in Vercel Edge Runtime which has a 1MB bundle limit.
 * The full lib/pseo/city-data/cities.ts is ~2MB. We extract just the slugs into
 * a small file (~75KB) so middleware can validate /jobs/city/{slug} and
 * /jobs/{taxonomy}/city/{slug} URLs without bloating the edge bundle.
 *
 * Run after every regeneration of cities.ts:
 *   npx tsx scripts/generate-city-slugs-edge.ts
 */
import { CITIES } from '@/lib/pseo/city-data/cities';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_PATH = resolve(process.cwd(), 'lib/pseo/city-data/city-slugs-edge.ts');

const slugs = Array.from(new Set(CITIES.map(c => c.slug.toLowerCase()))).sort();

const lines = [
  '// AUTO-GENERATED — do not edit by hand.',
  '// Slim, edge-runtime-safe set of valid city slugs derived from lib/pseo/city-data/cities.ts.',
  '// Used by middleware.ts to validate /jobs/city/{slug} and /jobs/{taxonomy}/city/{slug} URLs.',
  '// Regenerate: npx tsx scripts/generate-city-slugs-edge.ts',
  '',
  'export const CITY_SLUGS: ReadonlySet<string> = new Set<string>([',
  ...slugs.map(s => `  "${s}",`),
  ']);',
  '',
  'export function isKnownCitySlug(slug: string): boolean {',
  '  return CITY_SLUGS.has(slug.toLowerCase());',
  '}',
  '',
];

writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
console.log(`Wrote ${slugs.length} slugs to ${OUT_PATH}`);
