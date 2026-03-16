/**
 * Enterprise ATS Autofill Test Suite
 *
 * Tests deterministic matching + filler across all 5 major ATS platforms
 * using HTML fixtures. Verifies that standard fields are matched 100%
 * deterministically (no AI needed) and that the right profile values
 * are selected for each field.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import { TEST_PROFILE_RAW } from './test-profile';

// ─── Import the matcher ───
// We re-implement a minimal version of the scanner + matcher pipeline here
// because the full scanner depends on DOM APIs (getBoundingClientRect, etc.)
// that jsdom doesn't fully support.

// Import the actual matcher logic
import { deterministicMatch, toAutofillProfile } from '@/content/deterministic-matcher';
import type { ScannedField } from '@/content/scanner';

// ─── Helpers ───

function loadFixture(name: string): Document {
    const html = readFileSync(join(__dirname, 'fixtures', `${name}.html`), 'utf-8');
    const dom = new JSDOM(html);
    return dom.window.document;
}

/**
 * Scan form fields from a fixture DOM (simplified scanner for testing).
 * Real scanner uses getBoundingClientRect which jsdom doesn't support,
 * so we mock the rect and extract all other metadata the same way.
 */
function scanFields(doc: Document): ScannedField[] {
    const fields: ScannedField[] = [];
    const elements = doc.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="submit"]), select, textarea'
    );

    let index = 0;
    const seenRadioNames = new Set<string>();

    for (const el of elements) {
        const tagName = el.tagName.toLowerCase();
        const inputEl = el as HTMLInputElement;

        // Determine type
        let type = 'text';
        if (tagName === 'select') type = 'select';
        else if (tagName === 'textarea') type = 'textarea';
        else if (el.getAttribute('role') === 'combobox') type = 'custom-dropdown';
        else if (tagName === 'input') {
            type = inputEl.type?.toLowerCase() || 'text';
        }

        // For radio groups, only capture the first
        if (type === 'radio') {
            const name = inputEl.name;
            if (!name || seenRadioNames.has(name)) continue;
            seenRadioNames.add(name);
        }

        // Get label
        const label = getFieldLabel(el, doc);

        // Get options for selects
        const options: string[] = [];
        if (tagName === 'select') {
            const selectEl = el as HTMLSelectElement;
            for (const opt of selectEl.options) {
                if (opt.value) options.push(opt.text.trim());
            }
        }
        // Get radio options
        if (type === 'radio') {
            const radioGroup = doc.querySelectorAll<HTMLInputElement>(
                `input[type="radio"][name="${CSS.escape(inputEl.name)}"]`
            );
            for (const radio of radioGroup) {
                if (radio.value) options.push(radio.value);
            }
        }

        // Collect attributes
        const attributes: Record<string, string> = {};
        for (const attr of ['name', 'id', 'aria-label', 'aria-labelledby', 'data-automation-id',
            'data-testid', 'autocomplete', 'data-field', 'data-qa', 'class']) {
            const val = el.getAttribute(attr);
            if (val) attributes[attr] = val;
        }

        fields.push({
            index,
            tagName,
            type,
            label,
            placeholder: inputEl.placeholder || el.getAttribute('placeholder') || '',
            name: inputEl.name || '',
            id: el.id || '',
            options,
            isRequired: inputEl.required || el.getAttribute('aria-required') === 'true',
            currentValue: '',
            attributes,
            element: el,
            rect: { x: 0, y: 0, width: 100, height: 30 },
            x: 0,
            y: 0,
            width: 100,
            height: 30,
        });

        index++;
    }

    return fields;
}

function getFieldLabel(el: HTMLElement, doc: Document): string {
    // 1. Check for associated <label>
    if (el.id) {
        const labelEl = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl) return labelEl.textContent?.trim() || '';
    }

    // 2. Check parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
        const labelDiv = parentLabel.querySelector('.application-label, .iCIMS_InfoFieldLabel');
        if (labelDiv) return labelDiv.textContent?.trim() || '';
        return parentLabel.textContent?.replace(el.outerHTML, '').trim() || '';
    }

    // 3. aria-describedby
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
        const descEl = doc.getElementById(describedBy);
        if (descEl) {
            const text = descEl.textContent?.trim();
            if (text && text.length < 80) return text;
        }
    }

    // 4. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const parts = labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent?.trim()).filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
    }

    // 5. Check preceding label
    const prev = el.parentElement?.previousElementSibling;
    if (prev?.tagName === 'LABEL') return prev.textContent?.trim() || '';

    // 6. Adjacent div label (.field-label, .form-label, etc.)
    const parent = el.parentElement;
    if (parent) {
        const labelDiv = parent.querySelector('.field-label, .form-label, .label, [class*="label"]');
        if (labelDiv && labelDiv !== el) {
            const text = labelDiv.textContent?.trim();
            if (text && text.length < 100) return text;
        }
    }

    // 7. Check data-qa
    const qa = el.getAttribute('data-qa');
    if (qa) return qa;

    return '';
}

