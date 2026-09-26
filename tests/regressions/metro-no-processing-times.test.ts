/**
 * Metro licensure copy must not assert a board's processing time.
 *
 * SEO/AEO audit 2026-09-21: licensureNote and several FAQ answers stated
 * things like "the NY Board of Nursing processes licenses in 4 to 8 weeks"
 * and "Arizona Board of Nursing is one of the fastest processors in the
 * country (2 to 3 weeks)". lib/metro-data.ts carries no source or asOf field,
 * and metro.faqs is serialized into FAQPage JSON-LD by CategoryFAQ, so the
 * site was the cited source of a specific, checkable, undated licensure claim
 * on YMYL content. Board queues move with budget and backlog.
 */
import { describe, it, expect } from 'vitest';
import { METRO_CITIES } from '@/lib/metro-data';

/** Every reader-visible string in one metro entry. */
function copyOf(metro: (typeof METRO_CITIES)[number]): string[] {
  return [
    metro.heroDescription,
    metro.licensureNote,
    metro.costOfLivingNote,
    ...metro.whyThisMetro,
    ...metro.faqs.flatMap((f) => [f.question, f.answer]),
  ];
}

const PROCESSING_CLAIM = /processes? (?:licen[cs]es?|applications?|endorsements?)|fastest processor|in \d+\s*(?:to|-|–)\s*\d+\s*weeks/i;

describe('metro licensure copy', () => {
  it('has metros to check', () => {
    expect(METRO_CITIES.length).toBeGreaterThan(0);
  });

  it('asserts no board processing time anywhere', () => {
    const offenders: string[] = [];
    for (const metro of METRO_CITIES) {
      for (const text of copyOf(metro)) {
        if (PROCESSING_CLAIM.test(text)) offenders.push(`${metro.slug}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still points readers at the board', () => {
    const withLicensureNote = METRO_CITIES.filter((m) => /Board of (?:Registered )?Nursing/i.test(m.licensureNote));
    expect(withLicensureNote.length).toBeGreaterThan(0);
  });
});
