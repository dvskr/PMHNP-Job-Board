/**
 * Profile Registry Test Suite
 *
 * Tests getActiveFieldPatterns(), getAvailableProfiles(),
 * pattern merging priority, and individual profile configs.
 */

import { describe, it, expect } from 'vitest';
import {
    getActiveFieldPatterns,
    getAvailableProfiles,
    CORE_PATTERNS,
    HEALTHCARE_PATTERNS,
    TECH_PATTERNS,
} from '@/content/profiles';

// ─── Core Patterns ───

describe('Profile Registry — Core Patterns', () => {
    it('should have a name and displayName', () => {
        expect(CORE_PATTERNS.name).toBe('core');
        expect(CORE_PATTERNS.displayName).toBeTruthy();
    });

    it('should include firstName pattern', () => {
        const match = CORE_PATTERNS.fieldMap.find(([, key]) => key === 'firstName');
        expect(match).toBeDefined();
        expect(match![0].test('first_name')).toBe(true);
        expect(match![0].test('firstName')).toBe(true);
    });

    it('should include email pattern', () => {
        const match = CORE_PATTERNS.fieldMap.find(([, key]) => key === 'email');
        expect(match).toBeDefined();
    });

    it('should include EEO patterns', () => {
        const eeoKeys = ['workAuthorized', 'requiresSponsorship', 'veteranStatus', 'gender', 'raceEthnicity'];
        for (const key of eeoKeys) {
            const match = CORE_PATTERNS.fieldMap.find(([, k]) => k === key);
            expect(match, `Missing EEO pattern for ${key}`).toBeDefined();
        }
    });

    it('should include Workday data-automation-id mappings', () => {
        expect(CORE_PATTERNS.dataAutomationMap).toBeDefined();
        expect(CORE_PATTERNS.dataAutomationMap!['legalNameSection_firstName']).toBe('firstName');
        expect(CORE_PATTERNS.dataAutomationMap!['addressSection_city']).toBe('city');
        expect(CORE_PATTERNS.dataAutomationMap!['phone-number']).toBe('phone');
    });

    it('should include Lever exact-name mappings', () => {
        expect(CORE_PATTERNS.exactNameMap).toBeDefined();
        expect(CORE_PATTERNS.exactNameMap!['name']).toBe('fullName');
        expect(CORE_PATTERNS.exactNameMap!['email']).toBe('email');
        expect(CORE_PATTERNS.exactNameMap!['urls[linkedin]']).toBe('linkedinUrl');
    });

    it('should have strict patterns for employer/headline', () => {
        expect(CORE_PATTERNS.strictFieldMap).toBeDefined();
        expect(CORE_PATTERNS.strictFieldMap!.length).toBeGreaterThanOrEqual(2);
        const employerStrict = CORE_PATTERNS.strictFieldMap!.find(([, key]) => key === 'currentEmployer');
        expect(employerStrict).toBeDefined();
    });
});

// ─── Healthcare Patterns ───

describe('Profile Registry — Healthcare Patterns', () => {
    it('should have correct name and displayName', () => {
        expect(HEALTHCARE_PATTERNS.name).toBe('healthcare');
        expect(HEALTHCARE_PATTERNS.displayName).toContain('Healthcare');
    });

    it('should include NPI pattern', () => {
        const match = HEALTHCARE_PATTERNS.fieldMap.find(([, key]) => key === 'npiNumber');
        expect(match).toBeDefined();
        expect(match![0].test('npi')).toBe(true);
        expect(match![0].test('NPI Number')).toBe(true);
    });

    it('should include DEA pattern', () => {
        const match = HEALTHCARE_PATTERNS.fieldMap.find(([, key]) => key === 'deaNumber');
        expect(match).toBeDefined();
        expect(match![0].test('dea_number')).toBe(true);
    });

    it('should include license patterns', () => {
        const licenseKeys = ['licenseType', 'licenseNumber', 'licenseState'];
        for (const key of licenseKeys) {
            const match = HEALTHCARE_PATTERNS.fieldMap.find(([, k]) => k === key);
            expect(match, `Missing license pattern for ${key}`).toBeDefined();
        }
    });

    it('should include specialty pattern', () => {
        const match = HEALTHCARE_PATTERNS.fieldMap.find(([, key]) => key === 'primarySpecialty');
        expect(match).toBeDefined();
        expect(match![0].test('specialty')).toBe(true);
        expect(match![0].test('Primary Specialty')).toBe(true);
    });

    it('should include telehealth pattern', () => {
        const match = HEALTHCARE_PATTERNS.fieldMap.find(([, key]) => key === 'telehealthExperience');
        expect(match).toBeDefined();
        expect(match![0].test('telehealth')).toBe(true);
    });

    it('should NOT duplicate core patterns (no firstName, email, etc.)', () => {
        const coreOnlyKeys = ['firstName', 'lastName', 'email', 'phone', 'city', 'state'];
        for (const key of coreOnlyKeys) {
            const match = HEALTHCARE_PATTERNS.fieldMap.find(([, k]) => k === key);
            expect(match, `Healthcare should NOT have core pattern ${key}`).toBeUndefined();
        }
    });
});

