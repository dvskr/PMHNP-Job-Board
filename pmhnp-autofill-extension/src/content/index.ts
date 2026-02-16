/**
 * Content Script — v3 Hybrid Architecture
 *
 * Detection: URL fast-path (ATS domains) → DOM heuristic (field categories + confidence)
 * Pipeline:  Pre-fill hooks → Scan → Deterministic Match (~90%) → AI (unmatched only) → Fill
 */

import type { ExtensionMessage, ApplicationPageInfo } from '@/shared/types';
import { captureError } from '@/shared/errorHandler';
import { getStateMachine } from './state-machine';
import { getDOMObserver, stopDOMObserver } from './observer';
import { takeSnapshot, canUndo, restoreSnapshot } from './undo';
import { initFabIfEnabled } from './fab';
import { initOfflineDetection } from '@/shared/retry';
import { scanAllFormFields, serializeFields } from './scanner';
import type { ScannedField } from './scanner';
import { recordAutofilledUrl, getAutofilledUrls } from '@/shared/storage';
import { fillTextInput, triggerReactChange, fillSelect, fillCustomDropdown, fillRadio, fillCheckbox, simulateTyping, verifyFill, sleep } from './filler';
import { deterministicMatch, toAutofillProfile } from './deterministic-matcher';
import type { AutofillProfile } from './deterministic-matcher';
import { runPreFillHooks } from './pre-fill-hooks';
import { detectATS, isApplicationPage } from './detector';
import { runSmartRecruitersSections, fixSmartRecruitersPage1 } from './ats/smartrecruiters';
import { fillScreeningQuestions } from './screening-filler';
import { log, warn } from '@/shared/logger';

// ─── State Machine ───

const sm = getStateMachine();

sm.onStateChange((context) => {
    try {
        chrome.runtime.sendMessage({
            type: 'AUTOFILL_COMPLETE' as const,
            payload: {
                state: context.state,
                progress: context.progress,
                message: sm.getStatusMessage(),
                fillResult: context.fillResult,
            },
        }).catch(() => { });
    } catch { /* Sidebar/popup might not be open */ }
});

// ─── Message Listener ───

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    handleContentMessage(message)
        .then(sendResponse)
        .catch((err) => {
            captureError(err, `content:${message.type}`);
            sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
        });
    return true;
});

async function handleContentMessage(message: ExtensionMessage): Promise<unknown> {
    switch (message.type) {
        case 'IS_APPLICATION_PAGE': {
            log(`[PMHNP] === IS_APPLICATION_PAGE check in frame: ${window.location.href} ===`);

            // 1. Fast path: check if we're on a known ATS domain
            const ats = detectATS();
            if (ats) {
                sm.reset();
                sm.transition('DETECTED', {
                    detectedFields: [],
                    atsName: ats.name,
                    pageUrl: window.location.href,
                });
                log(`[PMHNP] Detected ATS: ${ats.name} (confidence: ${ats.confidence})`);
                return { isApplication: true, atsName: ats.name, fieldCount: -1 } as ApplicationPageInfo;
            }

            // 2. Smart path: use heuristic detection (field categories + confidence)
            const isApp = isApplicationPage();
            const fields = scanAllFormFields();

            if (isApp) {
                sm.reset();
                sm.transition('DETECTED', {
                    detectedFields: [],
                    atsName: null,
                    pageUrl: window.location.href,
                });
            }

            log(`[PMHNP] isApplicationPage: ${isApp} (${fields.length} fields)`);
            const info: ApplicationPageInfo = {
                isApplication: isApp,
                atsName: null,
                fieldCount: fields.length,
            };
            return info;
        }

        case 'START_AUTOFILL': {
            if (!sm.canStart()) {
                // Reset if stuck
                sm.reset();
            }
            return performAutofill();
        }

        case 'PROFILE_UPDATED':
            return { success: true };

        case 'UNDO_AUTOFILL' as string: {
            if (!canUndo()) return { error: 'No autofill to undo' };
            const undone = await restoreSnapshot();
            return { success: true, fieldsRestored: undone };
        }

        default:
            return { error: `Unknown message type: ${message.type}` };
    }
}

