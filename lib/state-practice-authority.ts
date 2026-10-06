/**
 * State Practice Authority Data for PMHNPs
 * 
 * Practice authority levels:
 * - FULL: PMHNPs can practice independently without physician oversight
 * - REDUCED: Requires a collaborative agreement with a physician
 * - RESTRICTED: Requires physician supervision for practice
 * 
 * Source: American Association of Nurse Practitioners (AANP) State Practice Environment
 *
 * VERIFIED 2026-10-05, with these limits. aanp.org refuses automated requests,
 * so the full practice list was checked against AANP's published list as
 * search engines index it, two independent secondary tables, and the New
 * Jersey governor's 2026-03-30 statement that twenty-seven states have full
 * practice authority. New York and Massachusetts were checked against the
 * law itself: NY Education Law 6902(3)(b) (3,600 hours, in force until
 * 2030-07-01) and 244 CMR 4.07 (two years of supervised practice). Both had
 * been carried here as 'reduced' while this site's own licensure guides for
 * the two states called them full practice.
 *
 * Still open: the reduced versus restricted split for Arkansas, Indiana,
 * Louisiana, Mississippi, West Virginia and Michigan rests on one secondary
 * source, and three states passed laws that AANP may yet reclassify
 * (Oklahoma HB 2298, Wisconsin 2025 Act 17, New Jersey P.L.2026 c.6).
 */

export type PracticeAuthority = 'full' | 'reduced' | 'restricted';

/**
 * Where these classifications come from. Exported so the citation travels
 * with the number instead of being retyped beside it: lib/stats-sources.ts
 * consumes both rather than declaring its own copy.
 */
export const PRACTICE_AUTHORITY_SOURCE = 'AANP State Practice Environment';
export const PRACTICE_AUTHORITY_SOURCE_URL =
    'https://www.aanp.org/advocacy/state/state-practice-environment';

export interface StatePracticeInfo {
    authority: PracticeAuthority;
    description: string;
    details: string;
}

