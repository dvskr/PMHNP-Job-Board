/**
 * Repeatable field group handler.
 * Handles "Add another" patterns for education, work experience, certifications, etc.
 * Common in: Workday, Greenhouse, SmartRecruiters, iCIMS.
 */
import { mapFieldsToProfile } from '../matcher';
import { fillForm } from '../filler';
import { getActiveHandler } from '../ats';
import type { ProfileData, EducationEntry, WorkExperienceEntry, FillResult } from '@/shared/types';
import { log, warn } from '@/shared/logger';

/**
 * Fill repeatable field groups by clicking "Add another" and filling each entry.
 * Returns the total number of fields filled across all repetitions.
 */
export async function fillRepeatableGroups(
    profile: ProfileData
): Promise<{ educationFilled: number; experienceFilled: number }> {
    let educationFilled = 0;
    let experienceFilled = 0;

    // Education entries (skip first since it's already filled by the main pipeline)
    if (profile.education && profile.education.length > 1) {
        for (let i = 1; i < profile.education.length; i++) {
            const added = await addAndFillGroup('education', profile.education[i], profile, i);
            educationFilled += added;
        }
    }

    // Work experience entries
    if (profile.workExperience && profile.workExperience.length > 1) {
        for (let i = 1; i < profile.workExperience.length; i++) {
            const added = await addAndFillGroup('experience', profile.workExperience[i], profile, i);
            experienceFilled += added;
        }
    }

    return { educationFilled, experienceFilled };
}

async function addAndFillGroup(
    groupType: 'education' | 'experience',
    entry: EducationEntry | WorkExperienceEntry,
    fullProfile: ProfileData,
    index: number
): Promise<number> {
    // 1. Find and click "Add another" button
    const addButton = findAddButton(groupType);
    if (!addButton) {
        log(`[PMHNP-Repeat] No "Add another" button found for ${groupType} #${index + 1}`);
        return 0;
    }

    // 2. Click the button
    addButton.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(300);
    addButton.click();
    await sleep(1000); // Wait for new fields to appear

    // 3. Detect new fields
    const handler = getActiveHandler();
    const fields = handler.detectFields();

    // 4. Create a temporary profile with only the current entry
    const tempProfile = createSingleEntryProfile(fullProfile, groupType, entry, index);

    // 5. Map and fill the new fields
    const mapped = mapFieldsToProfile(fields, tempProfile);
    const result: FillResult = await fillForm(mapped);

    log(`[PMHNP-Repeat] Filled ${result.filled} fields for ${groupType} #${index + 1}`);
    return result.filled;
}

function findAddButton(groupType: 'education' | 'experience'): HTMLElement | null {
    const keywords = groupType === 'education'
        ? ['add education', 'add another education', 'add school', 'add degree', '+ education', 'add entry']
        : ['add experience', 'add work experience', 'add another work', 'add employment', 'add position', '+ experience', 'add entry'];

    // Search buttons and links
    const candidates = document.querySelectorAll('button, a, [role="button"], .add-button, [class*="add-button"], [data-automation-id*="add"]');

    for (const candidate of candidates) {
        const el = candidate as HTMLElement;
        const text = (el.textContent || '').toLowerCase().trim();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();

        for (const keyword of keywords) {
            if (text.includes(keyword) || ariaLabel.includes(keyword) || title.includes(keyword)) {
                // Make sure it's visible and clickable
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return el;
                }
            }
        }
    }

    // Look for generic "+" or "Add" buttons near the group container
    const sectionKeyword = groupType === 'education' ? 'education' : 'experience';
    const sections = document.querySelectorAll(`[class*="${sectionKeyword}" i], [id*="${sectionKeyword}" i], [data-section*="${sectionKeyword}" i]`);

    for (const section of sections) {
        const buttons = section.querySelectorAll('button, a, [role="button"]');
        for (const btn of buttons) {
            const el = btn as HTMLElement;
            const text = (el.textContent || '').toLowerCase().trim();
            if (text.includes('add') || text === '+' || text.includes('another')) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return el;
                }
            }
        }
    }

    return null;
}

/**
 * Creates a temporary profile with only a single education/experience entry
 * at the first position, so the mapper picks it up correctly.
 */
function createSingleEntryProfile(
    fullProfile: ProfileData,
    groupType: 'education' | 'experience',
    entry: EducationEntry | WorkExperienceEntry,
    _index: number
): ProfileData {
    const tempProfile = { ...fullProfile };

    if (groupType === 'education') {
        tempProfile.education = [entry as EducationEntry];
    } else {
        tempProfile.workExperience = [entry as WorkExperienceEntry];
    }

    return tempProfile;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
