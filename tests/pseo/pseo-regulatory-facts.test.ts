/**
 * Regulatory facts the pSEO surface publishes at scale (2026-09 audit).
 *
 * Three claims in the generated narratives and category config were wrong, and
 * the site's own blog said so on the same domain:
 *
 *   1. The separate DEA X-waiver for buprenorphine was eliminated by the
 *      Consolidated Appropriations Act of 2023. Copy telling clinicians to get
 *      one is wrong, and content/blog/pmhnp-addiction-mat-certification-guide
 *      already said it was gone.
 *   2. The Nurse Licensure Compact multistate license covers RN and LPN/VN
 *      practice only. The APRN Compact is separate and has not been
 *      implemented, so a PMHNP needs an APRN license in every state whose
 *      residents they treat. The state licence posts already said this.
 *   3. NHSC award amounts and service terms are reset by HRSA each cycle.
 *      Three different fixed dollar figures were published across four files
 *      while the FAQ copy correctly deferred to HRSA.
 *
 * All of it rendered inside the #answer-summary block that the Speakable
 * schema points voice and answer engines at, which is the worst possible place
 * for a claim the same domain refutes elsewhere.
 *
 * This guard is modelled on the "invented stats stay dead" locks in
 * tests/seo/faq-schema-parity.test.ts: it reads source text, so it fails
 * whoever reintroduces the wording rather than waiting for a crawl.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

/**
 * Engineering comments explain WHY a fact changed and legitimately name the
 * retired waiver, so strip them before asserting on reader-facing text. Same
 * approach as tests/regressions/copy-style.test.ts.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const NARRATIVE_FILES = [
  'lib/pseo/city-narrative.ts',
  'lib/pseo/state-narrative.ts',
  'lib/pseo/setting-state-config.ts',
  'lib/pseo/category-city-template.tsx',
  'lib/pseo/category-faq-data.ts',
] as const;

describe('no pSEO page tells a PMHNP to obtain a DEA X-waiver', () => {
  for (const rel of NARRATIVE_FILES) {
    it(`${rel} carries no X-waiver instruction`, () => {
      const body = stripComments(read(rel));
      expect(body).not.toMatch(/X-waiver/i);
      expect(body).not.toMatch(/X waiver/i);
    });
  }

  it('the addiction and substance-use leads state the current rule instead', () => {
    const src = read('lib/pseo/city-narrative.ts');
    expect(src).toMatch(/standard DEA registration, with no separate waiver/);
    expect(src).toMatch(/no separate waiver required since 2023/);
  });
});

describe('the Nurse Licensure Compact is never described as covering APRN practice', () => {
  for (const rel of NARRATIVE_FILES) {
    it(`${rel} does not extend a Compact multistate license to prescribing or APRN scope`, () => {
      const body = stripComments(read(rel));
      // The failure mode is a sentence that names the Compact and then offers
      // multi-state APRN practice, prescribing reach, or "earning potential"
      // off the back of it.
      for (const sentence of body.split(/(?<=[.`])\s+/)) {
        if (!/Compact/.test(sentence)) continue;
        expect(sentence).not.toMatch(/prescrib\w* across multiple states/i);
        expect(sentence).not.toMatch(/Compact licensure (expands|broadens)/i);
      }
    });
  }

  it('the remote and telehealth leads require a state APRN license', () => {
    const city = read('lib/pseo/city-narrative.ts');
    const state = read('lib/pseo/state-narrative.ts');
    expect(city).toMatch(/covers RN practice only and the separate APRN Compact has not been implemented/);
    expect(city).toMatch(/covers RN practice, not APRN practice/);
    expect(state).toMatch(/covers RN practice only, and the separate APRN Compact has not been implemented/);
    expect(state).toMatch(/covers RN practice, not APRN practice/);
  });
});

describe('no pSEO surface publishes a fixed NHSC award amount', () => {
  // HRSA resets amounts and terms per cycle, so any hard figure is a claim the
  // codebase cannot substantiate and will silently go stale.
  const NHSC_AMOUNT = /NHSC[^.`]{0,120}?\$\s?\d/i;
  const AMOUNT_THEN_NHSC = /\$\s?\d[^.`]{0,120}?NHSC/i;

  for (const rel of NARRATIVE_FILES) {
    it(`${rel} defers award amounts to HRSA`, () => {
      const body = stripComments(read(rel));
      expect(body).not.toMatch(NHSC_AMOUNT);
      expect(body).not.toMatch(AMOUNT_THEN_NHSC);
    });
  }

  it('uses the HRSA-per-cycle wording the FAQ already used', () => {
    expect(read('lib/pseo/category-faq-data.ts')).toMatch(/set by HRSA each cycle/);
    expect(read('lib/pseo/city-narrative.ts')).toMatch(/HRSA sets each cycle/);
    expect(read('lib/pseo/state-narrative.ts')).toMatch(/HRSA sets each cycle/);
    expect(read('lib/pseo/setting-state-config.ts')).toMatch(/set by HRSA each cycle/);
    expect(read('lib/pseo/category-city-template.tsx')).toMatch(/set by HRSA each cycle/);
  });
});

describe('the speakable sources line cites only what the narrative uses', () => {
  const src = read('lib/pseo/category-city-template.tsx');

  it('no longer credits the Bureau of Labor Statistics', () => {
    // No BLS figure feeds this narrative; the credit was decorative.
    expect(src).not.toMatch(/Sources: [^<]*Bureau of Labor Statistics/);
  });

  it('credits Census, HRSA and AANP, which the narrative does use', () => {
    expect(src).toMatch(/Sources: U\.S\. Census Bureau \(population\), HRSA \([^)]+\), AANP State Practice Environment/);
  });
});