// Practice authority by state
export const STATE_PRACTICE_AUTHORITY: Record<string, StatePracticeInfo> = {
    // Full Practice Authority jurisdictions. Deliberately NOT restated as a
    // number here: the count is derived below by FULL_PRACTICE_COUNT. A
    // hand-written total in a comment is how this file, stats-sources.ts and
    // the blog ended up publishing three different figures (see the note on
    // FULL_PRACTICE_SUMMARY).
    'Alaska': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'PMHNPs in Alaska can practice independently, including prescribing controlled substances, without physician oversight.',
    },
    'Arizona': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Arizona grants full practice authority to PMHNPs after completing a transition-to-practice period.',
    },
    'Colorado': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Colorado PMHNPs can practice independently and prescribe all medications including controlled substances.',
    },
    'Connecticut': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Connecticut allows independent PMHNP practice with full prescriptive authority.',
    },
    'Delaware': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Delaware PMHNPs have independent practice authority after meeting experience requirements.',
    },
    'District of Columbia': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Washington D.C. grants full practice authority to PMHNPs.',
    },
    'Hawaii': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Hawaii PMHNPs can practice independently with full prescriptive authority.',
    },
    'Idaho': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Idaho grants full practice authority to PMHNPs.',
    },
    'Iowa': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Iowa PMHNPs have independent practice and prescriptive authority.',
    },
    'Maine': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Maine allows independent PMHNP practice with full prescriptive authority.',
    },
    'Maryland': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Maryland grants full practice authority to PMHNPs.',
    },
    'Minnesota': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Minnesota PMHNPs can practice independently without physician oversight.',
    },
    'Montana': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Montana grants full practice authority to PMHNPs.',
    },
    'Nebraska': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Nebraska PMHNPs have full practice authority after a transition period.',
    },
    'Nevada': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Nevada grants full practice authority to PMHNPs after 2 years of supervised practice.',
    },
    'New Hampshire': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'New Hampshire PMHNPs can practice independently.',
    },
    'New Mexico': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'New Mexico grants full practice authority to PMHNPs.',
    },
    'North Dakota': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'North Dakota PMHNPs have independent practice authority.',
    },
    'Oregon': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Oregon grants full practice authority to PMHNPs.',
    },
    'Rhode Island': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Rhode Island PMHNPs can practice independently.',
    },
    'South Dakota': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'South Dakota grants full practice authority to PMHNPs.',
    },
    'Vermont': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Vermont PMHNPs have independent practice authority.',
    },
    'Washington': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Washington grants full practice authority to PMHNPs.',
    },
    'Wyoming': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Wyoming PMHNPs can practice independently.',
    },
    'Utah': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Utah grants full practice authority after completing a mentorship period.',
    },
    'Kansas': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Kansas PMHNPs have full independent practice authority.',
    },
    // New York and Massachusetts grant independence after a time-in-practice
    // period, which is how AANP classifies them and several states above
    // (Colorado, Connecticut, Maryland, Minnesota and others) as well. Both
    // were carried here as 'reduced' until the 2026-10 verification pass.
    'New York': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'New York PMHNPs with more than 3,600 hours of practice do not need a written practice agreement with a physician. Before that point, a written practice agreement and practice protocols are required.',
    },
    'Massachusetts': {
        authority: 'full',
        description: 'Full Practice Authority',
        details: 'Massachusetts PMHNPs can prescribe without supervision after two years of supervised practice. Before that point, prescriptive practice is supervised under written guidelines.',
    },

    // Reduced Practice States (12 states)
    'Alabama': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Alabama requires PMHNPs to have a collaborative agreement with a physician. The collaborating physician does not need to be on-site.',
    },
    'Arkansas': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Arkansas PMHNPs must have a collaborative practice agreement with a physician.',
    },
    'Illinois': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Illinois requires a written collaborative agreement for PMHNPs.',
    },
    'Indiana': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Indiana PMHNPs must practice under a collaborative agreement with a physician.',
    },
    'Kentucky': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Kentucky requires a collaborative agreement for PMHNP practice.',
    },
    'Louisiana': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Louisiana PMHNPs must have a collaborative practice agreement.',
    },
    'Mississippi': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Mississippi requires PMHNPs to have a collaborative practice agreement.',
    },
    'New Jersey': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'New Jersey PMHNPs need a collaborative agreement with a physician.',
    },
    'Ohio': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Ohio PMHNPs must have a standard care arrangement with a collaborating physician.',
    },
    'Pennsylvania': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Pennsylvania requires a collaborative agreement for PMHNP practice.',
    },
    'West Virginia': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'West Virginia PMHNPs must have a collaborative agreement with a physician.',
    },
    'Wisconsin': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Wisconsin requires PMHNPs to have a collaborative relationship with a physician.',
    },

    // Restricted Practice States (11 states)
    'California': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'California requires physician supervision for PMHNPs. Recent legislation (AB 890) is phasing in expanded practice authority through 2026.',
    },
    'Florida': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Florida requires physician supervision for PMHNP practice. PMHNPs must work under a supervisory protocol.',
    },
    'Georgia': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Georgia requires PMHNPs to practice under physician supervision with a protocol agreement.',
    },
    'Michigan': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Michigan requires a supervisory agreement between PMHNPs and physicians.',
    },
    'Missouri': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Missouri requires PMHNPs to have a collaborative practice arrangement with physician supervision.',
    },
    'North Carolina': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'North Carolina requires PMHNPs to practice under physician supervision.',
    },
    'Oklahoma': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Oklahoma requires physician supervision for PMHNPs.',
    },
    'South Carolina': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'South Carolina requires PMHNPs to practice under physician supervision with written protocols.',
    },
    'Tennessee': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Tennessee requires physician supervision for PMHNPs.',
    },
    'Texas': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Texas requires PMHNPs to have a prescriptive authority agreement with a supervising physician.',
    },
    'Virginia': {
        authority: 'restricted',
        description: 'Restricted Practice',
        details: 'Virginia requires a practice agreement with a supervising physician for PMHNPs.',
    },
};

