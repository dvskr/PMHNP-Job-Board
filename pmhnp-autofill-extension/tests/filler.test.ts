/**
 * filler.test.ts — DOM Filling Tests
 *
 * Tests that core filler functions (fillTextInput, fillSelect, fillRadio,
 * fillCheckbox, verifyFill) correctly modify DOM elements across all ATS fixtures.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
    fillTextInput,
    fillSelect,
    fillRadio,
    fillCheckbox,
    verifyFill,
} from '../src/content/filler';

// ─── Helpers ───

function loadFixture(name: string): Document {
    const html = readFileSync(
        resolve(__dirname, 'fixtures', `${name}.html`),
        'utf-8',
    );
    document.documentElement.innerHTML = html;
    return document;
}

function getInput(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
}

function getByName(name: string, tag = 'input'): HTMLElement {
    return document.querySelector(`${tag}[name="${CSS.escape(name)}"]`) as HTMLElement;
}

function getSelect(idOrName: string): HTMLSelectElement {
    return (
        document.getElementById(idOrName) ||
        document.querySelector(`select[name="${CSS.escape(idOrName)}"]`)
    ) as HTMLSelectElement;
}

// ─── fillTextInput Tests ───

describe('fillTextInput', () => {
    describe('Lever fixture', () => {
        beforeEach(() => loadFixture('lever'));

        it('should fill the full name field', async () => {
            const el = getByName('name');
            await fillTextInput(el, 'Jane Smith');
            expect((el as HTMLInputElement).value).toBe('Jane Smith');
        });

        it('should fill the email field', async () => {
            const el = getByName('email');
            await fillTextInput(el, 'jane@example.com');
            expect((el as HTMLInputElement).value).toBe('jane@example.com');
        });

        it('should fill the phone field', async () => {
            const el = getByName('phone');
            await fillTextInput(el, '(512) 555-0199');
            expect((el as HTMLInputElement).value).toBe('(512) 555-0199');
        });

        it('should fill the location field', async () => {
            const el = getByName('location');
            await fillTextInput(el, 'Austin, TX');
            expect((el as HTMLInputElement).value).toBe('Austin, TX');
        });
    });

    describe('Workday fixture', () => {
        beforeEach(() => loadFixture('workday'));

        it('should fill first name via data-automation-id', async () => {
            const el = getInput('input-1');
            await fillTextInput(el, 'Jane');
            expect(el.value).toBe('Jane');
        });

        it('should fill last name via data-automation-id', async () => {
            const el = getInput('input-2');
            await fillTextInput(el, 'Smith');
            expect(el.value).toBe('Smith');
        });

        it('should fill address line 1', async () => {
            const el = getInput('input-5');
            await fillTextInput(el, '123 Main St');
            expect(el.value).toBe('123 Main St');
        });

        it('should fill city', async () => {
            const el = getInput('input-7');
            await fillTextInput(el, 'Austin');
            expect(el.value).toBe('Austin');
        });
    });

    describe('iCIMS fixture', () => {
        beforeEach(() => loadFixture('icims'));

        it('should fill NPI number', async () => {
            const el = getByName('npi');
            await fillTextInput(el, '1234567890');
            expect((el as HTMLInputElement).value).toBe('1234567890');
        });

        it('should fill salary expectation', async () => {
            const el = getByName('salary-expectation');
            await fillTextInput(el, '$120,000');
            expect((el as HTMLInputElement).value).toBe('$120,000');
        });
    });
});

// ─── fillSelect Tests ───

describe('fillSelect', () => {
    describe('Lever EEO selects', () => {
        beforeEach(() => loadFixture('lever'));

        it('should select Female for gender', async () => {
            const el = getByName('eeo[gender]', 'select');
            await fillSelect(el, 'Female');
            expect((el as HTMLSelectElement).value).toBe('Female');
        });

        it('should select race via prefix match', async () => {
            const el = getByName('eeo[race]', 'select');
            await fillSelect(el, 'White');
            // Lever has "White (Not Hispanic or Latino)" — prefix match
            expect((el as HTMLSelectElement).value).toBe('White (Not Hispanic or Latino)');
        });

        it('should select veteran status via substring match', async () => {
            const el = getByName('eeo[veteran]', 'select');
            await fillSelect(el, 'I am not a veteran');
            expect((el as HTMLSelectElement).value).toBe('I am not a veteran');
        });
    });

    describe('Workday selects', () => {
        beforeEach(() => loadFixture('workday'));

        it('should select state from dropdown', async () => {
            const el = getInput('input-8') as unknown as HTMLSelectElement;
            await fillSelect(el, 'Texas');
            expect(el.value).toBe('Texas');
        });

        it('should select country', async () => {
            const el = getInput('input-10') as unknown as HTMLSelectElement;
            await fillSelect(el, 'United States');
            expect(el.value).toBe('United States');
        });

        it('should select degree', async () => {
            const el = getInput('input-15') as unknown as HTMLSelectElement;
            await fillSelect(el, 'Master of Science in Nursing');
            expect(el.value).toBe('Master of Science in Nursing');
        });

        it('should select gender EEO', async () => {
            const el = getSelect('eeo-1');
            await fillSelect(el, 'Female');
            expect(el.value).toBe('Female');
        });

        it('should select ethnicity EEO', async () => {
            const el = getSelect('eeo-2');
            await fillSelect(el, 'White');
            expect(el.value).toBe('White');
        });
    });

    describe('SmartRecruiters selects', () => {
        beforeEach(() => loadFixture('smartrecruiters'));

        it('should select degree', async () => {
            const el = getByName('degree', 'select');
            await fillSelect(el, 'Master of Science in Nursing');
            expect((el as HTMLSelectElement).value).toBe('Master of Science in Nursing');
        });

        it('should select gender', async () => {
            const el = getSelect('sr-gender');
            await fillSelect(el, 'Female');
            expect(el.value).toBe('Female');
        });

        it('should select race via exact match', async () => {
            const el = getSelect('sr-ethnicity');
            await fillSelect(el, 'White');
            expect(el.value).toBe('White');
        });
    });

    describe('iCIMS selects', () => {
        beforeEach(() => loadFixture('icims'));

        it('should select state', async () => {
            const el = getByName('state', 'select');
            await fillSelect(el, 'Texas');
            expect((el as HTMLSelectElement).value).toBe('TX');
        });

        it('should select country', async () => {
            const el = getByName('country', 'select');
            await fillSelect(el, 'United States');
            expect((el as HTMLSelectElement).value).toBe('US');
        });
    });
});

// ─── fillRadio Tests ───

describe('fillRadio', () => {
    describe('SmartRecruiters radios', () => {
        beforeEach(() => loadFixture('smartrecruiters'));

        it('should select Yes for work authorization', async () => {
            const firstRadio = getByName('workAuthorization');
            await fillRadio(firstRadio, 'Yes');
            const yesRadio = document.querySelector<HTMLInputElement>(
                'input[name="workAuthorization"][value="Yes"]',
            );
            expect(yesRadio?.checked).toBe(true);
        });

        it('should select No for sponsorship', async () => {
            const firstRadio = getByName('sponsorship_q');
            await fillRadio(firstRadio, 'No');
            const noRadio = document.querySelector<HTMLInputElement>(
                'input[name="sponsorship_q"][value="No"]',
            );
            expect(noRadio?.checked).toBe(true);
        });
    });

    describe('boolean radio values', () => {
        beforeEach(() => loadFixture('smartrecruiters'));

        it('should handle boolean true → "yes"', async () => {
            const firstRadio = getByName('workAuthorization');
            await fillRadio(firstRadio, true);
            const yesRadio = document.querySelector<HTMLInputElement>(
                'input[name="workAuthorization"][value="Yes"]',
            );
            expect(yesRadio?.checked).toBe(true);
        });

        it('should handle boolean false → "no"', async () => {
            const firstRadio = getByName('sponsorship_q');
            await fillRadio(firstRadio, false);
            const noRadio = document.querySelector<HTMLInputElement>(
                'input[name="sponsorship_q"][value="No"]',
            );
            expect(noRadio?.checked).toBe(true);
        });
    });
});

// ─── fillCheckbox Tests ───

describe('fillCheckbox', () => {
    // Create a standalone checkbox for testing since most fixtures don't have one
    let checkbox: HTMLInputElement;

    beforeEach(() => {
        document.body.innerHTML = '<input type="checkbox" id="test-cb">';
        checkbox = getInput('test-cb');
    });

    it('should check an unchecked checkbox when value is true', async () => {
        expect(checkbox.checked).toBe(false);
        await fillCheckbox(checkbox, true);
        expect(checkbox.checked).toBe(true);
    });

    it('should uncheck a checked checkbox when value is false', async () => {
        checkbox.checked = true;
        await fillCheckbox(checkbox, false);
        expect(checkbox.checked).toBe(false);
    });

    it('should handle string "yes" as truthy', async () => {
        await fillCheckbox(checkbox, 'yes');
        expect(checkbox.checked).toBe(true);
    });

    it('should handle string "true" as truthy', async () => {
        await fillCheckbox(checkbox, 'true');
        expect(checkbox.checked).toBe(true);
    });

    it('should handle string "no" as falsy', async () => {
        checkbox.checked = true;
        await fillCheckbox(checkbox, 'no');
        expect(checkbox.checked).toBe(false);
    });

    it('should be idempotent — no-op if already correct', async () => {
        checkbox.checked = true;
        await fillCheckbox(checkbox, true);
        expect(checkbox.checked).toBe(true);
    });
});

// ─── verifyFill Tests ───

describe('verifyFill', () => {
    describe('text inputs', () => {
        beforeEach(() => loadFixture('lever'));

        it('should return true when value matches', async () => {
            const el = getByName('name') as HTMLInputElement;
            await fillTextInput(el, 'Jane Smith');
            expect(verifyFill(el, 'Jane Smith')).toBe(true);
        });

        it('should return false when value does not match', () => {
            const el = getByName('name') as HTMLInputElement;
            el.value = '';
            expect(verifyFill(el, 'Jane Smith')).toBe(false);
        });

        it('should be case-insensitive', async () => {
            const el = getByName('email') as HTMLInputElement;
            await fillTextInput(el, 'Jane@Example.com');
            expect(verifyFill(el, 'jane@example.com')).toBe(true);
        });
    });

    describe('select elements', () => {
        beforeEach(() => loadFixture('workday'));

        it('should verify select fill', async () => {
            const el = getSelect('eeo-1');
            await fillSelect(el, 'Female');
            expect(verifyFill(el, 'Female')).toBe(true);
        });
    });

    describe('checkboxes', () => {
        let checkbox: HTMLInputElement;

        beforeEach(() => {
            document.body.innerHTML = '<input type="checkbox" id="cb">';
            checkbox = getInput('cb');
        });

        it('should return true when checkbox state matches boolean', () => {
            checkbox.checked = true;
            expect(verifyFill(checkbox, true)).toBe(true);
        });

        it('should return false when checkbox state does not match', () => {
            checkbox.checked = false;
            expect(verifyFill(checkbox, true)).toBe(false);
        });
    });

    describe('radio buttons', () => {
        beforeEach(() => loadFixture('smartrecruiters'));

        it('should return true when radio is checked', async () => {
            const firstRadio = getByName('workAuthorization');
            await fillRadio(firstRadio, 'Yes');
            const yesRadio = document.querySelector<HTMLInputElement>(
                'input[name="workAuthorization"][value="Yes"]',
            );
            expect(verifyFill(yesRadio!, true)).toBe(true);
        });
    });
});
