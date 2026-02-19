import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField, triggerReactChange } from '../filler';
import { fillTypeahead } from '../fields';
import { log } from '@/shared/logger';
import { sleep } from '../filler';

// ─── Workday ATS Handler ───
// Built from real DOM inspection (2026-02-18).
// Supports MULTIPLE work experiences, educations, and languages.
//
// Architecture:
// 1. performAutofill → setWorkdayRawProfile(rawProfile)   → stores arrays
// 2. performAutofill → expandWorkdaySections()             → clicks Add N-1 times
// 3. universalFill   → tryWorkdayFill(fieldId, el, value)  → section-aware fill

// ─── Raw profile storage (set by performAutofill before filling) ───

let _rawProfile: any = null;

export function setWorkdayRawProfile(rawProfile: any): void {
    _rawProfile = rawProfile;
    log(`[PMHNP-Workday] Raw profile set: ${(_rawProfile?.workExperience || []).length} WE, ${(_rawProfile?.education || []).length} EDU`);
}

// ─── Section field ID patterns ───

const MULTISELECT_PATTERNS = [
    /^education-\d+--school$/,
    /^education-\d+--fieldOfStudy$/,
    /^skills--skills$/,
];

const DROPDOWN_BUTTON_PATTERNS = [
    /^education-\d+--degree$/,
    /^language-\d+--language$/,
    /^language-\d+--[0-9a-f]{20,}$/,
];

const SPINBUTTON_PATTERNS = [
    /dateSectionMonth-input$/,
    /dateSectionYear-input$/,
];

const CHECKBOX_PATTERNS = [
    /--currentlyWorkHere$/,
    /--native$/,
];

// ─── Section-aware field mapping ───
// Workday field IDs: "workExperience-55--jobTitle", "education-8--school"
// The number after the section name is an internal Workday ID, not an array index.
// We group by section prefix and order them to map to profile arrays.

// Track which Workday internal IDs we've seen — map them to profile array indices
const _sectionIndexMap: Record<string, number> = {};
let _weIdsOrdered: string[] = [];
let _eduIdsOrdered: string[] = [];
let _langIdsOrdered: string[] = [];

function resetSectionTracking(): void {
    Object.keys(_sectionIndexMap).forEach(k => delete _sectionIndexMap[k]);
    _weIdsOrdered = [];
    _eduIdsOrdered = [];
    _langIdsOrdered = [];
}

// Extract section type and internal ID from a Workday field ID
// e.g., "workExperience-55--jobTitle" → { section: "workExperience", sectionId: "55", field: "jobTitle" }
function parseWorkdayFieldId(fieldId: string): { section: string; sectionId: string; field: string } | null {
    const match = fieldId.match(/^(workExperience|education|language|skills|websites)-(\d+)--(.+)$/);
    if (!match) return null;
    return { section: match[1], sectionId: match[2], field: match[3] };
}

// Get the profile array index for a section instance
function getSectionIndex(section: string, sectionId: string): number {
    const key = `${section}-${sectionId}`;
    if (_sectionIndexMap[key] !== undefined) return _sectionIndexMap[key];

    // First time seeing this section ID — assign next index
    let orderedList: string[];
    if (section === 'workExperience') orderedList = _weIdsOrdered;
    else if (section === 'education') orderedList = _eduIdsOrdered;
    else if (section === 'language') orderedList = _langIdsOrdered;
    else return 0;

    const index = orderedList.length;
    orderedList.push(sectionId);
    _sectionIndexMap[key] = index;
    log(`[PMHNP-Workday] Section ${key} → array index ${index}`);
    return index;
}

// ─── Section Expansion ───
// Clicks "Add Another" the right number of times based on profile data.
// Workday starts with 0 sections per type; each Add click creates one.
// The first Add click creates section 1, second creates section 2, etc.

