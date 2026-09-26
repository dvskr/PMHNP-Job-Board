/**
 * What the pSEO surface is allowed to publish about pay, licensure and job
 * counts (2026-09 audit, lib-pseo cluster).
 *
 * Three things were wrong at scale:
 *
 *   Pay. Every setting x state and category x city config carried a
 *   hand-written salaryRange ("$130K-200K"), and the narratives and benefit
 *   cards repeated fixed dollar ranges that read identically for Wyoming and
 *   California. The site's own published methodology (app/llms.txt) is that
 *   every pay figure is a median of advertised ranges from live postings with
 *   its sample size, withheld below the floor, and /salary-guide/{state}
 *   publishes exactly that. A typed range is a figure that policy did not
 *   produce, and it contradicted the guide one click away. The lock below is
 *   the one already applied to the metro, state and /faq surfaces in
 *   tests/seo/published-facts-consistency.ts, extended to lib/pseo.
 *
 *   Licensure. The /jobs/remote FAQPage offered "the PSYPACT compact" as a
 *   multi-state path for a nurse practitioner. PSYPACT is the psychologist
 *   compact and carries no NP authority, which /resources/multi-state-
 *   licensure says on the same domain.
 *
 *   Counts. Every /jobs/{setting}/{state} page rendered the NATIONAL category
 *   FAQ with that state's count substituted in, so 51 pages each published
 *   "There are currently N remote PMHNP job openings" with no state named:
 *   a wrong national figure inside FAQPage JSON-LD, 51 times over.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildSettingStateFaqs, buildSettingStateNarrative } from '@/lib/pseo/state-narrative';
import { getCategoryFaqs, CATEGORY_LABELS, isCategorySlug, type CategorySlug } from '@/lib/pseo/category-faq-data';
import { getTaxonomyLead, buildCityFacts, TAXONOMY_LEAD_KEYS } from '@/lib/pseo/city-narrative';
import type { CityData } from '@/lib/pseo/city-data/types';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source lines with comments blanked, so an engineering note is not copy. */
function copyLines(src: string): { line: string; no: number }[] {
  const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return withoutBlocks
    .split(/\r?\n/)
    .map((line, i) => ({ line: line.replace(/\/\/.*/, ''), no: i + 1 }))
    .filter(({ line }) => line.trim() !== '');
}

/** A literal amount. Interpolation reads `$${x}`, so a digit never follows. */
const LITERAL_DOLLARS = /\$\s?\d/;