// ─── Tech Patterns ───

describe('Profile Registry — Tech Patterns', () => {
    it('should have correct name and displayName', () => {
        expect(TECH_PATTERNS.name).toBe('tech');
        expect(TECH_PATTERNS.displayName).toContain('Software');
    });

    it('should include GitHub pattern', () => {
        const match = TECH_PATTERNS.fieldMap.find(([, key]) => key === 'githubUrl');
        expect(match).toBeDefined();
        expect(match![0].test('github')).toBe(true);
        expect(match![0].test('GitHub Profile')).toBe(true);
    });

    it('should include portfolio pattern', () => {
        const match = TECH_PATTERNS.fieldMap.find(([, key]) => key === 'portfolioUrl');
        expect(match).toBeDefined();
        expect(match![0].test('portfolio')).toBe(true);
        expect(match![0].test('personal_website')).toBe(true);
    });

    it('should include tech stack pattern', () => {
        const match = TECH_PATTERNS.fieldMap.find(([, key]) => key === 'techStack');
        expect(match).toBeDefined();
        expect(match![0].test('tech_stack')).toBe(true);
        expect(match![0].test('technologies')).toBe(true);
    });

    it('should include security clearance pattern', () => {
        const match = TECH_PATTERNS.fieldMap.find(([, key]) => key === 'securityClearance');
        expect(match).toBeDefined();
        expect(match![0].test('security clearance')).toBe(true);
    });

    it('should NOT duplicate core patterns', () => {
        const coreOnlyKeys = ['firstName', 'email', 'phone', 'workAuthorized'];
        for (const key of coreOnlyKeys) {
            const match = TECH_PATTERNS.fieldMap.find(([, k]) => k === key);
            expect(match, `Tech should NOT have core pattern ${key}`).toBeUndefined();
        }
    });
});

// ─── getActiveFieldPatterns ───

describe('Profile Registry — getActiveFieldPatterns', () => {
    it('should return only core patterns when industry is "none"', () => {
        const result = getActiveFieldPatterns('none');
        expect(result.fieldMap.length).toBe(CORE_PATTERNS.fieldMap.length);
    });

    it('should default to "none" when called without arguments', () => {
        const result = getActiveFieldPatterns();
        expect(result.fieldMap.length).toBe(CORE_PATTERNS.fieldMap.length);
    });

    it('should merge healthcare patterns with core', () => {
        const result = getActiveFieldPatterns('healthcare');
        const expectedLength = HEALTHCARE_PATTERNS.fieldMap.length + CORE_PATTERNS.fieldMap.length;
        expect(result.fieldMap.length).toBe(expectedLength);
    });

    it('should merge tech patterns with core', () => {
        const result = getActiveFieldPatterns('tech');
        const expectedLength = TECH_PATTERNS.fieldMap.length + CORE_PATTERNS.fieldMap.length;
        expect(result.fieldMap.length).toBe(expectedLength);
    });

    it('should prepend industry patterns (higher priority)', () => {
        const result = getActiveFieldPatterns('healthcare');
        // First pattern should be from healthcare, not core
        const firstKey = result.fieldMap[0][1];
        const isHealthcareKey = HEALTHCARE_PATTERNS.fieldMap.some(([, k]) => k === firstKey);
        expect(isHealthcareKey).toBe(true);
    });

    it('should have core patterns at the end (fallback)', () => {
        const result = getActiveFieldPatterns('healthcare');
        const lastKey = result.fieldMap[result.fieldMap.length - 1][1];
        const isCoreKey = CORE_PATTERNS.fieldMap.some(([, k]) => k === lastKey);
        expect(isCoreKey).toBe(true);
    });

    it('should merge data-automation-id maps (industry overrides core)', () => {
        const result = getActiveFieldPatterns('healthcare');
        // Core mappings should be present
        expect(result.dataAutomationMap['legalNameSection_firstName']).toBe('firstName');
        // Healthcare mappings should override/add
        expect(result.dataAutomationMap['npiNumber']).toBe('npiNumber');
    });

    it('should merge exact-name maps', () => {
        const result = getActiveFieldPatterns('healthcare');
        // Core exact-name mappings should be present
        expect(result.exactNameMap['name']).toBe('fullName');
        expect(result.exactNameMap['email']).toBe('email');
    });

    it('should merge strict field maps', () => {
        const result = getActiveFieldPatterns('tech');
        // Tech has github in strict, core has employer/headline
        expect(result.strictFieldMap.length).toBeGreaterThanOrEqual(3);
    });
});