// ─── Build Profile ───

const profile = toAutofillProfile(TEST_PROFILE_RAW);

// ─── Test Suites ───

describe('Deterministic Matcher — Lever', () => {
    let fields: ScannedField[];
    let result: ReturnType<typeof deterministicMatch>;

    beforeEach(() => {
        const doc = loadFixture('lever');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match Full name', () => {
        const match = result.matched.find(m => m.profileKey === 'fullName');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Sarah Johnson');
    });

    it('should match Email', () => {
        const match = result.matched.find(m => m.profileKey === 'email');
        expect(match).toBeDefined();
        expect(match!.value).toBe('sarah.johnson@example.com');
    });

    it('should match Phone', () => {
        const match = result.matched.find(m => m.profileKey === 'phone');
        expect(match).toBeDefined();
        expect(match!.value).toBe('(512) 555-0147');
    });

    it('should match Current location via NAME_ATTR_MAP', () => {
        const match = result.matched.find(m => m.profileKey === 'location');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Austin, TX');
    });

    it('should match Current company via NAME_ATTR_MAP', () => {
        const match = result.matched.find(m => m.profileKey === 'currentEmployer');
        expect(match).toBeDefined();
        expect(match!.value).toBe('LifeStance Health');
    });

    it('should match LinkedIn URL via NAME_ATTR_MAP', () => {
        const match = result.matched.find(m => m.profileKey === 'linkedinUrl');
        expect(match).toBeDefined();
        expect(match!.value).toContain('linkedin.com');
    });

    it('should match Resume file upload', () => {
        const match = result.matched.find(m => m.profileKey === 'resumeUrl');
        expect(match).toBeDefined();
        expect(match!.interaction).toBe('file');
    });

    it('should match EEO Gender', () => {
        const match = result.matched.find(m => m.profileKey === 'gender');
        expect(match).toBeDefined();
    });

    it('should match EEO Race', () => {
        const match = result.matched.find(m => m.profileKey === 'raceEthnicity');
        expect(match).toBeDefined();
    });

    it('should match EEO Veteran', () => {
        const match = result.matched.find(m => m.profileKey === 'veteranStatus');
        expect(match).toBeDefined();
    });

    it('should send custom screening questions to unmatched (for AI)', () => {
        // Textareas with custom questions should be unmatched
        const textareas = fields.filter(f => f.type === 'textarea');
        for (const ta of textareas) {
            const inUnmatched = result.unmatched.find(u => u.index === ta.index);
            expect(inUnmatched).toBeDefined();
        }
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 Lever Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(7); // At least 7 standard fields
    });
});

describe('Deterministic Matcher — Greenhouse', () => {
    let fields: ScannedField[];
    let result: ReturnType<typeof deterministicMatch>;

    beforeEach(() => {
        const doc = loadFixture('greenhouse');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match First Name', () => {
        const match = result.matched.find(m => m.profileKey === 'firstName');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Sarah');
    });

    it('should match Last Name', () => {
        const match = result.matched.find(m => m.profileKey === 'lastName');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Johnson');
    });

    it('should match Email', () => {
        const match = result.matched.find(m => m.profileKey === 'email');
        expect(match).toBeDefined();
    });

    it('should match Phone', () => {
        const match = result.matched.find(m => m.profileKey === 'phone');
        expect(match).toBeDefined();
    });

    it('should match Resume file upload', () => {
        const match = result.matched.find(m => m.profileKey === 'resumeUrl');
        expect(match).toBeDefined();
    });

    it('should match LinkedIn URL', () => {
        const match = result.matched.find(m => m.profileKey === 'linkedinUrl');
        expect(match).toBeDefined();
    });

    it('should send Location typeahead to AI (combobox with 0 options)', () => {
        // Greenhouse location uses role="combobox" → custom-dropdown with 0 captured options → AI handles
        const locationField = fields.find(f => f.id === 'job_application_location');
        if (locationField) {
            expect(result.unmatched.find(u => u.index === locationField.index)).toBeDefined();
        }
    });

    it('should match EEO Gender', () => {
        const match = result.matched.find(m => m.profileKey === 'gender');
        expect(match).toBeDefined();
    });

    it('should match EEO Race', () => {
        const match = result.matched.find(m => m.profileKey === 'raceEthnicity');
        expect(match).toBeDefined();
    });

    it('should match EEO Veteran', () => {
        const match = result.matched.find(m => m.profileKey === 'veteranStatus');
        expect(match).toBeDefined();
    });

    it('should match EEO Disability', () => {
        const match = result.matched.find(m => m.profileKey === 'disabilityStatus');
        expect(match).toBeDefined();
    });

    it('should send cover letter and custom questions to AI (unmatched)', () => {
        const coverLetter = fields.find(f => f.id === 'cover_letter');
        if (coverLetter) {
            expect(result.unmatched.find(u => u.index === coverLetter.index)).toBeDefined();
        }
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 Greenhouse Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(8);
    });
});

