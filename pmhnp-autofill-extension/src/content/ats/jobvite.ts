import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

function isJobvite(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('jobvite.com') || url.includes('jobs.jobvite') ||
        document.querySelector('[class*="jobvite"], [data-jv], [id*="jobvite"]') !== null;
}

function detectJobviteFields(): DetectedField[] {
    return detectFormFields();
}

async function fillJobviteField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleJobviteDropdown(element: HTMLElement, value: string): Promise<boolean> {
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

async function handleJobviteFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

export const jobviteHandler: ATSHandler = {
    name: 'Jobvite',
    detect: isJobvite,
    detectFields: detectJobviteFields,
    fillField: fillJobviteField,
    handleDropdown: handleJobviteDropdown,
    handleFileUpload: handleJobviteFileUpload,
};