/**
 * Get practice authority info for a state
 */
/**
 * How many jurisdictions in the table above grant Full Practice Authority,
 * and how to say it in prose.
 *
 * WHY THESE ARE DERIVED. Until 2026-09 the count was written by hand in three
 * places and all three disagreed with each other AND with this table: the
 * comment above said "27 states + DC", lib/stats-sources.ts said "27 states +
 * DC", and content/blog/pmhnp-private-practice-salary.mdx said "28 states +
 * DC" (including inside its FAQPage JSON-LD), while the table itself listed
 * 25 states plus the District of Columbia. Every practice-authority map, state
 * page and licensure surface renders from this table, so the map and the
 * sentence next to it were contradicting each other in front of readers and
 * answer engines. A derived count cannot drift from the data it describes.
 *
 * Adding or reclassifying a jurisdiction updates every surface automatically.
 */
const FULL_PRACTICE_JURISDICTIONS = Object.entries(STATE_PRACTICE_AUTHORITY)
    .filter(([, info]) => info.authority === 'full')
    .map(([name]) => name);

const DISTRICT_OF_COLUMBIA = 'District of Columbia';

/** Total jurisdictions with Full Practice Authority, DC included. */
export const FULL_PRACTICE_COUNT = FULL_PRACTICE_JURISDICTIONS.length;

/** Full Practice Authority states, excluding DC. */
export const FULL_PRACTICE_STATE_COUNT =
    FULL_PRACTICE_COUNT - (FULL_PRACTICE_JURISDICTIONS.includes(DISTRICT_OF_COLUMBIA) ? 1 : 0);

/**
 * Prose form, e.g. "27 states + DC". Use this anywhere the count is written
 * out; never retype the number.
 */
export const FULL_PRACTICE_SUMMARY = FULL_PRACTICE_JURISDICTIONS.includes(DISTRICT_OF_COLUMBIA)
    ? `${FULL_PRACTICE_STATE_COUNT} states + DC`
    : `${FULL_PRACTICE_STATE_COUNT} states`;

export function getStatePracticeAuthority(stateName: string): StatePracticeInfo | null {
    return STATE_PRACTICE_AUTHORITY[stateName] || null;
}

/**
 * Get all states with a specific practice authority level
 */
export function getStatesByAuthority(authority: PracticeAuthority): string[] {
    return Object.entries(STATE_PRACTICE_AUTHORITY)
        .filter(([, info]) => info.authority === authority)
        .map(([state]) => state);
}

/**
 * Get user-friendly label for practice authority
 */
export function getAuthorityLabel(authority: PracticeAuthority): string {
    switch (authority) {
        case 'full':
            return 'Full Practice Authority';
        case 'reduced':
            return 'Reduced Practice (Collaborative Agreement Required)';
        case 'restricted':
            return 'Restricted Practice (Physician Supervision Required)';
    }
}

/**
 * One-sentence consequence of a practice authority level for PMHNPs, as
 * rendered in the category-city FAQ. A switch on the union instead of
 * string matching: an earlier version tested includes('Full') against the
 * lowercase values, so every state, full practice ones included, was
 * described as requiring physician supervision.
 */
export function getAuthorityImplication(authority: PracticeAuthority): string {
    switch (authority) {
        case 'full':
            return 'PMHNPs can practice independently, prescribe medications, and diagnose without physician oversight.';
        case 'reduced':
            return 'PMHNPs require a collaborative agreement with a physician but can prescribe and diagnose under that arrangement.';
        case 'restricted':
            return 'PMHNPs must practice under physician supervision for prescribing and some clinical decisions.';
    }
}

/**
 * Get color class for practice authority badge
 */
export function getAuthorityColor(authority: PracticeAuthority): {
    bg: string;
    text: string;
    border: string;
} {
    switch (authority) {
        case 'full':
            return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' };
        case 'reduced':
            return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' };
        case 'restricted':
            return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' };
    }
}
