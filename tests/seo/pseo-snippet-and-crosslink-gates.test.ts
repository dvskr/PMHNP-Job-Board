/**
 * Two scale properties of the pSEO templates (2026-09 audit, lib-pseo).
 *
 * Snippets. The setting x state title appended the config's hand-written
 * salary range, so "12 Substance Abuse PMHNP Jobs in North Carolina
 * ($120K-180K)" measured 75 characters with the root brand suffix and Google
 * dropped the state: the one token the page exists to rank for. Its
 * description ran 212 characters and named the setting twice. The category x
 * city description spent its tail on "Population: 478,961. COL index: 105.",
 * census figures no searcher types, and got cut mid-sentence. The page-level
 * builders elsewhere in the repo already clamp (the city page trims a title
 * past 60, the metro page caps a description at 158); these assert the pSEO
 * templates do the same for every combination, not for a sampled one.
 *
 * Cross-link gates. getCityStats will not trust a pseoStats row past the
 * staleness window, but the three cross-link queries in the same file gated
 * on totalJobs alone. Through an aggregator outage (the April to August 2026
 * incident) every cell kept advertising siblings whose live count had already
 * fallen under the render gate and now answer 404, re-feeding GSC's not-found
 * bucket. The invariant is structural rather than line-numbered: a pseoStats
 * read that gates on the count must gate on freshness too.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  buildMetaDescription,
  settingStateTitle,
  META_DESCRIPTION_LIMIT,
  TITLE_LIMIT,
} from '@/lib/pseo/meta-description';
import { SETTING_CONFIGS, STATE_CODES } from '@/lib/pseo/setting-state-config';
import { CITIES } from '@/lib/pseo/city-data/cities';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('pSEO titles survive the SERP cap for every combination', () => {
  const states = Object.keys(STATE_CODES);
  const settings = Object.values(SETTING_CONFIGS);

  it('sweeps every setting and every state, not a sample', () => {
    expect(settings.length).toBeGreaterThan(10);
    expect(states.length).toBeGreaterThan(50);
  });

  it('no setting x state title exceeds the budget before the brand suffix', () => {
    const offenders: string[] = [];
    for (const config of settings) {
      for (const stateName of states) {
        // Four digits is more postings than any cell has carried; it is the
        // widest the count can plausibly get.
        const title = settingStateTitle(9999, config.label, stateName);
        if (title.length > TITLE_LIMIT) offenders.push(`${title.length}: ${title}`);
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it('the title carries the count, the setting and the state', () => {
    const title = settingStateTitle(12, 'Substance Abuse', 'North Carolina');
    expect(title).toContain('12');
    expect(title).toContain('Substance Abuse');
    expect(title).toContain('North Carolina');
    // A hand-written pay range is what pushed it over the cap.
    expect(title).not.toMatch(/\$\s?\d/);
  });
});

describe('meta descriptions are clamped, never truncated mid-sentence', () => {
  it('drops a whole clause rather than overflowing', () => {
    const lead = 'Lead sentence.';
    const short = buildMetaDescription(lead, 'Second.');
    expect(short).toBe('Lead sentence. Second.');

    const long = buildMetaDescription(lead, 'x'.repeat(META_DESCRIPTION_LIMIT), 'Updated daily.');
    expect(long.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
    expect(long).toContain('Updated daily.');
    expect(long).not.toContain('xxx');
  });

  it('keeps the lead even when the lead alone is long', () => {
    const lead = `${'y'.repeat(META_DESCRIPTION_LIMIT + 20)}.`;
    expect(buildMetaDescription(lead, 'Updated daily.')).toBe(lead);
  });

  it('every setting x state description stays inside the cap and names the state', () => {
    const offenders: string[] = [];
    for (const config of Object.values(SETTING_CONFIGS)) {
      for (const stateName of Object.keys(STATE_CODES)) {
        const description = buildMetaDescription(
          `9999 ${config.label.toLowerCase()} PMHNP jobs in ${stateName}.`,
          `${config.heroSubtitle}.`,
          'Practice authority, top employers and pay from live listings.',
          'Updated daily.',
        );
        if (description.length > META_DESCRIPTION_LIMIT) {
          offenders.push(`${description.length}: ${description}`);
        }
        if (!description.includes(stateName)) offenders.push(`missing state: ${description}`);
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it('every category x city description stays inside the cap and names the city', () => {
    const offenders: string[] = [];
    // Longest label in either config surface, so this is the worst case.
    const label = 'Community Health';
    for (const city of CITIES) {
      const description = buildMetaDescription(
        `9999 ${label.toLowerCase()} PMHNP jobs in ${city.name}, ${city.stateCode}.`,
        'Federally qualified health center and safety-net positions.',
        ...(city.mentalHealthShortage ? ['Federally designated mental health shortage area.'] : []),
        'Updated daily.',
      );
      if (description.length > META_DESCRIPTION_LIMIT) {
        offenders.push(`${description.length}: ${description}`);
      }
      if (!description.includes(city.name)) offenders.push(`missing city: ${description}`);
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it('the category x city description spends no room on census figures', () => {
    const src = read('lib/pseo/category-city-template.tsx');
    const metadata = src.slice(src.indexOf('export async function buildCategoryCityMetadata'));
    const body = metadata.slice(0, metadata.indexOf('\n}'));
    expect(body).not.toMatch(/Population: \$\{/);
    expect(body).not.toMatch(/COL index: \$\{/);
  });
});

describe('every pseoStats cross-link gate checks freshness as well as count', () => {
  const FILES = ['lib/pseo/category-city-template.tsx', 'lib/pseo/setting-state-template.tsx'];

  /** The `where: { ... }` object of each prisma.pseoStats read in a file. */
  function pseoStatsWhereClauses(src: string): string[] {
    const out: string[] = [];
    const call = /prisma\.pseoStats\.find(?:Many|Unique|First)\s*\(\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = call.exec(src)) !== null) {
      // Walk braces from the opening one so nested objects come along whole.
      let depth = 0;
      let i = match.index + match[0].length - 1;
      const start = i;
      for (; i < src.length; i += 1) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      out.push(src.slice(start, i + 1));
    }
    return out;
  }

  it('finds the reads it is meant to check', () => {
    // Guards the guard: a parser that matches nothing would pass silently.
    const found = FILES.flatMap((rel) => pseoStatsWhereClauses(read(rel)));
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  it.each(FILES)('%s gates every counted pseoStats read on updatedAt', (rel) => {
    const src = read(rel);
    const offenders = pseoStatsWhereClauses(src).filter((clause) => {
      // findUnique on the composite key cannot filter by updatedAt, so those
      // reads select it and compare in code instead.
      if (!/totalJobs/.test(clause) && !/select:/.test(clause)) return false;
      return !/updatedAt/.test(clause);
    });
    expect(
      offenders.map((c) => c.replace(/\s+/g, ' ').slice(0, 160)),
      'a pseoStats row the aggregator stopped updating is not evidence the linked page still clears the gate',
    ).toEqual([]);
  });

  it('the staleness window comes from the shared threshold module', () => {
    for (const rel of FILES) {
      const src = read(rel);
      expect(src).toMatch(/from '\.\/sitemap-thresholds'/);
      // A hand-copied 36 is the fork the B7 note forbids.
      expect(src.replace(/\/\/.*/g, '')).not.toMatch(/STALENESS_HOURS\s*=\s*36/);
    }
  });
});
