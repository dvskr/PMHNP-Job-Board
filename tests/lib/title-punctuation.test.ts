/**
 * Job titles have to obey the house punctuation rule too.
 *
 * copy-style.test.ts bans em and en dashes, but it can only see strings we
 * write. A title is data: it arrives from an ATS feed or an employer's post
 * form and reaches emails, OG images, page titles and JSON-LD untouched.
 * A rejection email reading "Full-Time PMHNP {em dash} Colorado Telehealth
 * Psychiatry" is the rule broken through a route the rule cannot reach.
 *
 * The two risks worth testing are the ones that would make this worse than
 * doing nothing: mangling hyphenated words, and turning a numeric range into
 * a list. All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import { normalizeTitlePunctuation } from '@/lib/title-punctuation';
import { normalizeTitle } from '@/lib/deduplicator';

const EM = '—';
const EN = '–';
const FIGURE = '‒';
const BAR = '―';
const MINUS = '−';

describe('separator dashes become commas', () => {
  it('rewrites the title from the reported email', () => {
    expect(normalizeTitlePunctuation(`Full-Time PMHNP ${EM} Colorado Telehealth Psychiatry`))
      .toBe('Full-Time PMHNP, Colorado Telehealth Psychiatry');
  });

  it.each([
    ['em', EM],
    ['en', EN],
    ['figure', FIGURE],
    ['horizontal bar', BAR],
    ['minus sign', MINUS],
  ])('handles the %s dash', (_name, dash) => {
    expect(normalizeTitlePunctuation(`PMHNP ${dash} Remote`)).toBe('PMHNP, Remote');
  });

  it('handles a dash with no surrounding spaces', () => {
    expect(normalizeTitlePunctuation(`PMHNP${EM}Remote`)).toBe('PMHNP, Remote');
  });

  it('handles several in one title', () => {
    expect(normalizeTitlePunctuation(`PMHNP ${EN} Adult ${EN} Remote`))
      .toBe('PMHNP, Adult, Remote');
  });

  it('leaves a clean title exactly as it was', () => {
    for (const title of [
      'Psychiatric Mental Health Nurse Practitioner',
      'PMHNP, Remote',
      'PMHNP (Locum Tenens)',
      'Child and Adolescent PMHNP: Night Shift',
    ]) {
      expect(normalizeTitlePunctuation(title)).toBe(title);
    }
  });
});

describe('hyphenated words are not punctuation', () => {
  it.each([
    'Full-Time PMHNP',
    'Board-Certified Psychiatric NP',
    'Part-Time, Per-Diem PMHNP',
    'Tele-Psychiatry Nurse Practitioner',
  ])('leaves %s alone', (title) => {
    expect(normalizeTitlePunctuation(title)).toBe(title);
  });
});

describe('a dash between numbers is a range, not a list', () => {
  it('reads as "to", which is what the copy rule asks for', () => {
    expect(normalizeTitlePunctuation(`PMHNP (20${EN}30 hours)`)).toBe('PMHNP (20 to 30 hours)');
  });

  it('handles spacing around the range', () => {
    expect(normalizeTitlePunctuation(`PMHNP 32 ${EN} 40 hrs`)).toBe('PMHNP 32 to 40 hrs');
  });

  it('a range and a separator in the same title each do their own thing', () => {
    expect(normalizeTitlePunctuation(`PMHNP ${EM} Remote ${EM} 20${EN}30 hrs`))
      .toBe('PMHNP, Remote, 20 to 30 hrs');
  });
});

describe('the edges do not leave debris', () => {
  it('strips a leading dash', () => {
    expect(normalizeTitlePunctuation(`${EM} PMHNP Remote`)).toBe('PMHNP Remote');
  });

  it('strips a trailing dash', () => {
    expect(normalizeTitlePunctuation(`PMHNP Remote ${EM}`)).toBe('PMHNP Remote');
  });

  it('collapses a dash that already had a comma beside it', () => {
    expect(normalizeTitlePunctuation(`PMHNP, ${EM} Remote`)).toBe('PMHNP, Remote');
  });

  it('collapses the run of spaces a replacement can leave', () => {
    expect(normalizeTitlePunctuation(`PMHNP   ${EM}   Remote`)).toBe('PMHNP, Remote');
  });

  it('handles empty and missing input without throwing', () => {
    expect(normalizeTitlePunctuation('')).toBe('');
    expect(normalizeTitlePunctuation(null)).toBe('');
    expect(normalizeTitlePunctuation(undefined)).toBe('');
  });

  it('never emits a dash it was meant to remove', () => {
    const messy = `${EM}PMHNP${EN}Remote ${FIGURE} 20${MINUS}30 hrs${BAR}`;
    expect(normalizeTitlePunctuation(messy)).not.toMatch(/[‒–—―−]/);
  });
});

describe('dedup keys are unaffected, which is the thing that could break', () => {
  // buildJobIdentityKey runs titles through deduplicator.normalizeTitle. If
  // normalizing punctuation changed that key, every already-ingested job
  // would stop matching its own re-ingest and the board would duplicate.
  it.each([
    `Full-Time PMHNP ${EM} Colorado Telehealth`,
    `PMHNP ${EN} Adult ${EN} Remote`,
    `PMHNP 20${EN}30 hrs`,
    `${EM}PMHNP Remote${EM}`,
  ])('produces the same identity key before and after: %s', (raw) => {
    expect(normalizeTitle(normalizeTitlePunctuation(raw))).toBe(normalizeTitle(raw));
  });
});

describe('it is wired into both write paths', () => {
  it('ingest normalizes the title it extracts', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(
        require('node:path').resolve(__dirname, '../../lib/job-normalizer.ts'),
        'utf8',
      ),
    );
    expect(src).toContain('normalizeTitlePunctuation(extractField(rawJob, config.title');
  });

  it('the employer post and edit paths normalize through sanitizeJobPosting', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(require('node:path').resolve(__dirname, '../../lib/sanitize.ts'), 'utf8'),
    );
    // Both app/api/create-checkout and app/api/jobs/update call
    // sanitizeJobPosting, so normalizing there covers both.
    expect(src).toMatch(/title: normalizeTitlePunctuation\(sanitizeText\(input\.title/);
  });
});
