import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isPaylocity(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('paylocity.com') || url.includes('recruiting.paylocity') ||
        url.includes('access.paylocity') ||
        document.querySelector('[class*="paylocity"], [data-paylocity]') !== null;
}

function detectPaylocityFields(): DetectedField[] {
    return detectFormFields();
}

async function fillPaylocityField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handlePaylocityDropdown(element: HTMLElement, value: string): Promise<boolean> {
    // Paylocity uses Angular Material dropdowns
    const matSelect = element.closest('mat-select');
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

async function handlePaylocityFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const paylocityHandler: ATSHandler = {
    name: 'Paylocity',
    detect: isPaylocity,
    detectFields: detectPaylocityFields,
    fillField: fillPaylocityField,
    handleDropdown: handlePaylocityDropdown,
    handleFileUpload: handlePaylocityFileUpload,
};