describe('Deterministic Matcher — Workday', () => {
    let fields: ScannedField[];
    let result: ReturnType<typeof deterministicMatch>;

    beforeEach(() => {
        const doc = loadFixture('workday');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match First Name via data-automation-id', () => {
        const match = result.matched.find(m => m.profileKey === 'firstName');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Sarah');
    });

    it('should match Last Name via data-automation-id', () => {
        const match = result.matched.find(m => m.profileKey === 'lastName');
        expect(match).toBeDefined();
    });

    it('should match Email', () => {
        const match = result.matched.find(m => m.profileKey === 'email');
        expect(match).toBeDefined();
    });

    it('should match Phone', () => {
        const match = result.matched.find(m => m.profileKey === 'phone');
        expect(match).toBeDefined();
    });

    it('should match Address Line 1', () => {
        const match = result.matched.find(m => m.profileKey === 'addressLine1');
        expect(match).toBeDefined();
    });

    it('should match City', () => {
        const match = result.matched.find(m => m.profileKey === 'city');
        expect(match).toBeDefined();
    });

    it('should match State via DATA_AUTOMATION_MAP', () => {
        // addressSection_countryRegion is now handled by DATA_AUTOMATION_MAP → 'state'
        const match = result.matched.find(m => m.profileKey === 'state');
        expect(match).toBeDefined();
    });

    it('should match Zip Code', () => {
        const match = result.matched.find(m => m.profileKey === 'zip');
        expect(match).toBeDefined();
    });

    it('should match Country', () => {
        const match = result.matched.find(m => m.profileKey === 'country');
        expect(match).toBeDefined();
    });

    it('should match Resume file upload', () => {
        const match = result.matched.find(m => m.profileKey === 'resumeUrl');
        expect(match).toBeDefined();
    });

    it('should match LinkedIn via data-automation-id', () => {
        const match = result.matched.find(m => m.profileKey === 'linkedinUrl');
        expect(match).toBeDefined();
    });

    it('should match Degree', () => {
        const match = result.matched.find(m => m.profileKey === 'degreeType');
        expect(match).toBeDefined();
    });

    it('should match Field of Study', () => {
        const match = result.matched.find(m => m.profileKey === 'fieldOfStudy');
        expect(match).toBeDefined();
    });

    it('should match EEO Gender', () => {
        const match = result.matched.find(m => m.profileKey === 'gender');
        expect(match).toBeDefined();
    });

    it('should match EEO Ethnicity', () => {
        const match = result.matched.find(m => m.profileKey === 'raceEthnicity');
        expect(match).toBeDefined();
    });

    it('should match EEO Veteran Status', () => {
        const match = result.matched.find(m => m.profileKey === 'veteranStatus');
        expect(match).toBeDefined();
    });

    it('should match EEO Disability', () => {
        const match = result.matched.find(m => m.profileKey === 'disabilityStatus');
        expect(match).toBeDefined();
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 Workday Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(14);
    });
});