describe('no pSEO surface publishes a hand-written dollar figure', () => {
  const SURFACES = [
    'lib/pseo/state-narrative.ts',
    'lib/pseo/city-narrative.ts',
    'lib/pseo/setting-state-config.ts',
    'lib/pseo/category-city-template.tsx',
    'lib/pseo/setting-state-template.tsx',
    'lib/pseo/category-faq-data.ts',
  ];

  it.each(SURFACES)('%s types no dollar amount in copy', (rel) => {
    const offenders = copyLines(read(rel))
      .filter(({ line }) => LITERAL_DOLLARS.test(line))
      .map(({ line, no }) => `${rel}:${no}  ${line.trim().slice(0, 120)}`);
    expect(
      offenders,
      `these lines type a dollar figure instead of deriving it from live postings:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no setting x state narrative states a pay figure, whatever the state', () => {
    // The lead is the first thing the speakable block hands an answer engine.
    for (const settingKey of ['remote', 'contract', 'full-time', 'part-time', 'new-grad', '1099']) {
      for (const stateName of ['Wyoming', 'California']) {
        const narrative = buildSettingStateNarrative({
          settingKey,
          stateName,
          stateCode: stateName === 'Wyoming' ? 'WY' : 'CA',
          avgCOL: 100,
          shortageCityCount: 1,
          totalJobs: 12,
          topEmployers: ['Alpha Health', 'Beta Health'],
          topCities: ['Testville', 'Otherton'],
        });
        expect(narrative, `${settingKey} / ${stateName}`).not.toMatch(LITERAL_DOLLARS);
      }
    }
  });

  it('no city taxonomy lead states a pay figure', () => {
    const facts = buildCityFacts({
      name: 'Testville',
      state: 'Ohio',
      stateCode: 'OH',
      slug: 'testville-oh',
      population: 900_000,
      costOfLivingIndex: 132,
      lat: 0,
      lng: 0,
      metroArea: 'Testville Metro',
      mentalHealthShortage: true,
      healthcareSystems: ['Alpha Health', 'Beta Health'],
      nearbyCities: [],
      providerRatio: 'critical',
      medianIncome: 70_000,
      stateRank: 1,
    } as CityData);
    for (const taxonomy of TAXONOMY_LEAD_KEYS) {
      expect(getTaxonomyLead(taxonomy, facts), taxonomy).not.toMatch(LITERAL_DOLLARS);
    }
  });
});

describe('the pSEO FAQ never offers PSYPACT as a nurse practitioner licensure path', () => {
  // PSYPACT is the psychologist compact. The NLC multistate license covers
  // the RN layer only and the APRN Compact has not been implemented, which is
  // what /resources/multi-state-licensure tells the same reader.
  const slugs = Object.keys(CATEGORY_LABELS) as CategorySlug[];

  it('sweeps every category, not a sample', () => {
    expect(slugs.length).toBeGreaterThan(10);
  });

  it.each(slugs)('%s answers name no psychologist compact', (slug) => {
    const answers = getCategoryFaqs({ category: slug, totalJobs: 7, avgSalary: 0 })
      .map((f) => `${f.question} ${f.answer}`)
      .join(' ');
    expect(answers).not.toMatch(/PSYPACT/i);
  });

  it('no category answer grants APRN scope off a compact RN license', () => {
    for (const slug of slugs) {
      for (const faq of getCategoryFaqs({ category: slug, totalJobs: 7, avgSalary: 0 })) {
        if (!/compact/i.test(faq.answer)) continue;
        expect(faq.answer, `${slug}: ${faq.question}`).toMatch(/RN|APRN/);
        expect(faq.answer, `${slug}: ${faq.question}`).not.toMatch(/practice across state lines/i);
      }
    }
  });
});

describe('setting x state FAQ is scoped to the state it renders on', () => {
  const facts = (stateName: string, stateCode: string, totalJobs: number) => ({
    settingLabel: 'Remote',
    stateName,
    stateCode,
    totalJobs,
    avgSalary: 0,
    topEmployers: ['Alpha Health', 'Beta Health'],
    topCities: ['Testville', 'Otherton'],
    shortageCityCount: 2,
  });

  it('every question names the state', () => {
    for (const faq of buildSettingStateFaqs(facts('Ohio', 'OH', 12))) {
      expect(faq.question, faq.question).toContain('Ohio');
    }
  });

  it('the count answer is scoped to this page, never presented as a national total', () => {
    const [first] = buildSettingStateFaqs(facts('Ohio', 'OH', 12));
    expect(first.answer).toContain('12');
    expect(first.answer).toContain('Ohio');
    // The national wording that used to ship here with a state count in it.
    expect(first.answer).not.toMatch(/There are currently \d+ remote PMHNP job openings/i);
  });

  it('two states produce different answers, not one template with a number swapped', () => {
    const ohio = buildSettingStateFaqs(facts('Ohio', 'OH', 12));
    const texas = buildSettingStateFaqs({ ...facts('Texas', 'TX', 12), topCities: ['Bigtown'] });
    for (let i = 0; i < ohio.length; i += 1) {
      expect(ohio[i].answer, `answer ${i}`).not.toBe(texas[i].answer);
    }
  });

  it('withholds a pay figure when the engine has no average, and states one when it does', () => {
    const withoutPay = buildSettingStateFaqs(facts('Ohio', 'OH', 12));
    expect(withoutPay.map((f) => f.answer).join(' ')).not.toMatch(LITERAL_DOLLARS);

    const withPay = buildSettingStateFaqs({ ...facts('Ohio', 'OH', 12), avgSalary: 141 });
    expect(withPay.map((f) => f.answer).join(' ')).toContain('$141K');
  });

  it('names the employers and cities the page actually fetched', () => {
    const answers = buildSettingStateFaqs(facts('Ohio', 'OH', 12)).map((f) => f.answer).join(' ');
    expect(answers).toContain('Alpha Health');
    expect(answers).toContain('Testville');
  });

  it('describes the compact correctly', () => {
    const answers = buildSettingStateFaqs(facts('Ohio', 'OH', 12)).map((f) => f.answer).join(' ');
    expect(answers).toMatch(/covers RN practice, not APRN practice/);
  });
});

describe('a setting config slug is checked before it is used as an FAQ key', () => {
  it('rejects setting slugs that are not FAQ categories', () => {
    // SettingConfig.faqCategory carries 'full-time', '1099' and friends. An
    // unchecked cast made CATEGORY_LABELS[key] undefined and rendered
    // "undefined PMHNP Jobs: FAQ" as the section heading.
    expect(isCategorySlug('full-time')).toBe(false);
    expect(isCategorySlug('1099')).toBe(false);
    expect(isCategorySlug('remote')).toBe(true);
    expect(isCategorySlug('inpatient')).toBe(true);
  });
});