// ─── getAvailableProfiles ───

describe('Profile Registry — getAvailableProfiles', () => {
    it('should return an array of profiles', () => {
        const profiles = getAvailableProfiles();
        expect(Array.isArray(profiles)).toBe(true);
        expect(profiles.length).toBeGreaterThanOrEqual(3);
    });

    it('should include "none" (Universal Only) option', () => {
        const profiles = getAvailableProfiles();
        const none = profiles.find(p => p.id === 'none');
        expect(none).toBeDefined();
        expect(none!.displayName).toBe('Universal Only');
    });

    it('should include healthcare option', () => {
        const profiles = getAvailableProfiles();
        const healthcare = profiles.find(p => p.id === 'healthcare');
        expect(healthcare).toBeDefined();
        expect(healthcare!.displayName).toContain('Healthcare');
        expect(healthcare!.description).toBeTruthy();
    });

    it('should include tech option', () => {
        const profiles = getAvailableProfiles();
        const tech = profiles.find(p => p.id === 'tech');
        expect(tech).toBeDefined();
        expect(tech!.displayName).toContain('Software');
        expect(tech!.description).toBeTruthy();
    });

    it('each profile should have id, displayName, and description', () => {
        const profiles = getAvailableProfiles();
        for (const profile of profiles) {
            expect(profile.id).toBeTruthy();
            expect(profile.displayName).toBeTruthy();
            expect(profile.description).toBeTruthy();
        }
    });
});

// ─── Pattern matching specificity ───

describe('Profile Registry — Pattern Specificity', () => {
    it('healthcare NPI should match before core patterns', () => {
        const result = getActiveFieldPatterns('healthcare');
        // The NPI pattern should be found early (in the healthcare section)
        const npiIndex = result.fieldMap.findIndex(([, key]) => key === 'npiNumber');
        const emailIndex = result.fieldMap.findIndex(([, key]) => key === 'email');
        expect(npiIndex).toBeLessThan(emailIndex);
    });

    it('healthcare license-state should match before generic state', () => {
        const result = getActiveFieldPatterns('healthcare');
        const licenseStateIndex = result.fieldMap.findIndex(([, key]) => key === 'licenseState');
        const stateIndex = result.fieldMap.findIndex(([, key]) => key === 'state');
        expect(licenseStateIndex).toBeLessThan(stateIndex);
    });

    it('tech github should match before core linkedin', () => {
        const result = getActiveFieldPatterns('tech');
        const githubIndex = result.fieldMap.findIndex(([, key]) => key === 'githubUrl');
        const linkedinIndex = result.fieldMap.findIndex(([, key]) => key === 'linkedinUrl');
        expect(githubIndex).toBeLessThan(linkedinIndex);
    });

    it('"npi" input should match npiNumber on healthcare profile', () => {
        const result = getActiveFieldPatterns('healthcare');
        const testString = 'npi_number';
        const matchedKey = result.fieldMap.find(([pattern]) => pattern.test(testString))?.[1];
        expect(matchedKey).toBe('npiNumber');
    });

    it('"first_name" input should match firstName on any profile', () => {
        for (const profile of ['none', 'healthcare', 'tech'] as const) {
            const result = getActiveFieldPatterns(profile);
            const testString = 'first_name';
            const matchedKey = result.fieldMap.find(([pattern]) => pattern.test(testString))?.[1];
            expect(matchedKey, `Failed for profile: ${profile}`).toBe('firstName');
        }
    });
});