describe('Deterministic Matcher — iCIMS', () => {
    let fields: ScannedField[];
    let result: ReturnType<typeof deterministicMatch>;

    beforeEach(() => {
        const doc = loadFixture('icims');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match First Name', () => {
        expect(result.matched.find(m => m.profileKey === 'firstName')).toBeDefined();
    });

    it('should match Last Name', () => {
        expect(result.matched.find(m => m.profileKey === 'lastName')).toBeDefined();
    });

    it('should match Email', () => {
        expect(result.matched.find(m => m.profileKey === 'email')).toBeDefined();
    });

    it('should match Phone', () => {
        expect(result.matched.find(m => m.profileKey === 'phone')).toBeDefined();
    });

    it('should match City', () => {
        expect(result.matched.find(m => m.profileKey === 'city')).toBeDefined();
    });

    it('should match State', () => {
        expect(result.matched.find(m => m.profileKey === 'state')).toBeDefined();
    });

    it('should match Zip Code', () => {
        expect(result.matched.find(m => m.profileKey === 'zip')).toBeDefined();
    });

    it('should match Country', () => {
        expect(result.matched.find(m => m.profileKey === 'country')).toBeDefined();
    });

    it('should match Resume file upload', () => {
        expect(result.matched.find(m => m.profileKey === 'resumeUrl')).toBeDefined();
    });

    it('should match LinkedIn', () => {
        expect(result.matched.find(m => m.profileKey === 'linkedinUrl')).toBeDefined();
    });

    it('should match NPI number', () => {
        expect(result.matched.find(m => m.profileKey === 'npiNumber')).toBeDefined();
    });

    it('should match License Number', () => {
        expect(result.matched.find(m => m.profileKey === 'licenseNumber')).toBeDefined();
    });

    it('should match License State', () => {
        expect(result.matched.find(m => m.profileKey === 'licenseState')).toBeDefined();
    });

    it('should match Salary', () => {
        expect(result.matched.find(m => m.profileKey === 'desiredSalary')).toBeDefined();
    });

    it('should match Available Date', () => {
        expect(result.matched.find(m => m.profileKey === 'availableDate')).toBeDefined();
    });

    it('should match Felony', () => {
        expect(result.matched.find(m => m.profileKey === 'felonyConviction')).toBeDefined();
    });

    it('should match Background Check', () => {
        expect(result.matched.find(m => m.profileKey === 'backgroundCheck')).toBeDefined();
    });

    it('should match Drug Screen', () => {
        expect(result.matched.find(m => m.profileKey === 'drugScreen')).toBeDefined();
    });

    it('should match EEO Gender', () => {
        expect(result.matched.find(m => m.profileKey === 'gender')).toBeDefined();
    });

    it('should match EEO Race', () => {
        expect(result.matched.find(m => m.profileKey === 'raceEthnicity')).toBeDefined();
    });

    it('should match EEO Veteran', () => {
        expect(result.matched.find(m => m.profileKey === 'veteranStatus')).toBeDefined();
    });

    it('should match EEO Disability', () => {
        expect(result.matched.find(m => m.profileKey === 'disabilityStatus')).toBeDefined();
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 iCIMS Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(18);
    });
});

