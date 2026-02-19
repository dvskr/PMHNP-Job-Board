import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';
import { log, warn } from '@/shared/logger';

function isTaleo(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('taleo.net') || url.includes('oracle.com/careers') ||
        url.includes('taleo.') || url.includes('oraclecloud.com/hcmUI') ||
        document.querySelector('[class*="taleo"], [id*="taleo"], #requisitionDescriptionInterface') !== null;
}

function detectTaleoFields(): DetectedField[] {
    const fields = detectFormFields();

    // Taleo often embeds forms in iframes — try to access them
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
        try {
            const iframeDoc = iframe.contentDocument;
            if (iframeDoc) {
                const inputs = iframeDoc.querySelectorAll('input, select, textarea');
                // Generic detection would handle these if accessible
                log(`[PMHNP-Taleo] Found ${inputs.length} fields in iframe`);
            }
        } catch {
            // Cross-origin iframe — cannot access
        }
    }

    return fields;
}

async function fillTaleoField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleTaleoDropdown(element: HTMLElement, value: string): Promise<boolean> {
    // Taleo uses custom dropdown widgets with hidden select
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

    // Try clicking to open custom dropdown
    element.click();
    await sleep(500);

    const options = document.querySelectorAll('[class*="dropdown"] li, [class*="menu"] li, [role="option"]');
    for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
        }
    }

    return false;
}

async function handleTaleoFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const taleoHandler: ATSHandler = {
    name: 'Taleo',
    detect: isTaleo,
    detectFields: detectTaleoFields,
    fillField: fillTaleoField,
    handleDropdown: handleTaleoDropdown,
    handleFileUpload: handleTaleoFileUpload,
};
