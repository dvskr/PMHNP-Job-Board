import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isUKG(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('ultipro.com') || url.includes('ukg.com') || url.includes('ultiproworkplace') ||
        url.includes('recruiting.ultipro') || url.includes('ukg.net') ||
        document.querySelector('[data-ukg], [class*="ukg-"]') !== null;
}

function detectUKGFields(): DetectedField[] {
    return detectFormFields();
}

async function fillUKGField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleUKGDropdown(element: HTMLElement, value: string): Promise<boolean> {
    // UKG uses custom React dropdowns
    element.click();
    await sleep(300);

    const options = element.closest('[class*="dropdown"]')?.querySelectorAll('[class*="option"], [role="option"], li') || [];
    for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
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

async function handleUKGFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const ukgHandler: ATSHandler = {
    name: 'UKG',
    detect: isUKG,
    detectFields: detectUKGFields,
    fillField: fillUKGField,
    handleDropdown: handleUKGDropdown,
    handleFileUpload: handleUKGFileUpload,
};
