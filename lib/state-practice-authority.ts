/**
 * State Practice Authority Data for PMHNPs
 * 
 * Practice authority levels:
 * - FULL: PMHNPs can practice independently without physician oversight
 * - REDUCED: Requires a collaborative agreement with a physician
 * - RESTRICTED: Requires physician supervision for practice
 * 
 * Source: American Association of Nurse Practitioners (AANP) State Practice Environment
 * Last updated: 2026
 */

export type PracticeAuthority = 'full' | 'reduced' | 'restricted';

export interface StatePracticeInfo {
    authority: PracticeAuthority;
    description: string;
    details: string;
}

// Practice authority by state
export const STATE_PRACTICE_AUTHORITY: Record<string, StatePracticeInfo> = {
    // Full Practice Authority States (27 states + DC)
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
    'New York': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'New York requires a collaborative agreement for PMHNPs, though recent legislation is expanding autonomy.',
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
    'Massachusetts': {
        authority: 'reduced',
        description: 'Reduced Practice',
        details: 'Massachusetts requires PMHNPs to have a supervisory agreement, though requirements vary by practice setting.',
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