// ─── Main Autofill Pipeline ───

interface FillInstruction {
    index: number;
    value: string;
    interaction: 'text' | 'select' | 'dropdown' | 'radio' | 'checkbox' | 'date' | 'typeahead' | 'file' | 'skip';
    confidence: number;
}

interface ClassifyResponse {
    mappings: FillInstruction[];
    uploads: { index: number; documentType: string }[];
    error?: string;
}

// Track whether we're on a subsequent page (skip SmartRecruiters sections)
let _isSubsequentPage = false;

/**
 * Enrich select/dropdown fields that have 0 options (lazy-loaded by custom dropdown libraries).
 * Clicks each dropdown open to force DOM rendering, captures option text, then closes it.
 */
async function enrichFieldOptions(fields: ScannedField[]): Promise<void> {
    let enriched = 0;
    for (const field of fields) {
        // Only enrich select/dropdown fields with no options (not custom-dropdown overlays — those are visual duplicates)
        if (field.type !== 'select' && field.type !== 'custom-dropdown') continue;
        if (field.options.length > 0) continue;
        if (!field.element) continue;

        // Skip custom-dropdown overlay fields — enriching them opens the same dropdown twice and breaks Vue state
        if (field.type === 'custom-dropdown') {
            // But still try to capture options from their DOM without clicking
            const optEls = field.element.querySelectorAll('.multiselect__option, [role="option"], .select2-results__option');
            if (optEls.length > 0) {
                const opts: string[] = [];
                optEls.forEach(el => {
                    const t = el.textContent?.trim();
                    if (t && t.length > 0 && t.length < 200 && t !== '--' && t !== 'Select' && t !== '--Blank--') opts.push(t);
                });
                if (opts.length > 0) {
                    field.options = [...new Set(opts)];
                    enriched++;
                    log(`[PMHNP] 📋 Enriched [${field.index}] "${field.label || field.name}" with ${field.options.length} options (static DOM scan)`);
                }
            }
            continue;
        }

        // For native selects, find the adjacent custom dropdown overlay
        let overlayEl: HTMLElement | null = null;
        if (field.element.tagName === 'SELECT') {
            // Look for adjacent combobox/overlay
            let sibling = field.element.nextElementSibling as HTMLElement | null;
            for (let i = 0; sibling && i < 3; i++) {
                if (sibling.getAttribute('role') === 'combobox' ||
                    sibling.getAttribute('role') === 'listbox' ||
                    sibling.classList.contains('multiselect') ||
                    sibling.classList.contains('select2-container') ||
                    sibling.querySelector('[role="combobox"], [role="listbox"]')) {
                    overlayEl = sibling;
                    break;
                }
                sibling = sibling.nextElementSibling as HTMLElement | null;
            }
        } else {
            // custom-dropdown type — use the element itself
            overlayEl = field.element as HTMLElement;
        }

        if (!overlayEl) continue;

        try {
            // Click the overlay to open it and force options to render
            const toggle = overlayEl.querySelector(
                '[role="combobox"], .multiselect__select, .select2-selection, [class*="toggle"]'
            ) as HTMLElement;
            const clickTarget = toggle || overlayEl;
            clickTarget.click();
            clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            await sleep(350);  // Wait for options to render

            // Capture all rendered options
            const optionSelectors = [
                '[role="option"]',
                '.multiselect__element span',
                '.multiselect__option',
                '.select2-results__option',
                '.chosen-results li',
                'li[data-value]',
                'ul li',
            ];

            const capturedOptions: string[] = [];
            // Search in the overlay and also in document body (portaled dropdowns)
            const searchRoots = [overlayEl, document.body];
            for (const root of searchRoots) {
                for (const sel of optionSelectors) {
                    try {
                        const opts = root.querySelectorAll(sel);
                        for (const opt of opts) {
                            const text = opt.textContent?.trim();
                            if (text && text.length > 0 && text.length < 200 &&
                                text !== '--' && text !== 'Select' && text !== '--Blank--') {
                                capturedOptions.push(text);
                            }
                        }
                        if (capturedOptions.length > 0) break;
                    } catch { /* ignore selector errors */ }
                }
                if (capturedOptions.length > 0) break;
            }

            // Close the dropdown
            clickTarget.click();
            await sleep(100);
            // Also press Escape to ensure it's closed
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await sleep(100);

            if (capturedOptions.length > 0) {
                const uniqueOptions = [...new Set(capturedOptions)];
                field.options = uniqueOptions;
                enriched++;
                log(`[PMHNP] 📋 Enriched [${field.index}] "${field.label || field.name}" with ${uniqueOptions.length} options: ${uniqueOptions.slice(0, 5).join(', ')}...`);
            }
        } catch (err) {
            warn(`[PMHNP] ⚠️ Failed to enrich options for [${field.index}] "${field.label}":`, err);
        }
    }
    if (enriched > 0) {
        log(`[PMHNP] 📋 Enriched options for ${enriched} fields`);
    }
}

