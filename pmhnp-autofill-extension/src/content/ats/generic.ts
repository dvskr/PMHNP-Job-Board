import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isGeneric(): boolean {
    return true; // Always matches as fallback
}

function detectGenericFields(): DetectedField[] {
    return detectFormFields();
}

async function fillGenericField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleGenericDropdown(element: HTMLElement, value: string): Promise<boolean> {
    if (element.tagName.toLowerCase() === 'select') {
        const select = element as HTMLSelectElement;
        for (const opt of select.options) {
            if (opt.text.toLowerCase().includes(value.toLowerCase())) {
                select.value = opt.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
    }
    // Try generic custom dropdown
    element.click();
    await new Promise((r) => setTimeout(r, 300));
    const options = document.querySelectorAll('[role="option"], [class*="option"], li');
    for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
        }
    }
    return false;
}

async function handleGenericFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const genericHandler: ATSHandler = {
    name: 'Generic',
    detect: isGeneric,
    detectFields: detectGenericFields,
    fillField: fillGenericField,
    handleDropdown: handleGenericDropdown,
    handleFileUpload: handleGenericFileUpload,
};
