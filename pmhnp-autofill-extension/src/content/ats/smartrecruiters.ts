import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField, triggerReactChange } from '../filler';

import { setCachedResumeEducation } from '../screening-resolver';
import { log, warn } from '@/shared/logger';

// â”€â”€â”€ Core Handler â”€â”€â”€

function isSmartRecruiters(): boolean {
    return window.location.href.toLowerCase().includes('jobs.smartrecruiters.com');
}

function detectSmartRecruitersFields(): DetectedField[] {
    return detectFormFields();
}

async function fillSmartRecruitersField(field: MappedField): Promise<FillDetail> {
    return fillSingleField(field);
}

async function handleSmartRecruitersDropdown(el: HTMLElement, value: string): Promise<boolean> {
    el.click();
    await sleep(400);
    const options = deepQueryAll('[role="option"], [role="listbox"] li');
    for (const opt of options) {
        if ((opt.textContent?.trim().toLowerCase() || '').includes(value.toLowerCase())) {
            (opt as HTMLElement).click();
            return true;
        }
    }
    return false;
}

async function handleSmartRecruitersFileUpload(_el: HTMLElement, file: File): Promise<boolean> {
    const inputs = deepQueryAll<HTMLInputElement>('input[type="file"]');
    if (inputs.length > 0) {
        const dt = new DataTransfer();
        dt.items.add(file);
        inputs[0].files = dt.files;
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SHADOW DOM UTILITIES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function deepQueryAll<T extends Element = Element>(selector: string, root: ParentNode = document): T[] {
    const results: T[] = [];
    results.push(...Array.from(root.querySelectorAll<T>(selector)));
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) results.push(...deepQueryAll<T>(selector, el.shadowRoot));
    }
    return results;
}

function findAllVisibleByText(text: string): HTMLElement[] {
    const results: HTMLElement[] = [];
    const lower = text.toLowerCase();
    function walk(root: ParentNode) {
        for (const el of root.querySelectorAll('*')) {
            const h = el as HTMLElement;
            if (h.shadowRoot) walk(h.shadowRoot);
            let direct = '';
            for (const c of h.childNodes) {
                if (c.nodeType === Node.TEXT_NODE) direct += c.textContent || '';
            }
            if (direct.trim().toLowerCase().includes(lower)) {
                const r = h.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) results.push(h);
            }
        }
    }
    walk(document);
    return results;
}

function getVisibleFormFields(): HTMLElement[] {
    return deepQueryAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, select'
    ).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 30 && r.height > 10 && window.getComputedStyle(el).display !== 'none';
    });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FULL FLOW (legacy â€” use runSmartRecruitersSections instead)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Run ONLY the experience + education multi-step sections.
 * Called from the main pipeline AFTER simple fields (name, email, etc.) are already filled.
 * Does NOT re-do message or resume upload â€” those are handled by the generic pipeline.
 *
 * Strategy: DELETE any entries SmartRecruiters' resume parser auto-created,
 * then ADD all entries from our profile data. This ensures our structured data
 * always wins over SR's imperfect resume parsing.
 */
export async function runSmartRecruitersSections(profile: Record<string, unknown>): Promise<{ filled: number }> {
    log('[PMHNP] === SmartRecruiters Sections (experience + education) ===');
    let filled = 0;

    // Step 1: Delete any existing entries that SR's resume parser created
    log('[PMHNP] Clearing existing entries from resume parser...');
    await deleteExistingEntries('experience');
    await sleep(500);
    await deleteExistingEntries('education');
    await sleep(500);

    // Determine data sources
    let workEntries = (profile as any)?.workExperience;
    let eduEntries = (profile as any)?.education;
    const hasProfileWork = Array.isArray(workEntries) && workEntries.length > 0;
    const hasProfileEdu = Array.isArray(eduEntries) && eduEntries.length > 0;
    const hasResume = !!(profile as any)?.meta?.resumeUrl;

    // Step 1.5: If either section is missing from profile, extract from resume via AI
    if ((!hasProfileWork || !hasProfileEdu) && hasResume) {
        const missingSections: string[] = [];
        if (!hasProfileWork) missingSections.push('experience');
        if (!hasProfileEdu) missingSections.push('education');
        log(`[PMHNP] Missing profile data for [${missingSections.join(', ')}] â€” extracting from resume via AI...`);

        try {
            const extracted = await chrome.runtime.sendMessage({
                type: 'EXTRACT_RESUME_SECTIONS',
                payload: { sections: missingSections },
            }) as { education?: any[]; experience?: any[]; error?: string };

            if (extracted.error) {
                warn(`[PMHNP] Resume extraction error: ${extracted.error}`);
            } else {
                if (!hasProfileWork && extracted.experience?.length) {
                    workEntries = extracted.experience;
                    log(`[PMHNP] âœ… Extracted ${workEntries.length} experience entries from resume`);
                }
                if (!hasProfileEdu && extracted.education?.length) {
                    eduEntries = extracted.education;
                    setCachedResumeEducation(extracted.education);
                    log(`[PMHNP] âœ… Extracted ${eduEntries.length} education entries from resume (cached for screening)`);
                }
            }
        } catch (err) {
            warn('[PMHNP] Resume extraction failed (non-fatal):', err);
        }
    }

    // Step 2: Add all experience entries
    if (Array.isArray(workEntries) && workEntries.length > 0) {
        log(`[PMHNP] Adding ${workEntries.length} work experience entries...`);
        for (let i = 0; i < workEntries.length; i++) {
            const entry = workEntries[i];
            try {
                log(`[PMHNP] --- Experience ${i + 1}/${workEntries.length}: ${entry.jobTitle || 'Untitled'} at ${entry.employerName || '?'} ---`);
                await handleSectionForEntry('experience', entry);
                filled++;
                await sleep(800);
            } catch (err) {
                warn(`[PMHNP] Experience entry ${i + 1} failed (non-fatal):`, err);
            }
        }
    } else {
        log('[PMHNP] No work experience data (profile or resume) â€” skipping experience section');
    }

    // Step 3: Add all education entries
    if (Array.isArray(eduEntries) && eduEntries.length > 0) {
        log(`[PMHNP] Adding ${eduEntries.length} education entries...`);
        for (let i = 0; i < eduEntries.length; i++) {
            const entry = eduEntries[i];
            try {
                log(`[PMHNP] --- Education ${i + 1}/${eduEntries.length}: ${entry.schoolName || 'Untitled'} ---`);
                await handleSectionForEntry('education', entry);
                filled++;
                await sleep(800);
            } catch (err) {
                warn(`[PMHNP] Education entry ${i + 1} failed (non-fatal):`, err);
            }
        }
    } else {
        log('[PMHNP] No education data (profile or resume) â€” skipping education section');
    }

    log(`[PMHNP] === Sections Complete (${filled} entries filled) ===`);
    return { filled };
}

