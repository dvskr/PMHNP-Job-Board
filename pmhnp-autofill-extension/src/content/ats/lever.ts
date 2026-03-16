/**
 * Lever ATS Handler
 * Verified against real DOM: https://jobs.lever.co/lifestance/496e5fc1-b01e-4dd0-bd5e-c2df1e1fa193/apply
 *
 * DOM structure (verified 2026-02-18):
 *   Form container: .application-form
 *   Full name:      input[name="name"]        data-qa="name-input"
 *   Email:          input[name="email"]        data-qa="email-input"
 *   Phone:          input[name="phone"]        data-qa="phone-input"
 *   Location:       input[name="location"]     id="location-input"   (typeahead)
 *   Company:        input[name="org"]          data-qa="org-input"
 *   LinkedIn URL:   input[name="urls[LinkedIn]"]
 *   Additional:     textarea[name="comments"]  id="additional-information"
 *   Resume:         input[name="resume"]       id="resume-upload-input"  (file, hidden)
 *   EEO Gender:     select[name="eeo[gender]"]
 *   EEO Race:       select[name="eeo[race]"]
 *   EEO Veteran:    select[name="eeo[veteran]"]
 *   Submit:         button#btn-submit          data-qa="btn-submit"
 */

import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';
import { fillTypeahead } from '../fields';
import { log } from '@/shared/logger';

/** Detect Lever by URL pattern: jobs.lever.co/{company}/{guid}/apply */
function isLever(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('jobs.lever.co') || url.includes('lever.co/apply');
}

/**
 * Detect Lever form fields using verified name attributes and data-qa selectors.
 * Lever uses simple name attributes for all standard fields.
 */
function detectLeverFields(): DetectedField[] {
    const fields = detectFormFields();

    for (const field of fields) {
        const name = field.name.toLowerCase();
        const el = field.element;
        const dataQa = el?.getAttribute?.('data-qa') || '';

        // --- Standard contact fields (verified via data-qa + name) ---

        if (name === 'name' || dataQa === 'name-input') {
            field.identifier = 'full_name';
            field.confidence = 0.98;
            field.atsSpecific = true;
        } else if (name === 'email' || dataQa === 'email-input') {
            field.identifier = 'email';
            field.confidence = 0.98;
            field.atsSpecific = true;
        } else if (name === 'phone' || dataQa === 'phone-input') {
            field.identifier = 'phone';
            field.confidence = 0.98;
            field.atsSpecific = true;
        } else if (name === 'org' || dataQa === 'org-input') {
            field.identifier = 'employer';
            field.confidence = 0.95;
            field.atsSpecific = true;
        } else if (name === 'location' || dataQa === 'location-input') {
            field.identifier = 'location';
            field.confidence = 0.98;
            field.atsSpecific = true;

            // --- URLs (case-sensitive: real DOM uses "urls[LinkedIn]") ---
        } else if (name.includes('urls[linkedin]') || name.includes('urls[LinkedIn]')) {
            field.identifier = 'linkedin';
            field.confidence = 0.98;
            field.atsSpecific = true;

            // --- Additional info / cover letter ---
        } else if (name === 'comments' || el?.id === 'additional-information') {
            field.identifier = 'cover_letter';
            field.fieldCategory = 'open_ended';
            field.confidence = 0.9;
            field.atsSpecific = true;

            // --- Resume upload ---
        } else if (name === 'resume' || el?.id === 'resume-upload-input' || dataQa === 'input-resume') {
            field.identifier = 'resume_upload';
            field.fieldCategory = 'document';
            field.confidence = 0.98;
            field.atsSpecific = true;

            // --- EEO / demographic fields (voluntary) ---
        } else if (name === 'eeo[gender]') {
            field.identifier = 'eeo_gender';
            field.fieldCategory = 'eeo';
            field.confidence = 0.95;
            field.atsSpecific = true;
        } else if (name === 'eeo[race]') {
            field.identifier = 'eeo_race';
            field.fieldCategory = 'eeo';
            field.confidence = 0.95;
            field.atsSpecific = true;
        } else if (name === 'eeo[veteran]') {
            field.identifier = 'eeo_veteran';
            field.fieldCategory = 'eeo';
            field.confidence = 0.95;
            field.atsSpecific = true;
        }
    }

    return fields;
}

/**
 * Lever-specific fill: intercepts the location typeahead field
 * and routes it through fillTypeahead with Lever-specific selectors.
 * All other fields use the generic filler.
 */
async function fillLeverField(field: MappedField): Promise<FillDetail> {
    const el = field.field.element;
    const name = (el as HTMLInputElement).name?.toLowerCase() || '';

    // Lever's location field is a typeahead (no ARIA combobox role).
    // Verified: input#location-input triggers Google Places autocomplete.
    if (name === 'location' && field.fillMethod === 'text') {
        log(`[PMHNP-Lever] Detected location typeahead — using fillTypeahead`);

        try {
            const success = await fillTypeahead(el, String(field.value), {
                typingDelay: 150,       // Lever's API needs time to respond
                dropdownTimeout: 4000,  // Wait up to 4s for suggestions
                optionSelector: [
                    '.pac-item',                          // Google Places (verified)
                    '.autocomplete-dropdown-container li', // Google Places alt
                    '[data-qa="location-result"]',        // Lever's own results
                    '.location-option',                   // Alternative selector
                    '[role="option"]',                    // ARIA option role
                ].join(', '),
                clearFirst: true,
            });

            if (success) {
                log(`[PMHNP-Lever] Location typeahead fill succeeded`);
                return { field, status: 'filled' };
            }

            // Retry with just city name (Lever sometimes needs shorter input)
            const cityOnly = String(field.value).split(',')[0].trim();
            if (cityOnly !== String(field.value)) {
                log(`[PMHNP-Lever] Retrying location with city-only: "${cityOnly}"`);
                const retrySuccess = await fillTypeahead(el, cityOnly, {
                    typingDelay: 150,
                    dropdownTimeout: 4000,
                    optionSelector: [
                        '.pac-item',
                        '.autocomplete-dropdown-container li',
                        '[data-qa="location-result"]',
                        '.location-option',
                        '[role="option"]',
                    ].join(', '),
                    clearFirst: true,
                });

                if (retrySuccess) {
                    log(`[PMHNP-Lever] Location typeahead fill succeeded on city-only retry`);
                    return { field, status: 'filled' };
                }
            }

            log(`[PMHNP-Lever] Location typeahead: no suggestions found — falling back to text fill`);
        } catch (err) {
            log(`[PMHNP-Lever] Location typeahead error: ${err instanceof Error ? err.message : err}`);
        }
    }

    // All other fields use the generic filler
    return fillSingleField(field);
}

/** Handle Lever's standard select dropdowns (EEO fields) */
async function handleLeverDropdown(element: HTMLElement, value: string): Promise<boolean> {
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
    return false;
}

/** Lever file upload: the real input#resume-upload-input is hidden */
async function handleLeverFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const leverHandler: ATSHandler = {
    name: 'Lever',
    detect: isLever,
    detectFields: detectLeverFields,
    fillField: fillLeverField,
    handleDropdown: handleLeverDropdown,
    handleFileUpload: handleLeverFileUpload,
};
