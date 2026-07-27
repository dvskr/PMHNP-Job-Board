/**
 * Canonical US state registry: the single source of truth for state codes,
 * display names, and search aliases.
 *
 * WHY THIS EXISTS
 * The repo grew many independent hardcoded state lists, and they drifted:
 * the job-alerts pages shipped 50 names with no District of Columbia while
 * every server-side map had 51, so a DC candidate could browse DC jobs but
 * never create a DC alert. New code must import from here; existing lists
 * migrate here as they are touched.
 *
 * ORDERING MATTERS for alias matching: "washington dc" (DC) is listed before
 * "washington" (WA) so longest/earliest-match strategies resolve the
 * ambiguity. Do not alphabetize this array; use US_STATE_NAMES for display.
 */

export interface UsState {
  /** USPS 2-letter code, uppercase. */
  code: string;
  /** Display name, canonical capitalization. */
  name: string;
  /** Lowercase search aliases, most specific first. Includes the name itself. */
  aliases: readonly string[];
}

export const US_STATES: readonly UsState[] = [
  { code: 'AL', name: 'Alabama', aliases: ['alabama'] },
  { code: 'AK', name: 'Alaska', aliases: ['alaska'] },
  { code: 'AZ', name: 'Arizona', aliases: ['arizona'] },
  { code: 'AR', name: 'Arkansas', aliases: ['arkansas'] },
  { code: 'CA', name: 'California', aliases: ['california', 'calif'] },
  { code: 'CO', name: 'Colorado', aliases: ['colorado'] },
  { code: 'CT', name: 'Connecticut', aliases: ['connecticut'] },
  { code: 'DE', name: 'Delaware', aliases: ['delaware'] },
  // DC before WA: "washington dc" must win over "washington".
  { code: 'DC', name: 'District of Columbia', aliases: ['district of columbia', 'washington dc', 'washington d.c.'] },
  { code: 'FL', name: 'Florida', aliases: ['florida'] },
  { code: 'GA', name: 'Georgia', aliases: ['georgia'] },
  { code: 'HI', name: 'Hawaii', aliases: ['hawaii'] },
  { code: 'ID', name: 'Idaho', aliases: ['idaho'] },
  { code: 'IL', name: 'Illinois', aliases: ['illinois'] },
  { code: 'IN', name: 'Indiana', aliases: ['indiana'] },
  { code: 'IA', name: 'Iowa', aliases: ['iowa'] },
  { code: 'KS', name: 'Kansas', aliases: ['kansas'] },
  { code: 'KY', name: 'Kentucky', aliases: ['kentucky'] },
  { code: 'LA', name: 'Louisiana', aliases: ['louisiana'] },
  { code: 'ME', name: 'Maine', aliases: ['maine'] },
  { code: 'MD', name: 'Maryland', aliases: ['maryland'] },
  { code: 'MA', name: 'Massachusetts', aliases: ['massachusetts', 'mass'] },
  { code: 'MI', name: 'Michigan', aliases: ['michigan'] },
  { code: 'MN', name: 'Minnesota', aliases: ['minnesota'] },
  { code: 'MS', name: 'Mississippi', aliases: ['mississippi'] },
  { code: 'MO', name: 'Missouri', aliases: ['missouri'] },
  { code: 'MT', name: 'Montana', aliases: ['montana'] },
  { code: 'NE', name: 'Nebraska', aliases: ['nebraska'] },
  { code: 'NV', name: 'Nevada', aliases: ['nevada'] },
  { code: 'NH', name: 'New Hampshire', aliases: ['new hampshire'] },
  { code: 'NJ', name: 'New Jersey', aliases: ['new jersey'] },
  { code: 'NM', name: 'New Mexico', aliases: ['new mexico'] },
  { code: 'NY', name: 'New York', aliases: ['new york'] },
  { code: 'NC', name: 'North Carolina', aliases: ['north carolina'] },
  { code: 'ND', name: 'North Dakota', aliases: ['north dakota'] },
  { code: 'OH', name: 'Ohio', aliases: ['ohio'] },
  { code: 'OK', name: 'Oklahoma', aliases: ['oklahoma'] },
  { code: 'OR', name: 'Oregon', aliases: ['oregon'] },
  { code: 'PA', name: 'Pennsylvania', aliases: ['pennsylvania', 'penn'] },
  { code: 'RI', name: 'Rhode Island', aliases: ['rhode island'] },
  { code: 'SC', name: 'South Carolina', aliases: ['south carolina'] },
  { code: 'SD', name: 'South Dakota', aliases: ['south dakota'] },
  { code: 'TN', name: 'Tennessee', aliases: ['tennessee'] },
  { code: 'TX', name: 'Texas', aliases: ['texas'] },
  { code: 'UT', name: 'Utah', aliases: ['utah'] },
  { code: 'VT', name: 'Vermont', aliases: ['vermont'] },
  { code: 'VA', name: 'Virginia', aliases: ['virginia'] },
  { code: 'WA', name: 'Washington', aliases: ['washington state', 'washington'] },
  { code: 'WV', name: 'West Virginia', aliases: ['west virginia'] },
  { code: 'WI', name: 'Wisconsin', aliases: ['wisconsin'] },
  { code: 'WY', name: 'Wyoming', aliases: ['wyoming'] },
];

/** All 51 codes (50 states + DC), in registry order. */
export const CANONICAL_STATE_CODES: readonly string[] = US_STATES.map((s) => s.code);

/** Code -> display name, e.g. 'WV' -> 'West Virginia'. */
export const STATE_CODE_TO_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s.name]),
);

/** Display name -> code, exact canonical capitalization keys. */
export const STATE_NAME_TO_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  US_STATES.map((s) => [s.name, s.code]),
);

/**
 * Display names sorted alphabetically, for pickers and dropdowns.
 * 51 entries: the whole point is that DC is present.
 */
export const US_STATE_NAMES: readonly string[] = US_STATES
  .map((s) => s.name)
  .slice()
  .sort((a, b) => a.localeCompare(b));

// Lowercase alias -> code, longest alias first so "west virginia" resolves
// before "virginia" and "washington dc" before "washington".
const ALIAS_TO_CODE: ReadonlyArray<[string, string]> = US_STATES
  .flatMap((s) => s.aliases.map((a): [string, string] => [a, s.code]))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Resolve any reasonable state input to a canonical 2-letter code.
 * Accepts a code in any case ('tx'), a display name ('Texas'), or an alias
 * ('calif'). Returns null for anything unrecognized: callers must treat null
 * as "no state", never guess.
 */
export function toStateCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    return STATE_CODE_TO_NAME[upper] ? upper : null;
  }
  const lower = trimmed.toLowerCase();
  for (const [alias, code] of ALIAS_TO_CODE) {
    if (alias === lower) return code;
  }
  return null;
}