async function performAutofill(): Promise<{ success: boolean; fieldsFilled: number; error?: string }> {
    try {
        log('[PMHNP] ═══ Starting v3 hybrid autofill pipeline ═══');

        // Step 0: State machine
        sm.reset();
        sm.transition('DETECTED', { detectedFields: [], atsName: null, pageUrl: window.location.href });
        const currentUrl = window.location.href;

        // Step 1: Fetch profile from background
        sm.transition('CHECKING_USAGE');
        log('[PMHNP] Fetching profile...');
        const profileResponse = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' }) as any;
        if (!profileResponse || profileResponse.error) {
            sm.error('Failed to load profile');
            return { success: false, fieldsFilled: 0, error: 'Failed to load profile' };
        }
        const profile: AutofillProfile = toAutofillProfile(profileResponse);
        log(`[PMHNP] Profile loaded: ${profile.firstName} ${profile.lastName}`);

        // Step 2: Pre-fill hooks (expand +Add sections, trigger lazy load)
        sm.transition('LOADING_PROFILE');
        await runPreFillHooks();

        // Step 3: Scan all form fields
        const fields = scanAllFormFields();
        if (fields.length === 0) {
            log('[PMHNP] No standard form fields found — will still attempt screening questions and ATS fixups');
        }
        log(`[PMHNP] Scanned ${fields.length} form fields`);
        fields.forEach((f, i) => {
            log(`[PMHNP]   [${i}] ${f.type} label="${f.label}" name="${f.name}" id="${f.id}" required=${f.isRequired}`);
        });

        // Step 3.5: Enrich options for select fields with 0 options (lazy-loaded dropdowns)
        await enrichFieldOptions(fields);

        // Step 4: Deterministic matching (instant, free)
        sm.transition('ANALYZING');
        const { matched, unmatched } = deterministicMatch(fields, profile);
        log(`[PMHNP] Deterministic: ${matched.length} matched, ${unmatched.length} unmatched`);

        // Step 5: AI classification for unmatched fields only
        let aiInstructions: FillInstruction[] = [];
        let aiUploads: { index: number; documentType: string }[] = [];

        if (unmatched.length > 0) {
            // Filter out custom-dropdown overlay fields — they are visual duplicates of
            // native selects and should never be independently filled by the AI.
            // Also filter out search inputs which are internal to multiselect dropdowns.
            const aiCandidates = unmatched.filter(u => {
                if (u.field.type === 'custom-dropdown') {
                    log(`[PMHNP] ⏭️ Skipping [${u.index}] "${u.field.label}" — custom-dropdown overlay (handled via native select)`);
                    return false;
                }
                if (u.field.type === 'search') {
                    log(`[PMHNP] ⏭️ Skipping [${u.index}] "${u.field.label}" — internal search input`);
                    return false;
                }
                return true;
            });

            if (aiCandidates.length > 0) {
                log(`[PMHNP] Sending ${aiCandidates.length} unmatched fields to AI (filtered from ${unmatched.length})...`);
                const serialized = serializeFields(aiCandidates.map(u => u.field));

                // Create index mapping: AI sees fields 0..N but they map to original indices
                const indexMap = aiCandidates.map(u => u.index);

                try {
                    const response = await chrome.runtime.sendMessage({
                        type: 'CLASSIFY_AND_MAP',
                        payload: {
                            fields: serialized,
                            pageUrl: currentUrl,
                        },
                    }) as ClassifyResponse;

                    if (!response.error) {
                        // Remap AI indices back to original field indices
                        aiInstructions = (response.mappings || []).map(m => ({
                            ...m,
                            index: indexMap[m.index] ?? m.index,
                        }));
                        aiUploads = (response.uploads || []).map(u => ({
                            ...u,
                            index: indexMap[u.index] ?? u.index,
                        }));
                        log(`[PMHNP] AI returned ${aiInstructions.length} fill instructions, ${aiUploads.length} uploads`);
                    } else {
                        warn('[PMHNP] AI classification failed (non-fatal):', response.error);
                    }
                } catch (err) {
                    warn('[PMHNP] AI classification call failed (non-fatal):', err);
                }
            } else {
                log('[PMHNP] All fields matched or filtered — no AI needed!');
            }
        }

        // Step 6: Take undo snapshot
        takeSnapshot();

        // Step 7: Fill deterministically matched fields
        sm.transition('FILLING_SIMPLE');
        let filled = 0;

        // Detect ATS once to handle platform-specific quirks during fill
        const preAtsInfo = detectATS();
        const isSmartRecruiters = preAtsInfo?.name === 'SmartRecruiters';

        for (const match of matched) {
            if (match.interaction === 'file') {
                // Handle file uploads separately
                aiUploads.push({ index: match.index, documentType: 'resume' });
                continue;
            }

            // SmartRecruiters: skip city custom-dropdown (Angular WebComponent, can't fill)
            if (isSmartRecruiters && match.profileKey === 'city' && match.field.type === 'custom-dropdown') {
                log(`[PMHNP]   ⏭️ Skipping [${match.index}] city (SmartRecruiters WebComponent)`);
                continue;
            }

            try {
                log(`[PMHNP] ⚡ [${match.index}] "${match.field.label || match.field.id}" (${match.profileKey}) = "${match.value.substring(0, 40)}"`);
                const success = await universalFill(match.field, match.value, match.interaction);
                if (success) {
                    filled++;
                    log(`[PMHNP]   ✅ Filled [${match.index}] (deterministic)`);
                } else {
                    log(`[PMHNP]   ❌ Failed [${match.index}]`);
                }
                await sleep(80);
            } catch (err) {
                console.error(`[PMHNP]   ❌ Error filling [${match.index}]:`, err);
            }
        }

        // Step 8: Fill AI-classified fields
        for (const instruction of aiInstructions) {
            if (instruction.interaction === 'skip' || !instruction.value) continue;

            const field = fields[instruction.index];
            if (!field) continue;

            // Skip if the field already has a value (e.g. filled deterministically)
            const el = field.element as HTMLInputElement;
            if (el.value && el.value.trim().length > 0) {
                log(`[PMHNP] ⏭️ [${instruction.index}] "${field.label || field.id}" already has value "${el.value.substring(0, 30)}" — skipping AI fill`);
                continue;
            }

            try {
                log(`[PMHNP] 🤖 [${instruction.index}] "${field.label || field.id}" (AI) = "${instruction.value.substring(0, 40)}"`);
                const success = await universalFill(field, instruction.value, instruction.interaction);
                if (success) {
                    filled++;
                    log(`[PMHNP]   ✅ Filled [${instruction.index}] (AI)`);
                } else {
                    log(`[PMHNP]   ❌ Failed [${instruction.index}]`);
                }
                await sleep(80);
            } catch (err) {
                console.error(`[PMHNP]   ❌ Error filling [${instruction.index}]:`, err);
            }
        }

        // Step 9: Handle file uploads (resume, etc.)
        // SmartRecruiters has 3 file inputs: [0] profile image, [1] resume (triggers parser!), [12] additional docs
        // We only want to upload to the LAST file input on SR to avoid triggering their resume parser.
        if (isSmartRecruiters && aiUploads.length > 1) {
            // Only keep the LAST file upload — it's the "additional documents" field, not the resume parser
            const lastUpload = aiUploads[aiUploads.length - 1];
            const skipped = aiUploads.slice(0, -1);
            for (const s of skipped) {
                log(`[PMHNP] ⏭️ Skipping file [${s.index}] — SmartRecruiters (only uploading to last file field)`);
            }
            aiUploads.length = 0;
            aiUploads.push(lastUpload);
        }

        for (const upload of aiUploads) {
            const field = fields[upload.index];
            if (!field) continue;

            try {
                log(`[PMHNP] 📎 Uploading ${upload.documentType} to [${upload.index}]...`);
                const fileData = await chrome.runtime.sendMessage({
                    type: 'FETCH_FILE',
                    payload: { documentType: upload.documentType },
                }) as { base64: string; fileName: string; mimeType: string; error?: string };

                if (fileData.error || !fileData.base64) {
                    log(`[PMHNP]   ⚠️ File fetch failed: ${fileData.error}`);
                    continue;
                }

                const success = await attachFileToElement(field.element, fileData.base64, fileData.fileName, fileData.mimeType);
                if (success) {
                    filled++;
                    log(`[PMHNP]   ✅ File attached`);
                }
            } catch (err) {
                console.error(`[PMHNP]   ❌ File upload error:`, err);
            }
        }

        // Step 9.5: ATS-specific fixes
        if (isSmartRecruiters) {
            if (!_isSubsequentPage) {
                // Page-1 fixup: city autocomplete, confirm email, LinkedIn
                log('[PMHNP] Running SmartRecruiters page-1 fixup...');
                try {
                    const page1Fixed = await fixSmartRecruitersPage1(profileResponse);
                    filled += page1Fixed;
                } catch (err) {
                    warn('[PMHNP] SmartRecruiters page-1 fixup failed (non-fatal):', err);
                }

                // Multi-step sections: experience + education
                log('[PMHNP] Running SmartRecruiters experience+education sections...');
                try {
                    const sectionResult = await runSmartRecruitersSections(profileResponse);
                    filled += sectionResult.filled;
                } catch (err) {
                    warn('[PMHNP] SmartRecruiters sections failed (non-fatal):', err);
                }

                // Start watching for page changes (SPA navigation to page 2, 3, etc.)
                startSmartRecruitersPageObserver();
            } else {
                log('[PMHNP] Subsequent page — skipping SmartRecruiters sections (experience/education)');
            }
        }

        // Step 9.6: Universal screening questions fill (works for ALL ATS platforms)
        log('[PMHNP] Running universal screening questions fill...');
        try {
            const screeningFixed = await fillScreeningQuestions(profileResponse);
            filled += screeningFixed;
        } catch (err) {
            warn('[PMHNP] Screening questions fill failed (non-fatal):', err);
        }

        // Step 9.7: Post-fill sweep — sync ALL select displays on the page
        // This catches selects where per-field overlay sync failed
        log('[PMHNP] Running post-fill select display sweep...');
        try {
            const selectsSynced = syncAllSelectDisplays();
            if (selectsSynced > 0) {
                log(`[PMHNP] 🔄 Post-fill sweep synced ${selectsSynced} select displays`);
            }
        } catch (err) {
            warn('[PMHNP] Post-fill sweep failed (non-fatal):', err);
        }

        // Step 10: Record
        log(`[PMHNP] ═══ Fill complete: ${filled}/${fields.length} fields ═══`);
        log(`[PMHNP]   Deterministic: ${matched.filter(m => m.interaction !== 'file').length} | AI: ${aiInstructions.filter(i => i.interaction !== 'skip' && i.value).length} | Uploads: ${aiUploads.length}`);
        await recordAutofilledUrl(currentUrl);

        try {
            chrome.runtime.sendMessage({
                type: 'RECORD_AUTOFILL',
                payload: { pageUrl: currentUrl, fieldsFilled: filled },
            }).catch(() => { });
        } catch { /* ignore */ }

        sm.transition('COMPLETE', {
            fillResult: {
                total: fields.length,
                filled,
                skipped: fields.length - filled,
                failed: 0,
                needsAI: unmatched.length,
                needsFile: aiUploads.length,
                details: [],
            },
        });

        return { success: true, fieldsFilled: filled };
    } catch (err) {
        console.error('[PMHNP] Pipeline error:', err);
        sm.error(err instanceof Error ? err.message : 'Unknown error');
        return { success: false, fieldsFilled: 0, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

// ─── Universal Fill ───

async function universalFill(field: ScannedField, value: string, interaction: string): Promise<boolean> {
    const el = field.element;

    switch (interaction) {
        case 'text':
        case 'typeahead': {
            await fillTextInput(el, value);
            // Verify
            if (!verifyFill(el, value)) {
                log('[PMHNP]   Verification failed, trying character-by-character...');
                await simulateTyping(el, value);
            }
            return verifyFill(el, value);
        }

        case 'select': {
            if (el.tagName.toLowerCase() === 'select') {
                await fillSelect(el, value, field.overlayElement);
            } else {
                await fillCustomDropdown(el, value);
            }
            return true;
        }

        case 'dropdown': {
            await fillCustomDropdown(el, value);
            return true;
        }

        case 'radio': {
            await fillRadio(el, value);
            return true;
        }

        case 'checkbox': {
            await fillCheckbox(el, value === 'true' || value === 'yes' || value === 'Yes');
            return true;
        }

        case 'date': {
            // Try native date setter
            const input = el as HTMLInputElement;
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) {
                nativeSetter.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                triggerReactChange(el, value);
            }
            return true;
        }

        default:
            log(`[PMHNP]   Unknown interaction type: ${interaction}`);
            return false;
    }
}

// ─── File Attachment ───

async function attachFileToElement(el: HTMLElement, base64: string, fileName: string, mimeType: string): Promise<boolean> {
    try {
        // Decode base64 to blob
        const byteString = atob(base64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: mimeType });
        const file = new File([blob], fileName, { type: mimeType });

        // Method 1: Direct input.files setter via DataTransfer
        const input = el.tagName === 'INPUT' ? el as HTMLInputElement : el.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            log(`[PMHNP] Set files on input: ${input.id || input.name}`);

            // Method 2: Also dispatch drop events on nearby drop zones
            const dropZone = input.closest('[class*="upload"], [class*="drop"], [class*="file"], [data-testid*="upload"]')
                || input.parentElement;
            if (dropZone) {
                const dropEvent = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dt,
                });
                dropZone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
                dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
                dropZone.dispatchEvent(dropEvent);
                log(`[PMHNP] Dispatched drop events on: ${(dropZone as HTMLElement).className?.substring(0, 40)}`);
            }

            return true;
        }

        return false;
    } catch (err) {
        console.error('[PMHNP] File attachment error:', err);
        return false;
    }
}

