import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isJazzHR(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('applytojob.com') || url.includes('jazzhr.com') ||
        url.includes('jazz.co') ||
        document.querySelector('[class*="jazzhr"], [data-jazz]') !== null;
}

function detectJazzHRFields(): DetectedField[] {
    return detectFormFields();
}

async function fillJazzHRField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleJazzHRDropdown(element: HTMLElement, value: string): Promise<boolean> {
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

async function handleJazzHRFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const jazzhrHandler: ATSHandler = {
    name: 'JazzHR',
    detect: isJazzHR,
    detectFields: detectJazzHRFields,
    fillField: fillJazzHRField,
    handleDropdown: handleJazzHRDropdown,
    handleFileUpload: handleJazzHRFileUpload,
};
