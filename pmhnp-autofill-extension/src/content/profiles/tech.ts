/**
 * Tech Profile Patterns — Fields specific to software engineering,
 * IT, and technology roles.
 *
 * Covers: GitHub/portfolio links, programming languages,
 * tech stack, security clearance, and open-source contributions.
 */

import type { FieldPatternConfig } from './types';

export const TECH_PATTERNS: FieldPatternConfig = {
    name: 'tech',
    displayName: 'Software Engineering / IT',
    description: 'GitHub, portfolio, tech stack, security clearance',

    fieldMap: [
        // Links
        [/github/i, 'githubUrl'],
        [/portfolio|personal[-_\s]?(?:website|site|page)/i, 'portfolioUrl'],
        [/stack[-_\s]?overflow/i, 'stackOverflowUrl'],
        [/blog|writing[-_\s]?samples/i, 'blogUrl'],

        // Technical skills
        [/programming[-_\s]?lang|languages[-_\s]?(?:known|used)/i, 'programmingLanguages'],
        [/(?:tech[-_\s]?)?stack|technologies|frameworks/i, 'techStack'],
        [/(?:open[-_\s]?)?source[-_\s]?contrib/i, 'openSourceContributions'],

        // Coding assessment
        [/hackerrank|codility|leetcode|coding[-_\s]?(?:profile|score)/i, 'codingProfileUrl'],

        // Security
        [/(?:security[-_\s]?)?clearance/i, 'securityClearance'],
        [/(?:willing[-_\s]?)?(?:to[-_\s]?)?relocate/i, 'willingToRelocate'],
        [/remote[-_\s]?(?:work|preference)|work[-_\s]?(?:arrangement|preference|style)/i, 'workPreference'],

        // Notice / availability
        [/notice[-_\s]?period/i, 'noticePeriod'],
    ],

    strictFieldMap: [
        [/github/i, 'githubUrl'],
    ],

    dataAutomationMap: {},
    exactNameMap: {},
};