// ─── Post-Fill Select Display Sweep ───

/**
 * After all fields are filled, walk every <select> on the page and sync
 * the visual display element with the selected option text.
 * Checks siblings (select2 puts display NEXT to the select, not inside ancestors).
 */
function syncAllSelectDisplays(): number {
    let synced = 0;
    const allSelects = document.querySelectorAll('select');
    log(`[PMHNP] Post-sweep: checking ${allSelects.length} selects on page`);

    for (const select of allSelects) {
        const selectedOption = select.options[select.selectedIndex];
        if (!selectedOption) continue;
        const text = selectedOption.text?.trim();
        if (!text) continue;
        // Skip default/placeholder options
        if (selectedOption.value === '' || selectedOption.disabled) continue;

        const selectId = select.id || select.name || '(unnamed)';

        // Strategy 1: Check siblings of the select (select2 places wrapper next to select)
        let displayEl = findDisplayInSiblings(select);

        // Strategy 2: Walk ancestors and search descendants
        if (!displayEl) {
            let ancestor: HTMLElement | null = select.parentElement;
            for (let level = 0; ancestor && level < 4 && !displayEl; level++, ancestor = ancestor.parentElement) {
                displayEl = findNearestDisplayElement(ancestor, select);
            }
        }

        if (displayEl) {
            const currentText = displayEl.textContent?.trim() || '';
            const textLower = text.toLowerCase();
            const currentLower = currentText.toLowerCase();

            // Check if the display already shows the correct text
            const alreadyCorrect = currentLower.includes(textLower) || textLower.includes(currentLower);
            const isEmpty = currentText === '' || currentLower === '--blank--' || currentLower.includes('select');

            if (!alreadyCorrect || isEmpty) {
                displayEl.textContent = text;
                log(`[PMHNP] 🔄 Post-sweep: "${selectId}" display updated to "${text}" (was "${currentText}")`);
                synced++;
            }
        } else {
            log(`[PMHNP] Post-sweep: "${selectId}" value="${selectedOption.value}" — no display element found`);
        }
    }
    return synced;
}

