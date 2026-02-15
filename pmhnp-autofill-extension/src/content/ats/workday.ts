import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';

// Workday data-automation-id → identifier mapping
const WORKDAY_FIELD_MAP: Record<string, { identifier: string; category: string }> = {
    'legalNameSection_firstName': { identifier: 'first_name', category: 'personal' },
    'legalNameSection_lastName': { identifier: 'last_name', category: 'personal' },
    'addressSection_addressLine1': { identifier: 'address_line1', category: 'personal' },
    'addressSection_city': { identifier: 'city', category: 'personal' },
    'addressSection_countryRegion': { identifier: 'state', category: 'personal' },
    'addressSection_postalCode': { identifier: 'zip', category: 'personal' },
    'phone-number': { identifier: 'phone', category: 'personal' },
    'email': { identifier: 'email', category: 'personal' },
};

function isWorkday(): boolean {
    const url = window.location.href.toLowerCase();
    if (url.includes('myworkdayjobs.com') || url.includes('wd5.myworkday.com') || url.includes('workday.com')) {
        return true;
    }
    return !!document.querySelector('[data-automation-id]');
}

function detectWorkdayFields(): DetectedField[] {
    const genericFields = detectFormFields();

    // Enhance with Workday-specific data-automation-id mappings
    const allElements = document.querySelectorAll<HTMLElement>('[data-automation-id]');
    for (const el of allElements) {
        const automationId = el.getAttribute('data-automation-id') || '';
        const mapping = Object.entries(WORKDAY_FIELD_MAP).find(([key]) => automationId.includes(key));

        if (mapping) {
            const existing = genericFields.find((f) => f.element === el);
            if (existing) {
                existing.identifier = mapping[1].identifier;
                existing.confidence = 0.95;
                existing.atsSpecific = true;
            }
        }
    }

    return genericFields;
}

async function fillWorkdayField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleWorkdayDropdown(element: HTMLElement, value: string): Promise<boolean> {
    // Click to open the Workday custom dropdown
    element.click();
    await new Promise((r) => setTimeout(r, 400));

    // Find options in the popup
    const options = document.querySelectorAll('[data-automation-id*="promptOption"], [role="option"]');
    for (const opt of options) {
        const text = opt.textContent?.trim().toLowerCase() || '';
        if (text === value.toLowerCase() || text.includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            await new Promise((r) => setTimeout(r, 200));
            return true;
        }
    }
    return false;
}

async function handleWorkdayFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    // Workday file upload is handled via the standard DataTransfer approach
    return false;
}

function handleWorkdayMultiStep(): { currentStep: number; totalSteps: number } {
    const steps = document.querySelectorAll('[data-automation-id*="progressBarStep"], [class*="step"]');
    const active = document.querySelector('[data-automation-id*="progressBarStep"][aria-current="step"], [class*="active"]');
    const currentStep = active ? Array.from(steps).indexOf(active) + 1 : 1;
    return { currentStep, totalSteps: steps.length || 1 };
}

export const workdayHandler: ATSHandler = {
    name: 'Workday',
    detect: isWorkday,
    detectFields: detectWorkdayFields,
    fillField: fillWorkdayField,
    handleDropdown: handleWorkdayDropdown,
    handleFileUpload: handleWorkdayFileUpload,
    handleMultiStep: handleWorkdayMultiStep,
};