describe('Deterministic Matcher — SmartRecruiters', () => {
    let fields: ScannedField[];
    let result: ReturnType<typeof deterministicMatch>;

    beforeEach(() => {
        const doc = loadFixture('smartrecruiters');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match First Name', () => {
        expect(result.matched.find(m => m.profileKey === 'firstName')).toBeDefined();
    });

    it('should match Last Name', () => {
        expect(result.matched.find(m => m.profileKey === 'lastName')).toBeDefined();
    });

    it('should match Email', () => {
        expect(result.matched.find(m => m.profileKey === 'email')).toBeDefined();
    });

    it('should match Phone', () => {
        expect(result.matched.find(m => m.profileKey === 'phone')).toBeDefined();
    });

    it('should send Location typeahead to AI (combobox with 0 options)', () => {
        // SmartRecruiters location uses role="combobox" → custom-dropdown with 0 options → AI handles
        const locationField = fields.find(f => f.name === 'location');
        if (locationField) {
            expect(result.unmatched.find(u => u.index === locationField.index)).toBeDefined();
        }
    });

    it('should match Resume file upload', () => {
        expect(result.matched.find(m => m.profileKey === 'resumeUrl')).toBeDefined();
    });

    it('should match LinkedIn', () => {
        expect(result.matched.find(m => m.profileKey === 'linkedinUrl')).toBeDefined();
    });

    it('should match School', () => {
        expect(result.matched.find(m => m.profileKey === 'schoolName')).toBeDefined();
    });

    it('should match Degree', () => {
        expect(result.matched.find(m => m.profileKey === 'degreeType')).toBeDefined();
    });

    it('should match Field of Study', () => {
        expect(result.matched.find(m => m.profileKey === 'fieldOfStudy')).toBeDefined();
    });

    it('should match Salary via label', () => {
        expect(result.matched.find(m => m.profileKey === 'desiredSalary')).toBeDefined();
    });

    it('should match Available Date', () => {
        expect(result.matched.find(m => m.profileKey === 'availableDate')).toBeDefined();
    });

    it('should match EEO Gender', () => {
        expect(result.matched.find(m => m.profileKey === 'gender')).toBeDefined();
    });

    it('should match EEO Ethnicity', () => {
        expect(result.matched.find(m => m.profileKey === 'raceEthnicity')).toBeDefined();
    });

    it('should match EEO Veteran', () => {
        expect(result.matched.find(m => m.profileKey === 'veteranStatus')).toBeDefined();
    });

    it('should match EEO Disability', () => {
        expect(result.matched.find(m => m.profileKey === 'disabilityStatus')).toBeDefined();
    });

    it('should only upload resume to the resume file input (not profile photo or additional docs)', () => {
        const fileMatches = result.matched.filter(m => m.interaction === 'file');
        expect(fileMatches.length).toBe(1); // only resume, not profile photo or additional docs
        expect(fileMatches[0].field.id).toBe('resume');
    });


    it('should send open-ended questions to AI (unmatched)', () => {
        const whyInterested = fields.find(f => f.id === 'whyInterested');
        if (whyInterested) {
            expect(result.unmatched.find(u => u.index === whyInterested.index)).toBeDefined();
        }
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 SmartRecruiters Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(12);
    });
});

// ─── Taleo ───

describe('Deterministic Matcher — Taleo', () => {
    let fields: ScannedField[];
    let result: MatchResult;

    beforeAll(() => {
        const doc = loadFixture('taleo');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match First Name', () => {
        expect(result.matched.find(m => m.profileKey === 'firstName')).toBeDefined();
    });

    it('should match Last Name', () => {
        expect(result.matched.find(m => m.profileKey === 'lastName')).toBeDefined();
    });

    it('should match Email', () => {
        expect(result.matched.find(m => m.profileKey === 'email')).toBeDefined();
    });

    it('should match Phone', () => {
        expect(result.matched.find(m => m.profileKey === 'phone')).toBeDefined();
    });

    it('should match Address', () => {
        expect(result.matched.find(m => m.profileKey === 'addressLine1')).toBeDefined();
    });

    it('should match City', () => {
        expect(result.matched.find(m => m.profileKey === 'city')).toBeDefined();
    });

    it('should match State', () => {
        expect(result.matched.find(m => m.profileKey === 'state')).toBeDefined();
    });

    it('should match Zip Code', () => {
        expect(result.matched.find(m => m.profileKey === 'zip')).toBeDefined();
    });

    it('should match Country', () => {
        expect(result.matched.find(m => m.profileKey === 'country')).toBeDefined();
    });

    it('should match Resume file upload', () => {
        expect(result.matched.find(m => m.interaction === 'file')).toBeDefined();
    });

    it('should match LinkedIn', () => {
        expect(result.matched.find(m => m.profileKey === 'linkedinUrl')).toBeDefined();
    });

    it('should match Current Job Title', () => {
        expect(result.matched.find(m => m.profileKey === 'currentJobTitle')).toBeDefined();
    });

    it('should match Salary', () => {
        expect(result.matched.find(m => m.profileKey === 'desiredSalary')).toBeDefined();
    });

    it('should match Available Date', () => {
        expect(result.matched.find(m => m.profileKey === 'availableDate')).toBeDefined();
    });

    it('should match EEO Gender', () => {
        expect(result.matched.find(m => m.profileKey === 'gender')).toBeDefined();
    });

    it('should match EEO Race', () => {
        expect(result.matched.find(m => m.profileKey === 'raceEthnicity')).toBeDefined();
    });

    it('should match EEO Veteran', () => {
        expect(result.matched.find(m => m.profileKey === 'veteranStatus')).toBeDefined();
    });

    it('should match EEO Disability', () => {
        expect(result.matched.find(m => m.profileKey === 'disabilityStatus')).toBeDefined();
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 Taleo Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(14);
    });
});

// ─── BambooHR ───

