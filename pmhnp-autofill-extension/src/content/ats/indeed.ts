import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';
import { triggerReactChange } from '../filler';

function isIndeed(): boolean {
    const url = window.location.href.toLowerCase();
    // URL must be on indeed.com domain — DOM selectors alone cause false positives
    // because many ATS platforms embed "Apply With Indeed" buttons/widgets
    return url.includes('indeed.com') || url.includes('indeedapply');
}

function detectIndeedFields(): DetectedField[] {
    // Indeed Apply opens in a modal — detect fields within it
    const modal = document.querySelector('[class*="indeed-apply"], [class*="ia-"], [role="dialog"]');
    if (modal) {
        const inputs = modal.querySelectorAll('input, select, textarea');
        console.log(`[PMHNP-Indeed] Found ${inputs.length} fields in apply modal`);
    }
    return detectFormFields();
}

async function fillIndeedField(field: MappedField): Promise<FillDetail> {
    const el = field.field.element;

    // Indeed uses React — always trigger React change
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

async function handleIndeedDropdown(element: HTMLElement, value: string): Promise<boolean> {
    if (element.tagName === 'SELECT') {
        const select = element as HTMLSelectElement;
        for (const opt of select.options) {
            if (opt.text.toLowerCase().includes(value.toLowerCase())) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                triggerReactChange(select, opt.value);
                return true;
            }
        }
    }

    // Indeed custom dropdown
    element.click();
    await sleep(300);
    const options = document.querySelectorAll('[class*="dropdown"] [role="option"], [class*="menu"] li');
    for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
        }
    }

    return false;
}

async function handleIndeedFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const indeedHandler: ATSHandler = {
    name: 'Indeed',
    detect: isIndeed,
    detectFields: detectIndeedFields,
    fillField: fillIndeedField,
    handleDropdown: handleIndeedDropdown,
    handleFileUpload: handleIndeedFileUpload,
};
