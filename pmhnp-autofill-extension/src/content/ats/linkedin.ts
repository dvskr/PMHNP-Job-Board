import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';
import { triggerReactChange } from '../filler';
import { fillTypeahead } from '../fields/typeahead';
import { log, warn } from '@/shared/logger';

function isLinkedIn(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('linkedin.com') &&
        (url.includes('/jobs/') || url.includes('/apply/') || url.includes('easyApply'));
}

function detectLinkedInFields(): DetectedField[] {
    // LinkedIn Easy Apply uses a multi-step modal
    const modal = document.querySelector('[class*="jobs-easy-apply"], [class*="artdeco-modal"], [role="dialog"]');
    if (modal) {
        const inputs = modal.querySelectorAll('input, select, textarea');
        log(`[PMHNP-LinkedIn] Found ${inputs.length} fields in Easy Apply modal`);
    }
    return detectFormFields();
}

async function fillLinkedInField(field: MappedField): Promise<FillDetail> {
    const el = field.field.element;

    // LinkedIn uses typeahead for location, company, school, etc.
    const isTypeahead = el.getAttribute('role') === 'combobox' ||
        el.closest('[class*="typeahead"]') !== null ||
        el.classList.contains('artdeco-typeahead-input');

    if (isTypeahead) {
        const success = await fillTypeahead(el, String(field.value), {
            typingDelay: 150,
            dropdownTimeout: 3000,
        });
        if (success) return { field, status: 'filled' };
    }

    // Standard React input
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const input = el as HTMLInputElement;
        input.focus();
        input.value = String(field.value);
        triggerReactChange(input, String(field.value));
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { field, status: 'filled' };
    }

    return fillSingleField(field);
}

async function handleLinkedInDropdown(element: HTMLElement, value: string): Promise<boolean> {
    // LinkedIn uses custom dropdowns with artdeco components
    if (element.tagName === 'SELECT') {
        const select = element as HTMLSelectElement;
        for (const opt of select.options) {
            if (opt.text.toLowerCase().includes(value.toLowerCase())) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
    }

    // Custom artdeco dropdown
    element.click();
    await sleep(300);

    const options = document.querySelectorAll('[class*="artdeco-dropdown"] li, [role="option"], [class*="dropdown-option"]');
    for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
        }
    }

    return false;
}

async function handleLinkedInFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const linkedinHandler: ATSHandler = {
    name: 'LinkedIn',
    detect: isLinkedIn,
    detectFields: detectLinkedInFields,
    fillField: fillLinkedInField,
    handleDropdown: handleLinkedInDropdown,
    handleFileUpload: handleLinkedInFileUpload,
};