/**
 * Check siblings of a select element for display elements (select2 pattern).
 * Select2 places: <select style="display:none"> <span class="select2 ...">...</span>
 */
function findDisplayInSiblings(select: HTMLSelectElement): HTMLElement | null {
    // Check next siblings (select2, chosen, etc. place their container right after)
    let sibling = select.nextElementSibling as HTMLElement | null;
    for (let i = 0; sibling && i < 5; i++) {
        if (!(sibling instanceof HTMLElement)) {
            sibling = (sibling as Element).nextElementSibling as HTMLElement | null;
            continue;
        }

        // Check known display selectors inside this sibling
        const knownSelectors = [
            '.select2-selection__rendered',
            '.multiselect__single',
            '.chosen-single span',
            '[class*="single-value"]',
        ];
        for (const sel of knownSelectors) {
            const el = sibling.querySelector(sel) as HTMLElement;
            if (el) return el;
        }

        // Check if sibling itself is a select2/multiselect/chosen container
        const className = sibling.className?.toString?.() || '';
        if (/select2|multiselect|chosen/i.test(className)) {
            // Find the display span inside
            const spans = sibling.querySelectorAll('span');
            for (const span of spans) {
                const s = span as HTMLElement;
                if (isElementVisible(s) && s.children.length === 0) {
                    const rect = s.getBoundingClientRect();
                    if (rect.width > 20 && rect.height > 8) return s;
                }
            }
            // If no leaf span, find any visible rendered span
            for (const span of spans) {
                const s = span as HTMLElement;
                if (isElementVisible(s)) {
                    const rect = s.getBoundingClientRect();
                    if (rect.width > 20 && rect.height > 8) return s;
                }
            }
        }

        sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    // Also check parent's children (in case select is wrapped)
    const parent = select.parentElement;
    if (parent) {
        for (const child of parent.children) {
            if (child === select || !(child instanceof HTMLElement)) continue;
            const className = child.className?.toString?.() || '';
            if (/select2|multiselect|chosen/i.test(className)) {
                const rendered = child.querySelector('.select2-selection__rendered, .multiselect__single, .chosen-single span') as HTMLElement;
                if (rendered) return rendered;
            }
        }
    }

    return null;
}

/**
 * Find the nearest visible text display element within an ancestor's subtree.
 */
function findNearestDisplayElement(
    ancestor: HTMLElement,
    select: HTMLSelectElement
): HTMLElement | null {
    const knownSelectors = [
        '.multiselect__single',
        '.select2-selection__rendered',
        '.chosen-single span',
        '[class*="single-value"]',
    ];
    for (const sel of knownSelectors) {
        const el = ancestor.querySelector(sel) as HTMLElement;
        if (el && isElementVisible(el)) return el;
    }

    // Generic: find any visible span inside an overlay-like element
    const overlayLike = ancestor.querySelector(
        '[class*="select2"], [class*="multiselect"], [class*="chosen"], [aria-expanded]'
    );
    if (overlayLike) {
        const spans = overlayLike.querySelectorAll('span');
        const selectRect = select.getBoundingClientRect();
        for (const span of spans) {
            const s = span as HTMLElement;
            if (!isElementVisible(s)) continue;
            const sRect = s.getBoundingClientRect();
            if (Math.abs(sRect.top - selectRect.top) < 200 && sRect.width > 20 && sRect.height > 10) {
                return s;
            }
        }
    }

    return null;
}

function isElementVisible(el: HTMLElement): boolean {
    try {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) return false;
        return true;
    } catch {
        return false;
    }
}

