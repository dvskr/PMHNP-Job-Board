import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isBambooHR(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('bamboohr.com/careers') || url.includes('bamboohr.com/jobs');
}

function detectBambooHRFields(): DetectedField[] {
    return detectFormFields();
}

async function fillBambooHRField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleBambooHRDropdown(element: HTMLElement, value: string): Promise<boolean> {
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
    return false;
}

async function handleBambooHRFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const bamboohrHandler: ATSHandler = {
    name: 'BambooHR',
    detect: isBambooHR,
    detectFields: detectBambooHRFields,
    fillField: fillBambooHRField,
    handleDropdown: handleBambooHRDropdown,
    handleFileUpload: handleBambooHRFileUpload,
};