/**
 * Delete all existing entries in a section (experience or education).
 * SmartRecruiters shows delete buttons (trash icons) next to each entry.
 * We find the section heading, then click all delete/remove buttons within that section.
 */
async function deleteExistingEntries(sectionName: string): Promise<void> {
    const heading = findHeading(sectionName);
    if (!heading) {
        log(`[PMHNP] No "${sectionName}" heading found â€” nothing to delete`);
        return;
    }

    // Find the section container â€” walk up from heading to find a section/fieldset/div
    const section = heading.closest('section, fieldset, [class*="section"], [data-test], .application-section')
        || heading.parentElement?.parentElement;

    if (!section) {
        log(`[PMHNP] Could not find section container for "${sectionName}"`);
        return;
    }

    // Delete entries in a loop (each delete removes one entry, may trigger confirmation)
    let deleteCount = 0;
    const maxDeletes = 10; // safety limit

    while (deleteCount < maxDeletes) {
        // Find delete buttons: trash icons, remove buttons, delete buttons
        // SmartRecruiters uses icons/buttons with aria-label or text like "Delete", "Remove"
        const deleteButtons = findDeleteButtons(section as HTMLElement);

        if (deleteButtons.length === 0) {
            log(`[PMHNP] No more delete buttons in "${sectionName}" â€” cleared ${deleteCount} entries`);
            break;
        }

        const btn = deleteButtons[0]; // Always click the FIRST one (list shifts after delete)
        log(`[PMHNP] ðŸ—‘ï¸ Deleting ${sectionName} entry ${deleteCount + 1}: "${btn.getAttribute('aria-label') || btn.textContent?.trim().substring(0, 30) || 'delete'}"`);

        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(200);
        btn.click();
        await sleep(800);

        // Handle confirmation dialog if one appears
        await dismissDeleteConfirmation();
        await sleep(500);

        deleteCount++;
    }

    if (deleteCount > 0) {
        log(`[PMHNP] âœ… Deleted ${deleteCount} "${sectionName}" entries`);
    }
}

/** Find delete/remove/trash buttons within a section container */
function findDeleteButtons(container: HTMLElement): HTMLElement[] {
    const buttons: HTMLElement[] = [];

    // Strategy 1: Buttons/icons with aria-label containing "delete" or "remove"
    const ariaEls = container.querySelectorAll<HTMLElement>(
        '[aria-label*="elete"], [aria-label*="emove"], [aria-label*="rash"]'
    );
    ariaEls.forEach(el => {
        if (isVisible(el)) buttons.push(el);
    });

    if (buttons.length > 0) return buttons;

    // Strategy 2: Buttons with delete/remove/trash text or SVG trash icon
    const allButtons = container.querySelectorAll<HTMLElement>('button, [role="button"]');
    allButtons.forEach(btn => {
        const text = (btn.textContent?.trim() || '').toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const hasTrashIcon = btn.querySelector('svg') !== null && (text === '' || text.length < 5);

        if ((text.includes('delete') || text.includes('remove') || ariaLabel.includes('delete') ||
            ariaLabel.includes('remove') || (hasTrashIcon && text === '')) && isVisible(btn)) {
            buttons.push(btn);
        }
    });

    return buttons;
}