// ─── SmartRecruiters Multi-Page Observer ───

let _srPageObserver: MutationObserver | null = null;
let _srLastFieldSnapshot = '';

function startSmartRecruitersPageObserver() {
    if (_srPageObserver) return; // Already watching

    log('[PMHNP] Starting SmartRecruiters page observer for subsequent pages...');

    // Take a snapshot of current form fields to detect changes
    _srLastFieldSnapshot = getFieldSnapshotKey();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isProcessing = false;

    _srPageObserver = new MutationObserver(() => {
        if (isProcessing) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            // Check if the form fields changed significantly (new page)
            const currentSnapshot = getFieldSnapshotKey();
            if (currentSnapshot === _srLastFieldSnapshot) return;
            if (currentSnapshot === '') return; // No fields = transition in progress

            log('[PMHNP] 🔄 SmartRecruiters page change detected!');
            log(`[PMHNP]   Previous snapshot: ${_srLastFieldSnapshot.substring(0, 80)}...`);
            log(`[PMHNP]   Current snapshot:  ${currentSnapshot.substring(0, 80)}...`);

            _srLastFieldSnapshot = currentSnapshot;
            isProcessing = true;

            try {
                // Re-run the autofill pipeline for this new page
                _isSubsequentPage = true;
                sm.reset();
                log('[PMHNP] ═══ Auto-filling SmartRecruiters page 2+ ═══');
                await performAutofill();
            } catch (err) {
                warn('[PMHNP] Auto-fill on page change failed:', err);
            } finally {
                isProcessing = false;
            }
        }, 2000); // Wait 2s for page to stabilize
    });

    _srPageObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function getFieldSnapshotKey(): string {
    // Create a string fingerprint of visible form fields on the page
    const fields = scanAllFormFields();
    return fields.map(f => `${f.type}:${f.label}:${f.id}`).join('|');
}