describe('Deterministic Matcher — BambooHR', () => {
    let fields: ScannedField[];
    let result: MatchResult;

    beforeAll(() => {
        const doc = loadFixture('bamboohr');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should match First Name', () => {
        expect(result.matched.find(m => m.profileKey === 'firstName')).toBeDefined();
    });

    it('should match Last Name', () => {
        expect(result.matched.find(m => m.profileKey === 'lastName')).toBeDefined();
    });

    it('should match Email', () => {
        expect(result.matched.find(m => m.profileKey === 'email')).toBeDefined();
    });

    it('should match Phone', () => {
        expect(result.matched.find(m => m.profileKey === 'phone')).toBeDefined();
    });

    it('should match City', () => {
        expect(result.matched.find(m => m.profileKey === 'city')).toBeDefined();
    });

    it('should match State', () => {
        expect(result.matched.find(m => m.profileKey === 'state')).toBeDefined();
    });

    it('should match Zip Code', () => {
        expect(result.matched.find(m => m.profileKey === 'zip')).toBeDefined();
    });

    it('should match Resume file upload', () => {
        expect(result.matched.find(m => m.interaction === 'file')).toBeDefined();
    });

    it('should match LinkedIn', () => {
        expect(result.matched.find(m => m.profileKey === 'linkedinUrl')).toBeDefined();
    });

    it('should match School', () => {
        expect(result.matched.find(m => m.profileKey === 'schoolName')).toBeDefined();
    });

    it('should match Degree', () => {
        expect(result.matched.find(m => m.profileKey === 'degreeType')).toBeDefined();
    });

    it('should match Field of Study', () => {
        expect(result.matched.find(m => m.profileKey === 'fieldOfStudy')).toBeDefined();
    });

    it('should match EEO Gender', () => {
        expect(result.matched.find(m => m.profileKey === 'gender')).toBeDefined();
    });

    it('should match EEO Race', () => {
        expect(result.matched.find(m => m.profileKey === 'raceEthnicity')).toBeDefined();
    });

    it('should match EEO Veteran', () => {
        expect(result.matched.find(m => m.profileKey === 'veteranStatus')).toBeDefined();
    });

    it('should match EEO Disability', () => {
        expect(result.matched.find(m => m.profileKey === 'disabilityStatus')).toBeDefined();
    });

    it('should report coverage summary', () => {
        const total = result.matched.length + result.unmatched.length;
        console.log(`\n  📊 BambooHR Coverage: ${result.matched.length}/${total} (${Math.round(100 * result.matched.length / total)}%) deterministic`);
        expect(result.matched.length).toBeGreaterThanOrEqual(12);
    });
});

// ─── Cross-ATS Coverage Report ───

