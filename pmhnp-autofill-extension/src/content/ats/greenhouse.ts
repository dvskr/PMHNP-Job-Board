/**
 * Greenhouse ATS Handler
 * Verified against real DOM: https://job-boards.greenhouse.io/sondermind/jobs/7541267003
 *
 * DOM structure (verified 2026-02-18):
 *   Form:           form#application-form.application--form
 *   First name:     input#first_name             class="input input__single-line"
 *   Last name:      input#last_name              class="input input__single-line"
 *   Preferred name: input#preferred_name          class="input input__single-line"
 *   Email:          input#email                   class="input input__single-line"
 *   Phone:          input#phone                   class="input input__single-line iti__tel-input"  (intl-tel-input)
 *   Country:        input#country                 class="select__input"  (React-Select)
 *   Resume:         input#resume                  type="file"  class="visually-hidden"
 *   Cover letter:   input#cover_letter            type="file"  class="visually-hidden"
 *   Custom Q:       input#question_XXXXXXXXXXX    class="input input__single-line"
 *   Submit:         button.btn.btn--pill           text="Submit application"
 *   Field wrapper:  .input-wrapper
 *   Label pattern:  label[for="FIELD_ID"] or label#FIELD_ID-label
 */

import type { ATSHandler, DetectedField, MappedField, FillDetail, FieldCategory } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';
import { log } from '@/shared/logger';

/** Verified Greenhouse field ID → identifier mapping */
const GREENHOUSE_ID_MAP: Record<string, { identifier: string; category?: FieldCategory }> = {

    first_name: { identifier: 'first_name' },
    last_name: { identifier: 'last_name' },
    preferred_name: { identifier: 'preferred_name' },
    email: { identifier: 'email' },
    phone: { identifier: 'phone' },
    country: { identifier: 'country' },
    resume: { identifier: 'resume_upload', category: 'document' },
    cover_letter: { identifier: 'cover_letter_upload', category: 'document' },
    location: { identifier: 'city' },
};

/** Detect Greenhouse by URL or DOM markers */
function isGreenhouse(): boolean {
    const url = window.location.href.toLowerCase();
    if (url.includes('boards.greenhouse.io') || url.includes('job-boards.greenhouse.io')) return true;
    // Some companies embed Greenhouse — detect by form id
    return !!document.getElementById('application-form')?.classList.contains('application--form');
}

/**
 * Detect Greenhouse fields using verified id attributes.
 * Greenhouse uses simple ids like #first_name, #email, #phone.
 * Custom questions follow the pattern #question_XXXXXXXXXXX.
 */
function detectGreenhouseFields(): DetectedField[] {
    const fields = detectFormFields();

    for (const field of fields) {
        const id = field.id.toLowerCase();

        // --- Standard fields by id ---
        for (const [ghId, mapping] of Object.entries(GREENHOUSE_ID_MAP)) {
            if (id === ghId) {
                field.identifier = mapping.identifier;
                field.confidence = 0.98;
                field.atsSpecific = true;
                if (mapping.category) {
                    field.fieldCategory = mapping.category;
                }
                break;
            }
        }

        // --- Custom questions: pattern question_XXXXXXXXXXX ---
        if (id.startsWith('question_')) {
            field.atsSpecific = true;
            field.confidence = 0.85;

            // Try to identify LinkedIn/website by label text
            const label = field.label?.toLowerCase() || '';
            if (label.includes('linkedin')) {
                field.identifier = 'linkedin';
                field.confidence = 0.95;
            } else if (label.includes('website') || label.includes('portfolio')) {
                field.identifier = 'website';
                field.confidence = 0.9;
            } else if (field.fieldType === 'textarea') {
                field.identifier = 'open_ended_question';
                field.fieldCategory = 'open_ended';
            }
        }

        // --- Legacy pattern (some embedded Greenhouse forms) ---
        if (id.includes('job_application_answers_attributes')) {
            field.atsSpecific = true;
            if (field.fieldType === 'textarea') {
                field.identifier = 'open_ended_question';
                field.fieldCategory = 'open_ended';
            }
        }
    }

    return fields;
}

/** Fill Greenhouse fields — standard fill for most fields */
async function fillGreenhouseField(field: MappedField): Promise<FillDetail> {
    const el = field.field.element;
    const id = el?.id?.toLowerCase() || '';

    // Country field uses React-Select — needs special interaction
    if (id === 'country' && field.fillMethod === 'text') {
        log(`[PMHNP-Greenhouse] Country field detected — using React-Select interaction`);
        try {
            // Focus and type to trigger React-Select search
            el.focus();
            el.dispatchEvent(new Event('focus', { bubbles: true }));
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
            nativeInputValueSetter?.call(el, String(field.value));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));

            // Wait for dropdown options to appear
            await new Promise((r) => setTimeout(r, 500));

            // Click the first matching option
            const options = document.querySelectorAll<HTMLElement>('[class*="option"]');
            for (const opt of options) {
                if (opt.textContent?.toLowerCase().includes(String(field.value).toLowerCase())) {
                    opt.click();
                    log(`[PMHNP-Greenhouse] Country selected: ${opt.textContent}`);
                    return { field, status: 'filled' };
                }
            }
        } catch (err) {
            log(`[PMHNP-Greenhouse] Country fill error: ${err instanceof Error ? err.message : err}`);
        }
    }

    return fillSingleField(field);
}

/** Handle Greenhouse dropdowns (standard select + Select2/Chosen) */
async function handleGreenhouseDropdown(element: HTMLElement, value: string): Promise<boolean> {
    if (element.tagName.toLowerCase() === 'select') {
        const select = element as HTMLSelectElement;
        for (const option of select.options) {
            if (option.text.toLowerCase().includes(value.toLowerCase())) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
    }
    // Select2 / Chosen style dropdowns (used in some embedded Greenhouse forms)
    element.click();
    await new Promise((r) => setTimeout(r, 300));
    const searchInput = document.querySelector<HTMLInputElement>('.select2-search__field, .chosen-search-input');
    if (searchInput) {
        searchInput.value = value;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
        const result = document.querySelector<HTMLElement>('.select2-results__option--highlighted, .active-result');
        if (result) { result.click(); return true; }
    }
    return false;
}

/** Greenhouse file upload — the real inputs are hidden with class "visually-hidden" */
async function handleGreenhouseFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const greenhouseHandler: ATSHandler = {
    name: 'Greenhouse',
    detect: isGreenhouse,
    detectFields: detectGreenhouseFields,
    fillField: fillGreenhouseField,
    handleDropdown: handleGreenhouseDropdown,
    handleFileUpload: handleGreenhouseFileUpload,
};