/** Check if an element is visible on screen */
function isVisible(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

/** Handle any confirmation dialog that appears after clicking delete */
async function dismissDeleteConfirmation(): Promise<void> {
    // Look for confirmation buttons: "Yes", "Confirm", "OK", "Delete"
    const confirmTexts = ['yes', 'confirm', 'ok', 'delete', 'remove'];

    for (const text of confirmTexts) {
        const candidates = findAllVisibleByText(text);
        for (const el of candidates) {
            if (el.tagName === 'BUTTON' || el.closest('button') || el.getAttribute('role') === 'button') {
                const btnText = (el.textContent?.trim() || '').toLowerCase();
                // Make sure it's a short confirmation button, not a long paragraph
                if (btnText.length < 20 && confirmTexts.some(t => btnText.includes(t))) {
                    log(`[PMHNP] Confirming delete: "${el.textContent?.trim()}"`);
                    (el.closest('button') || el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await sleep(500);
                    return;
                }
            }
        }
    }
}

/**
 * Fix SmartRecruiters page-1 fields that the generic pipeline can't handle:
 * - City autocomplete (needs typing + suggestion click)
 * - Confirm email (needs to copy from email field)
 * - LinkedIn URL (may be missed)
 */
export async function fixSmartRecruitersPage1(profile: Record<string, unknown>): Promise<number> {
    log('[PMHNP] === SmartRecruiters Page-1 Fixup ===');
    let fixed = 0;
    const p = (profile as any)?.personal || profile || {};
    const city = p.address?.city || p.city || '';
    const state = p.address?.state || p.state || '';
    const linkedinUrl = p.linkedinUrl || '';

    // 1. Fix Confirm Email â€” find empty confirm email field and copy the email value
    try {
        const allInputs = deepQueryAll<HTMLInputElement>('input[type="email"], input[type="text"]');
        for (const input of allInputs) {
            const label = getInputLabel(input).toLowerCase();
            if (label.includes('confirm') && label.includes('email')) {
                const emailValue = p.email || '';
                if (emailValue && !input.value) {
                    log(`[PMHNP] Fixing confirm email: "${emailValue}"`);
                    await smartFill(input, emailValue);
                    fixed++;
                }
            }
        }
    } catch (err) {
        warn('[PMHNP] Confirm email fixup failed:', err);
    }

    // 2. City â€” SKIP for SmartRecruiters
    // SR uses a custom Angular WebComponent for city that throws
    // "Missing autocomplete option factory" errors when programmatically filled.
    // The user must select city manually.
    log('[PMHNP] Skipping city (SmartRecruiters uses custom WebComponent)');

    // 3. Fix LinkedIn â€” fill if not already filled
    try {
        if (linkedinUrl) {
            const allInputs = deepQueryAll<HTMLInputElement>('input[type="text"], input[type="url"]');
            for (const input of allInputs) {
                const label = getInputLabel(input).toLowerCase();
                const name = (input.name || '').toLowerCase();
                const id = (input.id || '').toLowerCase();
                const searchStr = `${label} ${name} ${id}`;
                if (searchStr.includes('linkedin') && !input.value) {
                    log(`[PMHNP] Fixing LinkedIn: "${linkedinUrl}"`);
                    await smartFill(input, linkedinUrl);
                    fixed++;
                }
            }
        }
    } catch (err) {
        warn('[PMHNP] LinkedIn fixup failed:', err);
    }

    log(`[PMHNP] === Page-1 Fixup: ${fixed} fields fixed ===`);
    return fixed;
}


/** Get label text for an input element */
function getInputLabel(input: HTMLElement): string {
    // aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    // <label for>
    if (input.id) {
        const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(input.id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }
    // Wrapping <label>
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim() || '';
    // Walk up to find label-like sibling
    let ancestor = input.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth++) {
        const labelEl = ancestor.querySelector('label, [class*="label"], [class*="Label"]');
        if (labelEl && !labelEl.contains(input)) {
            const text = labelEl.textContent?.trim();
            if (text && text.length < 100) return text;
        }
        const prevSib = ancestor.previousElementSibling;
        if (prevSib) {
            const text = prevSib.textContent?.trim();
            if (text && text.length < 80 && text.length > 1) return text;
        }
        ancestor = ancestor.parentElement;
    }
    return input.getAttribute('placeholder') || '';
}

async function handleSectionForEntry(name: string, entry: Record<string, unknown>): Promise<void> {
    log(`[PMHNP] --- ${name} ---`);

    // CRITICAL: Snapshot ALL current fields BEFORE clicking Add
    const fieldsBefore = new Set(getVisibleFormFields());
    log(`[PMHNP] Fields before Add: ${fieldsBefore.size}`);

    // Find heading
    const heading = findHeading(name);
    if (!heading) { log(`[PMHNP] âŒ No "${name}" heading`); return; }

    const hY = heading.getBoundingClientRect().top;

    // Find closest "Add" element to heading
    const addEls = findAllVisibleByText('Add');
    let btn: HTMLElement | null = null;
    let best = 200;
    for (const el of addEls) {
        if ((el.textContent?.trim() || '').length > 20) continue;
        const d = Math.abs(el.getBoundingClientRect().top - hY);
        if (d < best) { best = d; btn = el; }
    }

    // Fallback: elementFromPoint at right edge
    if (!btn) {
        const w = document.documentElement.clientWidth;
        for (const xoff of [-60, -80, -100]) {
            const el = document.elementFromPoint(w + xoff, hY + 15) as HTMLElement;
            if (el && (el.textContent?.trim().toLowerCase().includes('add') || el.parentElement?.textContent?.trim().toLowerCase().includes('add'))) {
                btn = el.textContent?.trim().toLowerCase().includes('add') ? el : el.parentElement;
                break;
            }
        }
    }

    if (!btn) { log(`[PMHNP] âŒ No Add button for "${name}"`); return; }
    log(`[PMHNP] âœ… Clicking Add: "${btn.textContent?.trim()}"`);
    btn.click(); // Only ONE click â€” dispatchEvent caused double-entry
    await sleep(1500);

    // Get ONLY the NEW fields that appeared after clicking Add
    const fieldsAfter = getVisibleFormFields();
    let newFields = fieldsAfter.filter(f => !fieldsBefore.has(f));
    log(`[PMHNP] Fields after Add: ${fieldsAfter.length}, NEW fields (raw): ${newFields.length}`);

    // Filter out stray fields: "Country" placeholders and fields far from the main cluster
    newFields = newFields.filter(f => {
        const ph = (f as HTMLInputElement).placeholder || '';
        // Skip "Country" fields â€” they're from other sections or the city widget
        if (ph.toLowerCase() === 'country') {
            log(`[PMHNP]   Filtered out: Country field at (${Math.round(f.getBoundingClientRect().left)},${Math.round(f.getBoundingClientRect().top)})`);
            return false;
        }
        return true;
    });

    // If we have enough fields, filter out ones that are far from the main cluster
    if (newFields.length > 3) {
        const yPositions = newFields.map(f => f.getBoundingClientRect().top);
        const medianY = yPositions.sort((a, b) => a - b)[Math.floor(yPositions.length / 2)];
        const maxSpread = 800; // fields more than 800px from median are outliers
        const filtered = newFields.filter(f => {
            const y = f.getBoundingClientRect().top;
            const ok = Math.abs(y - medianY) < maxSpread;
            if (!ok) log(`[PMHNP]   Filtered out: outlier field at y=${Math.round(y)} (median=${Math.round(medianY)})`);
            return ok;
        });
        if (filtered.length >= 3) newFields = filtered;
    }

    log(`[PMHNP] NEW fields after filtering: ${newFields.length}`);

    // Sort new fields by position
    const sorted = [...newFields].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const yDiff = ra.top - rb.top;
        if (Math.abs(yDiff) > 20) return yDiff;
        return ra.left - rb.left;
    });

    // Log new fields
    for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i];
        const r = f.getBoundingClientRect();
        const tag = f.tagName.toLowerCase();
        const type = (f as HTMLInputElement).type || '';
        const ph = (f as HTMLInputElement).placeholder || '';
        log(`[PMHNP]   NEW [${i}] <${tag} type="${type}"> pos=(${Math.round(r.left)},${Math.round(r.top)}) ph="${ph}"`);
    }

    // Group into rows
    const rows = groupByRow(sorted);
    log(`[PMHNP] Grouped into ${rows.length} rows`);

    if (name === 'experience') await fillExpFields(rows, entry);
    else await fillEduFields(rows, entry);

    // Fill any remaining empty textareas (e.g. Description) from entry data
    const emptyTextareas = sorted.filter(f =>
        f.tagName.toLowerCase() === 'textarea' && !(f as HTMLTextAreaElement).value?.trim()
    );

    if (emptyTextareas.length > 0) {
        const entryAny = entry as any;
        // Use description from entry data, or generate a fallback from available fields
        let description = entryAny.description || '';
        if (!description && name === 'education') {
            const parts = [
                entryAny.degreeType && entryAny.fieldOfStudy
                    ? `${entryAny.degreeType} in ${entryAny.fieldOfStudy}`
                    : (entryAny.degreeType || entryAny.fieldOfStudy || ''),
                entryAny.schoolName ? `at ${entryAny.schoolName}` : '',
            ].filter(Boolean);
            description = parts.join(' ');
        }

        if (description) {
            for (const ta of emptyTextareas) {
                const textarea = ta as HTMLTextAreaElement;
                textarea.focus();
                textarea.value = description;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                triggerReactChange(textarea, description);
                log(`[PMHNP] ✅ Filled Description: "${description.substring(0, 60)}"`);
            }
        } else {
            log(`[PMHNP] No description data available for ${name} — skipping`);
        }
    }

    // Save the section
    await sleep(300);
    await clickButtonByText('Save');
}

