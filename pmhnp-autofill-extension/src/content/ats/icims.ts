import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isICIMS(): boolean {
    const url = window.location.href.toLowerCase();
    if (url.includes('icims.com')) return true;
    return !!document.querySelector('[class*="iCIMS"]');
}

function detectICIMSFields(): DetectedField[] {
    const fields = detectFormFields();

    // iCIMS forms are often inside iframes — try to access them
    try {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const doc = iframe.contentDocument;
                if (doc) {
                    const iframeElements = doc.querySelectorAll<HTMLElement>('input, select, textarea');
                    // Fields from iframes are already handled by detectFormFields
                    if (iframeElements.length > 0) {
                        // Mark existing fields that came from iframes
                        for (const field of fields) {
                            if (iframe.contentDocument?.contains(field.element)) {
                                field.atsSpecific = true;
                            }
                        }
                    }
                }
            } catch {
                // Cross-origin iframe
            }
        }
    } catch {
        // iframe access error
    }

    return fields;
}

async function fillICIMSField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleICIMSDropdown(element: HTMLElement, value: string): Promise<boolean> {
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

async function handleICIMSFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const icimsHandler: ATSHandler = {
    name: 'iCIMS',
    detect: isICIMS,
    detectFields: detectICIMSFields,
    fillField: fillICIMSField,
    handleDropdown: handleICIMSDropdown,
    handleFileUpload: handleICIMSFileUpload,
};