export async function expandWorkdaySections(): Promise<void> {
    if (!_rawProfile) {
        log('[PMHNP-Workday] No raw profile — skipping section expansion');
        return;
    }

    resetSectionTracking();

    const weCount = (_rawProfile.workExperience || []).length;
    const eduCount = (_rawProfile.education || []).length;
    const langCount = 1; // profile doesn't have language array yet — default to 1
    const websiteCount = (_rawProfile.personal?.linkedinUrl || _rawProfile.personal?.websiteUrl) ? 1 : 0;

    log(`[PMHNP-Workday] Expanding: WE=${weCount}, EDU=${eduCount}, LANG=${langCount}, WEB=${websiteCount}`);

    // Find all "Add Another" / "Add" buttons on the page
    const addButtons = document.querySelectorAll<HTMLElement>('button');
    const sectionButtons: Record<string, HTMLElement[]> = {
        'Work Experience': [],
        'Education': [],
        'Languages': [],
        'Websites': [],
    };

    for (const btn of addButtons) {
        const text = btn.textContent?.trim() || '';
        if (!/^add\b/i.test(text) && !/^\+\s*add/i.test(text)) continue;

        // Find which section this Add button belongs to by looking at parent headings
        const section = btn.closest('[data-automation-id]') || btn.parentElement?.parentElement;
        if (!section) continue;
        const sectionText = section.textContent || '';

        if (/work\s*experience/i.test(sectionText)) sectionButtons['Work Experience'].push(btn);
        else if (/education/i.test(sectionText)) sectionButtons['Education'].push(btn);
        else if (/language/i.test(sectionText)) sectionButtons['Languages'].push(btn);
        else if (/website/i.test(sectionText)) sectionButtons['Websites'].push(btn);
    }

    // Also try a more specific approach: find buttons near section headings
    if (Object.values(sectionButtons).every(arr => arr.length === 0)) {
        // Fallback: match all Add buttons in page order to section types
        const allAddButtons: HTMLElement[] = [];
        for (const btn of addButtons) {
            const text = btn.textContent?.trim() || '';
            if (/^add\b/i.test(text) && text.length < 40) {
                allAddButtons.push(btn);
            }
        }
        log(`[PMHNP-Workday] Fallback: ${allAddButtons.length} Add buttons found in page order`);

        // Workday page order is typically: Work Experience, Education, Languages, Skills, Websites
        // Map buttons by scanning the page top-to-bottom
        for (const btn of allAddButtons) {
            // Walk UP from button to find section heading
            let el: HTMLElement | null = btn;
            let heading = '';
            while (el && !heading) {
                el = el.parentElement;
                if (!el) break;
                const h = el.querySelector('h2, h3, h4, [data-automation-id*="sectionHeader"]');
                if (h) heading = h.textContent?.trim() || '';
            }

            if (/work/i.test(heading)) sectionButtons['Work Experience'].push(btn);
            else if (/education/i.test(heading)) sectionButtons['Education'].push(btn);
            else if (/language/i.test(heading)) sectionButtons['Languages'].push(btn);
            else if (/website/i.test(heading)) sectionButtons['Websites'].push(btn);
            else {
                log(`[PMHNP-Workday] Unrecognized section for Add button: "${heading || 'unknown'}"`);
            }
        }
    }

    // Count how many sections already exist on the page
    const existingWE = document.querySelectorAll('[data-automation-id*="workExperience"]').length > 0
        ? new Set(Array.from(document.querySelectorAll('[id^="workExperience-"]')).map(el => {
            const m = el.id.match(/^workExperience-(\d+)/);
            return m ? m[1] : null;
        }).filter(Boolean)).size
        : 0;

    const existingEDU = new Set(Array.from(document.querySelectorAll('[id^="education-"]')).map(el => {
        const m = el.id.match(/^education-(\d+)/);
        return m ? m[1] : null;
    }).filter(Boolean)).size;

    // Click Add buttons the right number of times
    const clickAdd = async (btns: HTMLElement[], needed: number, existing: number, name: string) => {
        const toAdd = Math.max(0, needed - existing);
        if (toAdd === 0) {
            log(`[PMHNP-Workday] ${name}: ${existing} sections exist, ${needed} needed — no expansion needed`);
            return;
        }
        if (btns.length === 0) {
            log(`[PMHNP-Workday] ${name}: need ${toAdd} more but no Add button found`);
            return;
        }

        log(`[PMHNP-Workday] ${name}: ${existing} exist, ${needed} needed → clicking Add ${toAdd} time(s)`);
        const btn = btns[0]; // use first matching Add button
        for (let i = 0; i < toAdd; i++) {
            btn.click();
            await sleep(500);
        }
    };

    await clickAdd(sectionButtons['Work Experience'], weCount, existingWE, 'Work Experience');
    await clickAdd(sectionButtons['Education'], eduCount, existingEDU, 'Education');
    await clickAdd(sectionButtons['Languages'], langCount, 0, 'Languages');
    await clickAdd(sectionButtons['Websites'], websiteCount, 0, 'Websites');

    await sleep(500); // let DOM settle
}