/**
 * AI-powered section filling: when profile data is missing (e.g. no education entries),
 * click "+ Add" to reveal form fields, serialize them, send to AI (which has resume access),
 * and fill with the AI's response.
 */
async function handleSectionWithAI(name: string): Promise<number> {
    log(`[PMHNP] === AI fallback for ${name} ===`);

    // Snapshot fields before clicking Add
    const fieldsBefore = new Set(getVisibleFormFields());

    // Find heading and Add button (same logic as handleSectionForEntry)
    const heading = findHeading(name);
    if (!heading) { log(`[PMHNP] âŒ No "${name}" heading â€” AI fallback aborted`); return 0; }

    const hY = heading.getBoundingClientRect().top;
    const addEls = findAllVisibleByText('Add');
    let btn: HTMLElement | null = null;
    let best = 200;
    for (const el of addEls) {
        if ((el.textContent?.trim() || '').length > 20) continue;
        const d = Math.abs(el.getBoundingClientRect().top - hY);
        if (d < best) { best = d; btn = el; }
    }

    if (!btn) { log(`[PMHNP] âŒ No Add button for "${name}" â€” AI fallback aborted`); return 0; }
    log(`[PMHNP] âœ… Clicking Add for AI fallback: "${btn.textContent?.trim()}"`);
    btn.click();
    await sleep(1500);

    // Get new fields
    const fieldsAfter = getVisibleFormFields();
    let newFields = fieldsAfter.filter(f => !fieldsBefore.has(f));
    log(`[PMHNP] AI fallback: ${newFields.length} new fields appeared`);

    if (newFields.length === 0) {
        log('[PMHNP] No new fields â€” AI fallback aborted');
        return 0;
    }

    // Filter out Country and outlier fields (same as handleSectionForEntry)
    newFields = newFields.filter(f => {
        const ph = (f as HTMLInputElement).placeholder || '';
        if (ph.toLowerCase() === 'country') return false;
        return true;
    });

    if (newFields.length > 3) {
        const yPositions = newFields.map(f => f.getBoundingClientRect().top);
        const medianY = yPositions.sort((a, b) => a - b)[Math.floor(yPositions.length / 2)];
        const maxSpread = 800;
        const filtered = newFields.filter(f => Math.abs(f.getBoundingClientRect().top - medianY) < maxSpread);
        if (filtered.length >= 3) newFields = filtered;
    }

    // Sort by position
    const sorted = [...newFields].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const yDiff = ra.top - rb.top;
        if (Math.abs(yDiff) > 20) return yDiff;
        return ra.left - rb.left;
    });

    // Serialize fields for the AI classifier
    const serialized = sorted.map((f, i) => {
        const input = f as HTMLInputElement;
        const label = getInputLabel(f);
        return {
            index: i,
            tagName: f.tagName,
            type: input.type || (f.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
            label: label,
            placeholder: input.placeholder || '',
            name: input.name || '',
            id: input.id || '',
            options: [] as string[],
            isRequired: input.required || false,
            currentValue: input.value || '',
            attributes: {} as Record<string, string>,
        };
    });

    log(`[PMHNP] Sending ${serialized.length} ${name} fields to AI...`);
    for (const s of serialized) {
        log(`[PMHNP]   AI field [${s.index}] type="${s.type}" label="${s.label}" ph="${s.placeholder}"`);
    }

    // Call AI via background script
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'CLASSIFY_AND_MAP',
            payload: {
                fields: serialized,
                pageUrl: window.location.href,
            },
        }) as { mappings?: { index: number; value: string; interaction: string; confidence: number }[]; uploads?: unknown[]; error?: string };

        if (response.error) {
            warn(`[PMHNP] AI classification error: ${response.error}`);
            return 0;
        }

        const mappings = response.mappings || [];
        log(`[PMHNP] AI returned ${mappings.length} fill instructions for ${name}`);

        let filled = 0;
        for (const m of mappings) {
            if (m.index < 0 || m.index >= sorted.length) continue;
            if (!m.value) continue;

            const el = sorted[m.index];
            const input = el as HTMLInputElement;
            const isDate = input.placeholder?.toLowerCase().includes('date') || input.type === 'date';

            try {
                if (isDate) {
                    // Date field â€” use fillDate logic
                    await fillDate(input, m.value);
                    log(`[PMHNP]   âœ… AI filled [${m.index}] (date): "${m.value}"`);
                } else {
                    // Text/autocomplete field
                    await smartFill(input, m.value);
                    log(`[PMHNP]   âœ… AI filled [${m.index}]: "${m.value.substring(0, 40)}"`);
                }
                filled++;
            } catch (err) {
                warn(`[PMHNP]   âŒ AI fill [${m.index}] failed:`, err);
            }
            await sleep(100);
        }

        // Click Save if there's a save button
        if (filled > 0) {
            await clickSave(name);
        }

        log(`[PMHNP] AI ${name} fallback: ${filled} fields filled`);
        return filled;
    } catch (err) {
        warn(`[PMHNP] AI ${name} fallback failed:`, err);
        return 0;
    }
}