// ─── Page Init ───

function init() {
    log('[PMHNP] Content script v3 loaded');

    let detected = false;

    function markDetected(atsName: string | null, source: string, fieldCount: number) {
        if (detected) return;
        detected = true;
        log(`[PMHNP] Application detected via ${source}${atsName ? ` (ATS: ${atsName})` : ''} — ${fieldCount} fields`);
        sm.reset();
        sm.transition('DETECTED', {
            detectedFields: [],
            atsName,
            pageUrl: window.location.href,
        });

        // Store frame info for the background script
        try {
            const frameId = (window as any).__pmhnp_frameId ?? 0;
            chrome.storage.local.set({
                _autofillFrameId: frameId,
                _autofillTabId: undefined,
            });
        } catch { /* ignore */ }
    }

    // ── Step 1: URL-based fast path ──
    // If on a known ATS domain, mark as detected immediately (no DOM scan needed)
    const ats = detectATS();
    if (ats && ats.confidence >= 0.7) {
        markDetected(ats.name, 'url-fast-path', -1);
    }

    // ── Step 2: Smart detection via DOM heuristics ──
    function tryDetect(source: string) {
        if (detected) return;
        try {
            if (isApplicationPage()) {
                const fields = scanAllFormFields();
                const atsResult = detectATS();
                markDetected(atsResult?.name || null, source, fields.length);
            }
        } catch (err) {
            captureError(err, `auto-detect:${source}`);
        }
    }

    // ── Step 3: MutationObserver-driven detection ──
    // Instead of fixed timers, detect the moment forms appear in the DOM
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    getDOMObserver(() => {
        if (detected) return;
        // Debounce rapid DOM changes (SPA rendering) — 300ms is enough for most frameworks
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => tryDetect('dom-mutation'), 300);
    });

    // ── Step 4: Single fallback timer for slow-loading SPAs ──
    // Only needed for edge cases where MutationObserver misses (e.g. Workday iframes)
    if (!detected) {
        setTimeout(() => tryDetect('fallback-2s'), 2000);
    }

    // Init FAB (floating action button)
    initFabIfEnabled();

    // Init offline detection
    initOfflineDetection();
}

// Export for the loader
export function onExecute(_ctx?: { perf?: { injectTime: number; loadTime: number } }) {
    init();
}

// Also run immediately
init();
