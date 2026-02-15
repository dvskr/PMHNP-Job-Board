import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField, triggerReactChange } from '../filler';

function isAshby(): boolean {
    return window.location.href.toLowerCase().includes('ashbyhq.com');
}

function detectAshbyFields(): DetectedField[] {
    return detectFormFields();
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
