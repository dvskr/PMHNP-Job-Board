import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isADP(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('adp.com') || url.includes('workforceNow') ||
        url.includes('run.adp.com') || url.includes('my.adp.com') ||
        document.querySelector('[class*="adp-"], [data-adp], [id*="adp"]') !== null;
}

function detectADPFields(): DetectedField[] {
    const fields = detectFormFields();

    // ADP uses Angular forms — also look inside shadow DOM and mat-form-fields
    const matFields = document.querySelectorAll('mat-form-field input, mat-form-field select, mat-form-field textarea, [class*="mat-input"], [class*="mat-select"]');
    // These are often already caught by generic detection, but we add ADP-specific context
    return fields;
}

async function fillADPField(field: MappedField): Promise<FillDetail> {
    const el = field.field.element;

    // ADP mat-select needs special handling
    if (el.closest('mat-select') || el.tagName === 'MAT-SELECT') {
        const matSelect = (el.closest('mat-select') || el) as HTMLElement;
        matSelect.click();
        await sleep(300);

        const options = document.querySelectorAll('mat-option');
        for (const opt of options) {
            if (opt.textContent?.toLowerCase().includes(String(field.value).toLowerCase())) {
                (opt as HTMLElement).click();
                await sleep(100);
                return { field, status: 'filled' };
            }
        }
    }

    return fillSingleField(field);
}

async function handleADPDropdown(element: HTMLElement, value: string): Promise<boolean> {
    // ADP uses Angular Material dropdowns
    const matSelect = element.closest('mat-select') || element;
    if (matSelect) {
        (matSelect as HTMLElement).click();
        await sleep(300);

        const options = document.querySelectorAll('mat-option');
        for (const opt of options) {
            if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
                (opt as HTMLElement).click();
                return true;
            }
        }
    }

    // Standard select fallback
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

    return false;
}

async function handleADPFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const adpHandler: ATSHandler = {
    name: 'ADP',
    detect: isADP,
    detectFields: detectADPFields,
    fillField: fillADPField,
    handleDropdown: handleADPDropdown,
    handleFileUpload: handleADPFileUpload,
};
