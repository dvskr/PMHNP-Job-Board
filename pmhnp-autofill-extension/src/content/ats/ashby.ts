/**
 * Ashby ATS Handler
 * Verified against real DOM: https://jobs.ashbyhq.com/haus/... and https://jobs.ashbyhq.com/notion/...
 *
 * DOM structure (verified 2026-02-18):
 *   System fields (stable across all Ashby sites):
 *     Name:         input#_systemfield_name
 *     Email:        input#_systemfield_email       type="email"
 *     Resume:       input#_systemfield_resume      type="file"
 *   EEO fields (stable):
 *     Gender:       inputs with id containing __systemfield_eeoc_gender
 *     Race:         inputs with id containing __systemfield_eeoc_race
 *     Veteran:      inputs with id containing __systemfield_eeoc_veteran_status
 *     Disability:   inputs with id containing __systemfield_eeoc_disability_status
 *   Custom fields (UUID-based ids – match by label text):
 *     Phone, LinkedIn, Location, Cover Letter, etc.
 *   Submit:         button.ashby-application-form-submit-button
 *   Field container: .ashby-application-form-field-entry
 */

import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField, triggerReactChange } from '../filler';

function isAshby(): boolean {
    return window.location.href.toLowerCase().includes('ashbyhq.com');
}

function detectAshbyFields(): DetectedField[] {
    const fields = detectFormFields();

    for (const field of fields) {
        const id = field.id || '';

        // Match stable system fields
        if (id === '_systemfield_name') {
            field.identifier = 'full_name';
            field.confidence = 0.98;
            field.atsSpecific = true;
        } else if (id === '_systemfield_email') {
            field.identifier = 'email';
            field.confidence = 0.98;
            field.atsSpecific = true;
        } else if (id === '_systemfield_resume') {
            field.identifier = 'resume_upload';
            field.confidence = 0.98;
            field.atsSpecific = true;
            field.fieldCategory = 'document';
        }

        // EEO system fields (radio buttons with system field prefixes)
        if (id.includes('__systemfield_eeoc_gender')) {
            field.identifier = 'eeo_gender';
            field.confidence = 0.9;
            field.atsSpecific = true;
        } else if (id.includes('__systemfield_eeoc_race')) {
            field.identifier = 'eeo_race';
            field.confidence = 0.9;
            field.atsSpecific = true;
        } else if (id.includes('__systemfield_eeoc_veteran')) {
            field.identifier = 'eeo_veteran';
            field.confidence = 0.9;
            field.atsSpecific = true;
        } else if (id.includes('__systemfield_eeoc_disability')) {
            field.identifier = 'eeo_disability';
            field.confidence = 0.9;
            field.atsSpecific = true;
        }
    }

    return fields;
}

async function fillAshbyField(field: MappedField): Promise<FillDetail> {
    // Ashby uses React — ensure React-compatible event simulation
    triggerReactChange(field.field.element, String(field.value));
    return fillSingleField(field);
}

async function handleAshbyDropdown(element: HTMLElement, value: string): Promise<boolean> {
    element.click();
    await new Promise((r) => setTimeout(r, 300));
    const options = document.querySelectorAll('[role="option"]');
    for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
        }
    }
    return false;
}

async function handleAshbyFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const ashbyHandler: ATSHandler = {
    name: 'Ashby',
    detect: isAshby,
    detectFields: detectAshbyFields,
    fillField: fillAshbyField,
    handleDropdown: handleAshbyDropdown,
    handleFileUpload: handleAshbyFileUpload,
};