// ─── Detection ───

function isWorkday(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('myworkdayjobs.com') || url.includes('wd5.myworkday.com') || url.includes('workday.com');
}

export function isWorkdayPage(): boolean {
    return isWorkday();
}

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

function detectWorkdayFields(): DetectedField[] {
    const genericFields = detectFormFields();

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

// ─── Multi-entry profile value lookup ───
// Given a field ID, look up the correct value from the raw profile arrays.
// e.g., "workExperience-55--jobTitle" → workExperience[1].jobTitle (if 55 is the 2nd WE section)

function getIndexedProfileValue(fieldId: string): string | null {
    if (!_rawProfile) return null;

    const parsed = parseWorkdayFieldId(fieldId);
    if (!parsed) return null;

    const { section, sectionId, field } = parsed;
    const arrayIndex = getSectionIndex(section, sectionId);

    if (section === 'workExperience') {
        const entries = _rawProfile.workExperience || [];
        const entry = entries[arrayIndex];
        if (!entry) return null;

        switch (field) {
            case 'jobTitle': return entry.jobTitle || null;
            case 'company': return entry.employerName || null;
            case 'location': return [entry.employerCity, entry.employerState].filter(Boolean).join(', ') || null;
            case 'roleDescription': return entry.description || null;
            case 'currentlyWorkHere': return entry.isCurrent ? 'true' : null;
        }

        // Date handling: e.g., "startDate-dateSectionMonth-input", "endDate-dateSectionYear-input"
        if (field.includes('startDate') && field.includes('Month')) {
            return entry.startDate ? String(new Date(entry.startDate).getMonth() + 1) : null;
        }
        if (field.includes('startDate') && field.includes('Year')) {
            return entry.startDate ? String(new Date(entry.startDate).getFullYear()) : null;
        }
        if (field.includes('endDate') && field.includes('Month')) {
            if (entry.isCurrent) return null; // current job has no end date
            return entry.endDate ? String(new Date(entry.endDate).getMonth() + 1) : null;
        }
        if (field.includes('endDate') && field.includes('Year')) {
            if (entry.isCurrent) return null;
            return entry.endDate ? String(new Date(entry.endDate).getFullYear()) : null;
        }
    }

    if (section === 'education') {
        const entries = _rawProfile.education || [];
        const entry = entries[arrayIndex];
        if (!entry) return null;

        switch (field) {
            case 'school': return entry.schoolName || null;
            case 'degree': return entry.degreeType || null;
            case 'fieldOfStudy': return entry.fieldOfStudy || null;
            case 'gpa': return entry.gpa || null;
        }

        // Education date handling
        if (field.includes('startDate') && field.includes('Year')) {
            return entry.startDate ? String(new Date(entry.startDate).getFullYear()) : null;
        }
        if (field.includes('endDate') && field.includes('Year')) {
            return entry.graduationDate ? String(new Date(entry.graduationDate).getFullYear()) : null;
        }
        // Workday education uses "firstYearAttended" and "lastYearAttended"
        if (field.includes('firstYearAttended') || (field.includes('from') && field.includes('Year'))) {
            return entry.startDate ? String(new Date(entry.startDate).getFullYear()) : null;
        }
        if (field.includes('lastYearAttended') || (field.includes('to') && field.includes('Year'))) {
            return entry.graduationDate ? String(new Date(entry.graduationDate).getFullYear()) : null;
        }
    }

    if (section === 'websites') {
        const personal = _rawProfile.personal || {};
        // First website = LinkedIn, second = website
        if (arrayIndex === 0) return personal.linkedinUrl || personal.websiteUrl || null;
        if (arrayIndex === 1) return personal.websiteUrl || null;
    }

    return null;
}

// ─── Multiselect Fill (School, Field of Study) ───

const WORKDAY_OPTION_SELECTOR =
    '[role="option"], [data-automation-id*="promptOption"], [data-automation-id*="searchResult"]';

async function fillWorkdayMultiselect(el: HTMLElement, value: string): Promise<boolean> {
    const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement;
    if (!input) {
        log('[PMHNP-Workday] Multiselect: no input found');
        return false;
    }

    log(`[PMHNP-Workday] Multiselect: filling "${input.id}" with "${value.substring(0, 50)}"`);

    const success = await fillTypeahead(input, value, {
        typingDelay: 150,
        dropdownTimeout: 4000,
        optionSelector: WORKDAY_OPTION_SELECTOR,
        clearFirst: true,
    });

    if (success) return true;

    if (value.includes(' ')) {
        const firstWord = value.split(' ')[0];
        log(`[PMHNP-Workday] Multiselect: retrying with first word: "${firstWord}"`);
        return fillTypeahead(input, firstWord, {
            typingDelay: 150,
            dropdownTimeout: 4000,
            optionSelector: WORKDAY_OPTION_SELECTOR,
            clearFirst: true,
        });
    }

    return false;
}

// ─── Skills Fill ───

async function fillWorkdaySkills(el: HTMLElement, value: string): Promise<boolean> {
    const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement;
    if (!input) return false;

    const skills = value.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0);
    log(`[PMHNP-Workday] Skills: adding ${skills.length} skills`);

    let filled = 0;
    for (const skill of skills) {
        const success = await fillTypeahead(input, skill, {
            typingDelay: 150,
            dropdownTimeout: 3000,
            optionSelector: WORKDAY_OPTION_SELECTOR,
            clearFirst: true,
        });
        if (success) { filled++; await sleep(500); }
    }
    return filled > 0;
}