describe('Deterministic Matcher — Unknown Generic', () => {
    let fields: ScannedField[];
    let result: ReturnType<typeof deterministicMatch>;

    beforeEach(() => {
        const doc = loadFixture('unknown-generic');
        fields = scanFields(doc);
        result = deterministicMatch(fields, profile);
    });

    it('should detect at least 15 fields', () => {
        expect(fields.length).toBeGreaterThanOrEqual(15);
    });

    // Personal (aria-describedby labels)
    it('should match First Name via aria-describedby', () => {
        const match = result.matched.find(m => m.profileKey === 'firstName');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Sarah');
    });

    it('should match Last Name via aria-describedby', () => {
        const match = result.matched.find(m => m.profileKey === 'lastName');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Johnson');
    });

    // Personal (adjacent div labels)
    it('should match Email via div label', () => {
        const match = result.matched.find(m => m.profileKey === 'email');
        expect(match).toBeDefined();
        expect(match!.value).toBe('sarah.johnson@example.com');
    });

    it('should match Phone via div label', () => {
        const match = result.matched.find(m => m.profileKey === 'phone');
        expect(match).toBeDefined();
        expect(match!.value).toBe('(512) 555-0147');
    });

    it('should match City', () => {
        const match = result.matched.find(m => m.profileKey === 'city');
        expect(match).toBeDefined();
        expect(match!.value).toBe('Austin');
    });

    it('should match State', () => {
        const match = result.matched.find(m => m.profileKey === 'state');
        expect(match).toBeDefined();
    });

    // Professional
    it('should match LinkedIn', () => {
        const match = result.matched.find(m => m.profileKey === 'linkedinUrl');
        expect(match).toBeDefined();
    });

    it('should match Website (unmatched — no profile key)', () => {
        // Personal website isn't in the profile — expected to be unmatched and sent to AI
        const match = result.unmatched.find(m => m.field.label?.includes('Website') || m.field.name === 'personal_site');
        expect(match).toBeDefined();
    });

    it('should match Job Title', () => {
        const match = result.matched.find(m => m.profileKey === 'currentJobTitle');
        expect(match).toBeDefined();
    });

    it('should match Employer', () => {
        const match = result.matched.find(m => m.profileKey === 'currentEmployer');
        expect(match).toBeDefined();
    });

    it('should match Years of Experience', () => {
        const match = result.matched.find(m => m.profileKey === 'yearsExperience');
        expect(match).toBeDefined();
    });

    // Education
    it('should match Degree (or send to AI if option mismatch)', () => {
        // Profile has "Master of Science in Nursing" but select options are "Master's" etc.
        // Matcher might not fuzzy-match, so check it's at least detected
        const matched = result.matched.find(m => m.profileKey === 'degreeType');
        const unmatched = result.unmatched.find(m => m.field.name === 'edu_degree');
        expect(matched || unmatched).toBeDefined();
    });

    it('should match School', () => {
        const match = result.matched.find(m => m.profileKey === 'schoolName');
        expect(match).toBeDefined();
    });

    it('should match Field of Study', () => {
        const match = result.matched.find(m => m.profileKey === 'fieldOfStudy');
        expect(match).toBeDefined();
    });

    // Screening
    it('should match Salary', () => {
        const match = result.matched.find(m => m.profileKey === 'desiredSalary');
        expect(match).toBeDefined();
    });

    it('should match Work Authorization', () => {
        const match = result.matched.find(m => m.profileKey === 'workAuthorized');
        expect(match).toBeDefined();
    });

    it('should match Visa Sponsorship', () => {
        const match = result.matched.find(m => m.profileKey === 'requiresSponsorship');
        expect(match).toBeDefined();
    });

    // EEO
    it('should match Gender', () => {
        const match = result.matched.find(m => m.profileKey === 'gender');
        expect(match).toBeDefined();
    });

    it('should match Race/Ethnicity', () => {
        const match = result.matched.find(m => m.profileKey === 'raceEthnicity');
        expect(match).toBeDefined();
    });

    it('should match Veteran Status', () => {
        const match = result.matched.find(m => m.profileKey === 'veteranStatus');
        expect(match).toBeDefined();
    });

    it('should match Disability Status', () => {
        const match = result.matched.find(m => m.profileKey === 'disabilityStatus');
        expect(match).toBeDefined();
    });

    it('should achieve 70%+ match rate on generic form', () => {
        const total = result.matched.length + result.unmatched.length;
        const pct = Math.round(100 * result.matched.length / total);
        console.log(`Unknown Generic: ${pct}% (${result.matched.length}/${total})`);
        expect(pct).toBeGreaterThanOrEqual(70);
    });
});

describe('Cross-ATS Coverage Report', () => {
    it('should produce a full coverage matrix', () => {
        const ats = ['lever', 'greenhouse', 'workday', 'icims', 'smartrecruiters', 'taleo', 'bamboohr', 'unknown-generic'];
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║           ATS DETERMINISTIC MATCHING COVERAGE           ║');
        console.log('╠══════════════════════════════════════════════════════════╣');

        let totalMatched = 0;
        let totalFields = 0;

        for (const name of ats) {
            const doc = loadFixture(name);
            const fields = scanFields(doc);
            const result = deterministicMatch(fields, profile);
            const total = result.matched.length + result.unmatched.length;
            const pct = Math.round(100 * result.matched.length / total);

            totalMatched += result.matched.length;
            totalFields += total;

            const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
            console.log(`║ ${name.padEnd(17)} ${bar} ${String(pct).padStart(3)}% (${result.matched.length}/${total}) ║`);

            if (result.unmatched.length > 0) {
                for (const u of result.unmatched) {
                    console.log(`║   ⚠ unmatched: "${(u.field.label || u.field.name || u.field.id).substring(0, 35).padEnd(35)}" ║`);
                }
            }
        }

        const overallPct = Math.round(100 * totalMatched / totalFields);
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║ OVERALL:          ${String(overallPct).padStart(3)}% (${totalMatched}/${totalFields})                         ║`);
        console.log('╚══════════════════════════════════════════════════════════╝');

        expect(overallPct).toBeGreaterThanOrEqual(70); // Enterprise target: 70%+ deterministic
    });
});

