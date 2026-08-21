/**
 * extractEligibleStates — conservative state-restriction parsing for
 * JobPosting applicantLocationRequirements. Precision over recall: only
 * candidate-facing restriction phrasing counts, employer-side reach
 * claims never do, and anything effectively nationwide returns [].
 */
import { describe, it, expect } from 'vitest';
import { extractEligibleStates } from '@/lib/eligible-states';
import { US_STATES } from '@/lib/us-states';

describe('extractEligibleStates — candidate-facing restrictions', () => {
  it('parses "must be licensed in Texas and Florida"', () => {
    expect(extractEligibleStates('Candidates must be licensed in Texas and Florida.'))
      .toEqual(['Texas', 'Florida']);
  });

  it('parses "must hold an active license in" with a state code list', () => {
    expect(extractEligibleStates('You must hold an active license in NY, NJ, and CT.'))
      .toEqual(['New York', 'New Jersey', 'Connecticut']);
  });

  it('parses "must reside in" a single state', () => {
    expect(extractEligibleStates('Applicants must reside in West Virginia.'))
      .toEqual(['West Virginia']);
  });

  it('parses "open only to residents of ..."', () => {
    expect(extractEligibleStates('This role is open only to residents of California.'))
      .toEqual(['California']);
  });

  it('parses "applicants in TX, FL only"', () => {
    expect(extractEligibleStates('Applicants in TX, FL only.'))
      .toEqual(['Texas', 'Florida']);
  });

  it('parses "eligible states:" lists', () => {
    expect(extractEligibleStates('Eligible states: Oregon, Washington, and Idaho.'))
      .toEqual(['Oregon', 'Washington', 'Idaho']);
  });

  it('parses "licensed in the following states"', () => {
    expect(extractEligibleStates('Clinicians must be licensed in the following states: Ohio, Michigan.'))
      .toEqual(['Ohio', 'Michigan']);
  });
});

describe('extractEligibleStates — markup and line-wrap handling', () => {
  it('joins soft line-wrapped lists instead of truncating at the newline', () => {
    expect(extractEligibleStates('Must be licensed in Texas,\nFlorida, and New York.'))
      .toEqual(['Texas', 'Florida', 'New York']);
  });

  it('joins <br>-wrapped lists in employer HTML', () => {
    expect(extractEligibleStates('<p>Candidates must be licensed in Texas,<br>Florida, and New York.</p>'))
      .toEqual(['Texas', 'Florida', 'New York']);
  });

  it('bails to nationwide when markup truncates a list mid-way (never a partial list)', () => {
    expect(extractEligibleStates('<p>Must be licensed in Texas,</p><ul><li>Florida</li></ul>'))
      .toEqual([]);
  });

  it('parses Washington, DC as the District of Columbia, not Washington state', () => {
    expect(extractEligibleStates('Must be licensed in Washington, DC.'))
      .toEqual(['District of Columbia']);
    expect(extractEligibleStates('Must be licensed in Washington, D.C. and Maryland.'))
      .toEqual(['District of Columbia', 'Maryland']);
  });

  it('reads an uppercase OR between state codes as a conjunction, not Oregon', () => {
    expect(extractEligibleStates('Must be licensed in CA OR NY within 90 days of hire.'))
      .toEqual(['California', 'New York']);
  });

  it('still accepts Oregon leading a code list', () => {
    expect(extractEligibleStates('Must be licensed in OR and WA to apply.'))
      .toEqual(['Oregon', 'Washington']);
  });
});

describe('extractEligibleStates — precision guards', () => {
  it('ignores employer-side reach claims like "we are licensed in 42 states"', () => {
    expect(extractEligibleStates('We are licensed in 42 states and growing.')).toEqual([]);
  });

  it('ignores restrictions that name no parseable state', () => {
    expect(extractEligibleStates('Must be licensed in the state where the patient resides.'))
      .toEqual([]);
  });

  it('returns [] for descriptions with no restriction phrasing at all', () => {
    expect(extractEligibleStates('Provide psychiatric evaluations via telehealth across Texas.'))
      .toEqual([]);
  });

  it('never mistakes "West Virginia" for Virginia', () => {
    expect(extractEligibleStates('Must be licensed in West Virginia.')).toEqual(['West Virginia']);
  });

  it('does not read the conjunction OR as Oregon in an all-caps segment', () => {
    expect(extractEligibleStates('MUST BE LICENSED IN CALIFORNIA OR NEW YORK'))
      .toEqual(['California', 'New York']);
  });

  it('treats a list of more than 40 states as effectively nationwide', () => {
    const codes = US_STATES.slice(0, 41).map((s) => s.code);
    const list = `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
    expect(extractEligibleStates(`Must be licensed in ${list}.`)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(extractEligibleStates('')).toEqual([]);
  });
});
