import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

const GREENHOUSE_ID_MAP: Record<string, string> = {
    first_name: 'first_name',
    last_name: 'last_name',
    email: 'email',
    phone: 'phone',
    location: 'city',
};

function isGreenhouse(): boolean {
    const url = window.location.href.toLowerCase();
    if (url.includes('boards.greenhouse.io') || url.includes('job-boards.greenhouse.io')) return true;
    return !!document.getElementById('application_form') || !!document.querySelector('.application-form');
}

function detectGreenhouseFields(): DetectedField[] {
    const fields = detectFormFields();

    // Enhance Greenhouse-specific fields by id
    for (const field of fields) {
        const id = field.id.toLowerCase();
        for (const [ghId, identifier] of Object.entries(GREENHOUSE_ID_MAP)) {
            if (id === ghId || id.includes(ghId)) {
                field.identifier = identifier;
                field.confidence = 0.95;
                field.atsSpecific = true;
            }
        }

        // Custom question detection
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

async function fillGreenhouseField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

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
    // Select2 / Chosen style dropdowns
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