// ─── Dropdown Button Fill (Degree, Language, Proficiency) ───

async function fillWorkdayDropdownButton(el: HTMLElement, value: string): Promise<boolean> {
    const button = el.tagName === 'BUTTON' ? el : el.querySelector('button[aria-haspopup="listbox"]');
    if (!button) return false;

    log(`[PMHNP-Workday] Dropdown: clicking button "${(button as HTMLElement).id}" for value "${value}"`);

    (button as HTMLElement).click();
    await sleep(800);

    const selected = await selectBestOption(value, 'Dropdown');
    if (!selected) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        await sleep(200);
    }
    return selected;
}

// ─── Spinbutton Date Fill ───

async function fillWorkdaySpinbutton(el: HTMLElement, value: string): Promise<boolean> {
    const input = el as HTMLInputElement;
    if (!input) return false;

    log(`[PMHNP-Workday] Spinbutton: filling "${input.id}" with "${value}"`);

    input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await sleep(100);

    triggerReactChange(input, value);
    await sleep(100);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }));
    input.blur();
    await sleep(100);

    return true;
}

// ─── Checkbox Fill ───

async function fillWorkdayCheckbox(el: HTMLElement, value: string): Promise<boolean> {
    const checkbox = el as HTMLInputElement;
    if (!checkbox || checkbox.type !== 'checkbox') return false;

    const shouldCheck = ['true', 'yes', '1', 'checked'].includes(value.toLowerCase());
    const isChecked = checkbox.checked || checkbox.getAttribute('aria-checked') === 'true';

    log(`[PMHNP-Workday] Checkbox: "${checkbox.id}" should=${shouldCheck} current=${isChecked}`);

    if (shouldCheck !== isChecked) {
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200);
    }
    return true;
}

// ─── Option Selection ───