/** Click Save button after filling a section */
async function clickSave(sectionName: string): Promise<void> {
    const saveEls = findAllVisibleByText('Save');
    for (const el of saveEls) {
        const text = (el.textContent?.trim() || '').toLowerCase();
        if (text === 'save' || text === 'save entry') {
            log(`[PMHNP] Clicking Save for ${sectionName}`);
            el.click();
            await sleep(1000);
            return;
        }
    }
    log(`[PMHNP] No Save button found for ${sectionName}`);
}

function findHeading(name: string): HTMLElement | null {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    const els = findAllVisibleByText(cap);
    // First pass: look for actual heading tags (h1-h6)
    for (const el of els) {
        if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)) return el;
    }
    // Second pass: look for elements whose text is an exact case-insensitive match
    for (const el of els) {
        const t = el.textContent?.trim().toLowerCase() || '';
        if (t === name) return el;
    }
    // Third pass: look for elements that look like section labels (short text, likely headings)
    for (const el of els) {
        const t = el.textContent?.trim() || '';
        // Only match if the element text is reasonably short (section heading, not a paragraph)
        // and starts with or equals the section name
        if (t.length < 30 && t.toLowerCase().startsWith(name)) return el;
    }
    // DO NOT fall back to els[0] â€” returning a random element containing
    // the text causes fills to go into the wrong section (e.g. Languages instead of Education)
    log(`[PMHNP] findHeading: no heading found for "${name}" (${els.length} candidates rejected)`);
    return null;
}