async function selectBestOption(value: string, context: string): Promise<boolean> {
    const valueLower = value.toLowerCase().trim();

    const options = document.querySelectorAll<HTMLElement>('[role="option"], [data-automation-id*="promptOption"]');
    if (options.length === 0) return false;

    log(`[PMHNP-Workday] ${context}: found ${options.length} options`);

    let bestOption: HTMLElement | null = null;
    let bestScore = 0;

    for (const opt of options) {
        const text = opt.textContent?.trim().toLowerCase() || '';
        if (!text) continue;

        if (text === valueLower) { bestOption = opt; bestScore = 100; break; }

        if (text.includes(valueLower) || valueLower.includes(text)) {
            const score = (Math.min(text.length, valueLower.length) / Math.max(text.length, valueLower.length)) * 90;
            if (score > bestScore) { bestOption = opt; bestScore = score; }
        }

        const textWords = text.split(/\s+/);
        const valueWords = valueLower.split(/[\s']+/).filter(w => w.length > 2);
        const overlap = valueWords.filter(w => textWords.some(tw => tw.includes(w) || w.includes(tw))).length;
        const overlapScore = (overlap / Math.max(valueWords.length, 1)) * 80;
        if (overlapScore > bestScore) { bestOption = opt; bestScore = overlapScore; }
    }

    if (bestOption && bestScore > 25) {
        log(`[PMHNP-Workday] ${context}: selecting "${bestOption.textContent?.trim().substring(0, 60)}" (score: ${bestScore.toFixed(0)})`);
        bestOption.scrollIntoView({ block: 'nearest' });
        bestOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        bestOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        bestOption.click();
        await sleep(300);
        return true;
    }

    return false;
}

// ─── Main Fill Router ───
// For Workday-specific fields (multiselect, dropdown, spinbutton, checkbox),
// uses section-aware profile lookup to fill the CORRECT indexed entry.

export async function tryWorkdayFill(fieldId: string, el: HTMLElement, value: string): Promise<boolean> {
    if (!fieldId) return false;

    // Try to get section-indexed value from raw profile (overrides the flat profile value)
    const parsed = parseWorkdayFieldId(fieldId);
    let effectiveValue = value;

    if (parsed && _rawProfile) {
        const indexedValue = getIndexedProfileValue(fieldId);
        if (indexedValue !== null) {
            effectiveValue = indexedValue;
            log(`[PMHNP-Workday] Using indexed value for "${fieldId}": "${indexedValue.substring(0, 50)}"`);
        } else if (parsed.section === 'workExperience' || parsed.section === 'education') {
            // No profile data for this section index — don't fill with wrong data
            const arrayIndex = getSectionIndex(parsed.section, parsed.sectionId);
            const arr = parsed.section === 'workExperience'
                ? (_rawProfile.workExperience || [])
                : (_rawProfile.education || []);
            if (arrayIndex >= arr.length) {
                log(`[PMHNP-Workday] No data for ${parsed.section}[${arrayIndex}] — skipping "${fieldId}"`);
                return true; // return true to prevent generic fill with wrong data
            }
        }
    }

    if (!effectiveValue) return false;

    // 1. Skills multiselect
    if (/^skills--skills$/.test(fieldId)) {
        return fillWorkdaySkills(el, effectiveValue);
    }

    // 2. Other multiselects (School, Field of Study)
    for (const pattern of MULTISELECT_PATTERNS) {
        if (pattern.test(fieldId)) {
            return fillWorkdayMultiselect(el, effectiveValue);
        }
    }

    // 3. Dropdown buttons (Degree, Language, Proficiency)
    for (const pattern of DROPDOWN_BUTTON_PATTERNS) {
        if (pattern.test(fieldId)) {
            return fillWorkdayDropdownButton(el, effectiveValue);
        }
    }

    // 4. Spinbutton dates
    for (const pattern of SPINBUTTON_PATTERNS) {
        if (pattern.test(fieldId)) {
            return fillWorkdaySpinbutton(el, effectiveValue);
        }
    }

    // 5. Checkboxes
    for (const pattern of CHECKBOX_PATTERNS) {
        if (pattern.test(fieldId)) {
            return fillWorkdayCheckbox(el, effectiveValue);
        }
    }

    // 6. Plain text fields in repeating sections — use indexed data
    if (parsed && effectiveValue !== value) {
        // Use generic fill with the correct indexed value
        triggerReactChange(el, effectiveValue);
        return true;
    }

    return false; // let generic fill handle it
}

// ─── Dropdown Handler ───

async function handleWorkdayDropdown(element: HTMLElement, value: string): Promise<boolean> {
    return fillWorkdayDropdownButton(element, value);
}

async function handleWorkdayFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false;
}

function handleWorkdayMultiStep(): { currentStep: number; totalSteps: number } {
    const steps = document.querySelectorAll('[data-automation-id*="progressBarStep"]');
    const active = document.querySelector('[data-automation-id="progressBarActiveStep"]');
    const currentStep = active ? Array.from(steps).indexOf(active) + 1 : 1;
    return { currentStep, totalSteps: steps.length || 1 };
}

export async function fillWorkdayField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
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