function groupByRow(fields: HTMLElement[]): HTMLElement[][] {
    if (fields.length === 0) return [];
    const rows: HTMLElement[][] = [[fields[0]]];
    for (let i = 1; i < fields.length; i++) {
        const prevY = fields[i - 1].getBoundingClientRect().top;
        const curY = fields[i].getBoundingClientRect().top;
        if (Math.abs(curY - prevY) > 20) {
            rows.push([fields[i]]);
        } else {
            rows[rows.length - 1].push(fields[i]);
        }
    }
    return rows;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FILL EXPERIENCE â€” known layout order
// Row 0: Title (autocomplete) | Company (autocomplete)
// Row 1: Office location (autocomplete, full width)
// Row 2: Description (textarea)
// Row 3: From date | To date
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fillExpFields(rows: HTMLElement[][], entry: Record<string, unknown>): Promise<void> {
    const work = entry as any;
    if (!work) { log('[PMHNP] No work experience data'); return; }

    // Build location from employerCity + employerState (profile export doesn't have a single `location` field)
    const location = [work.employerCity, work.employerState].filter(Boolean).join(', ');

    // Map field values to row/col positions
    // Each entry: [rowIdx, colIdx, value, isAutocomplete, isDate]
    type FieldDef = { row: number; col: number; value: string; autocomplete: boolean; date: boolean };

    const fieldDefs: FieldDef[] = [
        { row: 0, col: 0, value: work.jobTitle || '', autocomplete: true, date: false },        // Title
        { row: 0, col: 1, value: work.employerName || '', autocomplete: true, date: false },     // Company
        { row: 1, col: 0, value: location, autocomplete: true, date: false },                    // Office location
        { row: 2, col: 0, value: work.description || '', autocomplete: false, date: false },     // Description
        { row: 3, col: 0, value: work.startDate || '', autocomplete: false, date: true },        // From
        { row: 3, col: 1, value: work.isCurrent ? '' : (work.endDate || ''), autocomplete: false, date: true }, // To
    ];

    for (const def of fieldDefs) {
        if (!def.value) {
            log(`[PMHNP] Skip row${def.row} col${def.col} (no value)`);
            continue;
        }
        if (def.row >= rows.length) {
            log(`[PMHNP] Skip row${def.row} (only ${rows.length} rows)`);
            continue;
        }
        if (def.col >= rows[def.row].length) {
            log(`[PMHNP] Skip row${def.row} col${def.col} (only ${rows[def.row].length} cols)`);
            continue;
        }

        const field = rows[def.row][def.col];
        log(`[PMHNP] Exp row${def.row} col${def.col}: "${def.value.substring(0, 30)}" (ac=${def.autocomplete} date=${def.date})`);

        if (def.date) await fillDate(field as HTMLInputElement, def.value);
        else if (def.autocomplete) await fillAutocomplete(field as HTMLInputElement, def.value);
        else await smartFill(field as HTMLInputElement, def.value);
    }

    // Check "I currently work here"
    if (work.isCurrent) await clickCheckboxByText('currently work');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FILL EDUCATION â€” known layout order
// Row 0: Institution (autocomplete, full width)
// Row 1: Major | Degree
// Row 2: School location (autocomplete, full width)
// Row 3: Description (textarea)
// Row 4: From date | To date
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fillEduFields(rows: HTMLElement[][], entry: Record<string, unknown>): Promise<void> {
    const edu = entry as any;
    if (!edu) { log('[PMHNP] No education data'); return; }

    type FieldDef = { row: number; col: number; value: string; autocomplete: boolean; date: boolean };

    const fieldDefs: FieldDef[] = [
        { row: 0, col: 0, value: edu.schoolName || '', autocomplete: true, date: false },        // Institution
        { row: 1, col: 0, value: edu.fieldOfStudy || '', autocomplete: false, date: false },     // Major
        { row: 1, col: 1, value: edu.degreeType || '', autocomplete: false, date: false },       // Degree
        { row: 2, col: 0, value: edu.location || '', autocomplete: true, date: false },          // School location
        // Row 3: Description (skip)
        { row: 4, col: 0, value: edu.startDate || '', autocomplete: false, date: true },         // From
        { row: 4, col: 1, value: edu.graduationDate || '', autocomplete: false, date: true },    // To
    ];

    for (const def of fieldDefs) {
        if (!def.value) continue;
        if (def.row >= rows.length || def.col >= rows[def.row].length) {
            log(`[PMHNP] Skip edu row${def.row} col${def.col} (out of range, ${rows.length} rows)`);
            continue;
        }

        const field = rows[def.row][def.col];
        log(`[PMHNP] Edu row${def.row} col${def.col}: "${def.value.substring(0, 30)}" (ac=${def.autocomplete} date=${def.date})`);

        if (def.date) await fillDate(field as HTMLInputElement, def.value);
        else if (def.autocomplete) await fillAutocomplete(field as HTMLInputElement, def.value);
        else await smartFill(field as HTMLInputElement, def.value);
    }

    if (edu.isCurrentlyAttending) await clickCheckboxByText('currently attend');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AUTOCOMPLETE â€” type char by char then click suggestion
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fillAutocomplete(input: HTMLInputElement, value: string): Promise<void> {
    log(`[PMHNP] Autocomplete: "${value.substring(0, 25)}"`);

    // Scroll into view
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await sleep(100);

    // Clear
    input.value = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(50);

    // Use execCommand to type the value (works with Angular)
    input.select();
    const typed = document.execCommand('insertText', false, value);
    if (typed) {
        log(`[PMHNP] execCommand typed "${value.substring(0, 20)}"`);
    } else {
        // Fallback: set value + trigger events
        input.value = value;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    }

    // Wait for suggestions to appear
    log('[PMHNP] Waiting for autocomplete...');
    await sleep(1200);

    // Search for suggestion options â€” only click if the suggestion text matches our value
    const selectors = [
        '[role="option"]', '[role="listbox"] li', 'mat-option',
        '.cdk-overlay-pane li', '.cdk-overlay-pane [role="option"]',
    ];

    const valueLower = value.toLowerCase();

    for (const sel of selectors) {
        const options = deepQueryAll<HTMLElement>(sel);
        const visible = options.filter(o => {
            const r = o.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });

        if (visible.length > 0) {
            // Try to find a suggestion that matches our value
            let bestMatch: HTMLElement | null = null;
            for (const opt of visible) {
                // Get text from all possible sources (shadow DOM renders text in slots)
                const optText = (opt.textContent?.trim() || opt.getAttribute('aria-label') || opt.getAttribute('title') || '').toLowerCase();
                log(`[PMHNP]   Suggestion: "${optText}" (tag=${opt.tagName})`);
                if (optText && (optText.includes(valueLower) || valueLower.includes(optText))) {
                    bestMatch = opt;
                    break;
                }
            }

            if (bestMatch) {
                log(`[PMHNP] âœ… Clicking matching suggestion: "${bestMatch.textContent?.trim().substring(0, 40)}"`);
                bestMatch.click();
                await sleep(400);
                return;
            } else {
                // Suggestions exist but none match â€” click FIRST one as it's likely the closest
                log(`[PMHNP] â„¹ï¸ ${visible.length} suggestions found, none match exactly. Clicking first.`);
                visible[0].click();
                await sleep(400);
                return;
            }
        }
    }

    // No suggestions at all â€” just Tab/Blur to accept the typed value
    log('[PMHNP] No suggestions found, tabbing out to accept typed value');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }));
    await sleep(100);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DATE FILL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fillDate(input: HTMLInputElement, dateStr: string): Promise<void> {
    if (!dateStr) return;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;

        // Use UTC methods to avoid timezone shift (e.g., 2022-03-01 â†’ Feb 28 in CST)
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        const fmt = `${yyyy}-${mm}-${dd}`;

        log(`[PMHNP] Date: "${fmt}" (from ${dateStr})`);

        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(100);
        input.focus();
        input.click();
        input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await sleep(200);

        // Strategy 1: Use native value setter (works with Angular/React)
        try {
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;

            if (nativeSetter) {
                nativeSetter.call(input, fmt);
                log(`[PMHNP] Date: native setter applied "${fmt}"`);
            } else {
                input.value = fmt;
            }
        } catch (setterErr) {
            // Web components may throw "Illegal invocation" â€” fall back to direct assignment
            log(`[PMHNP] Date: native setter failed, using direct assignment`);
            input.value = fmt;
        }

        // Dispatch all the events Angular needs to detect the change
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: fmt, inputType: 'insertText' }));
        await sleep(100);

        // Strategy 2: Also try execCommand as backup
        try {
            input.focus();
            input.select();
            document.execCommand('insertText', false, fmt);
        } catch { /* ignore */ }

        await sleep(100);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

        // Close any date picker overlay
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(300);

        log(`[PMHNP] Date field value after fill: "${input.value}"`);
    } catch (e) {
        log(`[PMHNP] Date error: ${e}`);
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SMART FILL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function smartFill(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(100);
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await sleep(50);

    el.value = '';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(30);

    try {
        el.select();
        if (document.execCommand('insertText', false, value)) {
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            return;
        }
    } catch { /* */ }

    triggerReactChange(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MESSAGE & RESUME
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fillMessageTextarea(profile: Record<string, unknown>): Promise<void> {
    // Find the textarea that is closest to the "Message to the Hiring Team" heading
    const headings = findAllVisibleByText('Message');
    if (headings.length === 0) {
        log('[PMHNP] No "Message" heading found');
        return;
    }

    // Find the heading closest to the bottom of the page (the message section is usually at the end)
    let msgHeading: HTMLElement | null = null;
    let bestY = -Infinity;
    for (const h of headings) {
        const y = h.getBoundingClientRect().top;
        if (y > bestY) { bestY = y; msgHeading = h; }
    }

    if (!msgHeading) return;
    const headingY = msgHeading.getBoundingClientRect().top;
    log(`[PMHNP] Message heading at Y=${Math.round(headingY)}`);

    // Find all textareas and pick the one closest below the heading
    const textareas = deepQueryAll<HTMLTextAreaElement>('textarea');
    let bestTa: HTMLTextAreaElement | null = null;
    let bestDist = 300; // Max 300px below the heading

    for (const ta of textareas) {
        const r = ta.getBoundingClientRect();
        if (r.width < 100) continue;
        const dist = r.top - headingY;
        if (dist > 0 && dist < bestDist) {
            bestDist = dist;
            bestTa = ta;
        }
    }

    if (!bestTa) {
        log('[PMHNP] No textarea found near Message heading');
        return;
    }

    const p = (profile as any)?.personal;
    const name = p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : '';
    const msg = `I am writing to express my strong interest in this position. As a Psychiatric-Mental Health Nurse Practitioner (PMHNP) with clinical experience, I am confident I can make a meaningful contribution to your team. I look forward to discussing how my skills and experience align with your needs.\n\nBest regards,\n${name}`;

    log('[PMHNP] Filling message textarea (overwriting existing content)');
    // Clear existing content first (supervisor value may have been placed here by main filler)
    bestTa.value = '';
    bestTa.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(50);
    await smartFill(bestTa, msg);
}

async function tryUploadResume(profile: Record<string, unknown>): Promise<void> {
    const fileInputs = deepQueryAll<HTMLInputElement>('input[type="file"]');
    log(`[PMHNP] File inputs found: ${fileInputs.length}`);

    // Resume URL can be in several places in the profile
    const meta = (profile as any)?.meta;
    const docs = (profile as any)?.documents;
    const url = meta?.resumeUrl || docs?.resume?.url || docs?.resumeUrl;
    log(`[PMHNP] Resume URL: ${url || '(none)'}`);

    if (!url) {
        log('[PMHNP] No resume URL in profile â€” skipping upload');
        return;
    }

    if (fileInputs.length === 0) {
        log('[PMHNP] No file inputs found â€” skipping upload');
        return;
    }

    try {
        log(`[PMHNP] Fetching resume: ${url}`);
        const resp = await fetch(url);

        // Check for HTTP errors (404, 500, etc.)
        if (!resp.ok) {
            console.error(`[PMHNP] Resume fetch failed: HTTP ${resp.status} ${resp.statusText}`);
            log('[PMHNP] âš ï¸ Resume URL returned an error â€” file may not exist. Please update your resume URL in profile settings.');
            return;
        }

        const blob = await resp.blob();
        log(`[PMHNP] Resume fetched: ${blob.size} bytes, type=${blob.type}`);

        // Sanity check: a real PDF should be > 1KB
        if (blob.size < 1024) {
            console.error('[PMHNP] Resume file too small â€” likely not a valid file');
            return;
        }

        const name = docs?.resume?.fileName || meta?.resumeFileName || 'resume.pdf';
        const file = new File([blob], name, { type: blob.type || 'application/pdf' });
        const dt = new DataTransfer();
        dt.items.add(file);

        // Strategy 1: Try setting files on each file input
        let attached = false;
        for (const fi of fileInputs) {
            try {
                fi.files = dt.files;
                fi.dispatchEvent(new Event('change', { bubbles: true }));
                fi.dispatchEvent(new Event('input', { bubbles: true }));
                log(`[PMHNP] Set files on input: ${fi.name || fi.id || '(unnamed)'}`);
                attached = true;
                break; // Only need one
            } catch (e) {
                log(`[PMHNP] File input set failed: ${e}`);
            }
        }

        // Strategy 2: Dispatch drop event on the dropzone container
        const dropzones = deepQueryAll<HTMLElement>('[class*="dropzone"], [class*="drop-zone"], [class*="upload"], [class*="file-upload"]');
        log(`[PMHNP] Dropzone containers found: ${dropzones.length}`);

        for (const dz of dropzones) {
            try {
                const dropDt = new DataTransfer();
                dropDt.items.add(file);

                const dragEnter = new DragEvent('dragenter', { bubbles: true, dataTransfer: dropDt });
                const dragOver = new DragEvent('dragover', { bubbles: true, dataTransfer: dropDt });
                const drop = new DragEvent('drop', { bubbles: true, dataTransfer: dropDt });

                dz.dispatchEvent(dragEnter);
                dz.dispatchEvent(dragOver);
                dz.dispatchEvent(drop);
                log(`[PMHNP] Dispatched drop events on: ${dz.className?.substring(0, 50)}`);
                attached = true;
                break;
            } catch (e) {
                log(`[PMHNP] Dropzone dispatch failed: ${e}`);
            }
        }

        if (attached) {
            log('[PMHNP] âœ… Resume attached');
        } else {
            log('[PMHNP] âš ï¸ Could not attach resume to any input');
        }
    } catch (e) {
        console.error('[PMHNP] Resume error:', e);
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BUTTON CLICKS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function clickButtonByText(text: string): Promise<boolean> {
    const lower = text.toLowerCase();
    const buttons = deepQueryAll<HTMLElement>('button, [role="button"], input[type="submit"]');
    for (const btn of buttons) {
        const t = btn.textContent?.trim().toLowerCase() || '';
        const r = btn.getBoundingClientRect();
        if (r.width === 0) continue;
        if (t === lower || t.includes(lower)) {
            log(`[PMHNP] Clicking: "${btn.textContent?.trim()}"`);
            btn.click();
            await sleep(700);
            return true;
        }
    }
    const els = findAllVisibleByText(text);
    for (const el of els) {
        if ((el.textContent?.trim() || '').length < 20) { el.click(); await sleep(700); return true; }
    }
    log(`[PMHNP] âŒ Button "${text}" not found`);
    return false;
}

async function clickCheckboxByText(text: string): Promise<void> {
    const labels = findAllVisibleByText(text);
    for (const label of labels) {
        const cb = label.querySelector('input[type="checkbox"]') as HTMLInputElement
            || label.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (cb && !cb.checked) { cb.click(); cb.dispatchEvent(new Event('change', { bubbles: true })); log(`[PMHNP] âœ… Checked "${text}"`); return; }
    }
    const cbs = deepQueryAll<HTMLInputElement>('input[type="checkbox"]');
    for (const label of labels) {
        const lR = label.getBoundingClientRect();
        for (const cb of cbs) {
            if (Math.abs(cb.getBoundingClientRect().top - lR.top) < 30 && !cb.checked) {
                cb.click(); cb.dispatchEvent(new Event('change', { bubbles: true })); log(`[PMHNP] âœ… Checked "${text}" (proximity)`); return;
            }
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

export const smartrecruitersHandler: ATSHandler = {
    name: 'SmartRecruiters',
    detect: isSmartRecruiters,
    detectFields: detectSmartRecruitersFields,
    fillField: fillSmartRecruitersField,
    handleDropdown: handleSmartRecruitersDropdown,
    handleFileUpload: handleSmartRecruitersFileUpload,
};
