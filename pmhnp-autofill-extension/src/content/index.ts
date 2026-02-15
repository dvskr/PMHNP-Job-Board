/**
 * Content Script — v2 Architecture
 *
 * Pipeline: Scan → Classify (via background) → Fill (universal filler)
 * No pattern matching. No ATS-specific handlers. AI does everything.
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
            console.log(`[PMHNP] === IS_APPLICATION_PAGE check in frame: ${window.location.href} ===`);
            const fields = scanAllFormFields();
            const isApp = fields.length >= 3; // At least 3 form fields = likely an application

            if (isApp) {
                sm.reset();
                sm.transition('DETECTED', {
                    detectedFields: [],
                    atsName: null,
                    pageUrl: window.location.href,
                });
            }

            console.log(`[PMHNP] isApplicationPage: ${isApp} (${fields.length} fields)`);
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

async function performAutofill(): Promise<{ success: boolean; fieldsFilled: number; error?: string }> {
    try {
        console.log('[PMHNP] ═══ Starting v2 autofill pipeline ═══');

        // Step 0: State machine
        sm.reset();
        sm.transition('DETECTED', { detectedFields: [], atsName: null, pageUrl: window.location.href });

        // Step 1: Check if already filled
        const autofilledUrls = await getAutofilledUrls();
        const currentUrl = window.location.href;

        // Step 2: Scan all form fields
        sm.transition('CHECKING_USAGE');
        const fields = scanAllFormFields();

        if (fields.length === 0) {
            sm.error('No form fields found on this page');
            return { success: false, fieldsFilled: 0, error: 'No form fields found' };
        }

        console.log(`[PMHNP] Scanned ${fields.length} form fields`);
        fields.forEach((f, i) => {
            console.log(`[PMHNP]   [${i}] ${f.type} label="${f.label}" name="${f.name}" id="${f.id}" required=${f.isRequired}`);
        });

        // Step 3: Send to background for AI classification
        console.log('[PMHNP] Sending fields to AI for classification...');
        sm.transition('LOADING_PROFILE');

        const serialized = serializeFields(fields);
        const response = await chrome.runtime.sendMessage({
            type: 'CLASSIFY_AND_MAP',
            payload: {
                fields: serialized,
                pageUrl: currentUrl,
            },
        }) as ClassifyResponse;

        if (response.error) {
            console.error('[PMHNP] CLASSIFY_AND_MAP error:', response.error);
            sm.error(response.error);
            return { success: false, fieldsFilled: 0, error: response.error };
        }

        console.log(`[PMHNP] AI returned ${response.mappings.length} fill instructions, ${response.uploads.length} uploads`);

        // Step 4: Take undo snapshot
        sm.transition('ANALYZING');
        const filledFields = response.mappings.filter(m => m.interaction !== 'skip' && m.value);
        if (filledFields.length > 0) {
            const snapshotFields = filledFields.map(m => ({
                field: { element: fields[m.index].element },
            }));
            takeSnapshot();
        }

        // Step 5: Fill fields
        sm.transition('FILLING_SIMPLE');
        let filled = 0;

        for (const instruction of response.mappings) {
            if (instruction.interaction === 'skip' || !instruction.value) {
                console.log(`[PMHNP]   ⏭️ [${instruction.index}] skipped (${instruction.interaction})`);
                continue;
            }

            const field = fields[instruction.index];
            if (!field) {
                console.log(`[PMHNP]   ⚠️ [${instruction.index}] field not found`);
                continue;
            }

            try {
                console.log(`[PMHNP] Filling [${instruction.index}] "${field.label || field.name}" (${instruction.interaction}) = "${instruction.value.substring(0, 40)}..."`);

                const success = await universalFill(field, instruction.value, instruction.interaction);

                if (success) {
                    filled++;
                    console.log(`[PMHNP]   ✅ Filled [${instruction.index}]`);
                } else {
                    console.log(`[PMHNP]   ❌ Failed [${instruction.index}]`);
                }

                await sleep(100); // Small delay between fields
            } catch (err) {
                console.error(`[PMHNP]   ❌ Error filling [${instruction.index}]:`, err);
            }
        }

        // Step 6: Handle file uploads
        for (const upload of response.uploads) {
            const field = fields[upload.index];
            if (!field) continue;

            try {
                console.log(`[PMHNP] Uploading ${upload.documentType} to [${upload.index}]...`);
                const fileData = await chrome.runtime.sendMessage({
                    type: 'FETCH_FILE',
                    payload: { documentType: upload.documentType },
                }) as { base64: string; fileName: string; mimeType: string; error?: string };

                if (fileData.error || !fileData.base64) {
                    console.log(`[PMHNP]   ⚠️ File fetch failed: ${fileData.error}`);
                    continue;
                }

                const success = await attachFileToElement(field.element, fileData.base64, fileData.fileName, fileData.mimeType);
                if (success) {
                    filled++;
                    console.log(`[PMHNP]   ✅ File attached`);
                }
            } catch (err) {
                console.error(`[PMHNP]   ❌ File upload error:`, err);
            }
        }

        // Step 7: Record
        console.log(`[PMHNP] ═══ Fill complete: ${filled}/${fields.length} fields ═══`);
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
                needsAI: 0,
                needsFile: response.uploads.length,
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
                console.log('[PMHNP]   Verification failed, trying character-by-character...');
                await simulateTyping(el, value);
            }
            return verifyFill(el, value);
        }

        case 'select': {
            if (el.tagName.toLowerCase() === 'select') {
                await fillSelect(el, value);
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
            console.log(`[PMHNP]   Unknown interaction type: ${interaction}`);
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
            console.log(`[PMHNP] Set files on input: ${input.id || input.name}`);

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
                console.log(`[PMHNP] Dispatched drop events on: ${(dropZone as HTMLElement).className?.substring(0, 40)}`);
            }

            return true;
        }

        return false;
    } catch (err) {
        console.error('[PMHNP] File attachment error:', err);
        return false;
    }
}

// ─── Page Init ───

function init() {
    console.log('[PMHNP] Content script v2 loaded');

    // Start DOM observer
    getDOMObserver(() => {
        // On new elements, just log — re-detection happens on demand
        console.log('[PMHNP-Observer] DOM changed');
    });

    // Init FAB (floating action button)
    initFabIfEnabled();

    // Init offline detection
    initOfflineDetection();

    // Auto-detect on load
    setTimeout(async () => {
        try {
            const fields = scanAllFormFields();
            if (fields.length >= 3) {
                console.log(`[PMHNP] Auto-detected ${fields.length} form fields on page load`);
                sm.reset();
                sm.transition('DETECTED', {
                    detectedFields: [],
                    atsName: null,
                    pageUrl: window.location.href,
                });

                // Store frame info for the background script
                try {
                    const frameId = (window as any).__pmhnp_frameId ?? 0;
                    chrome.storage.local.set({
                        _autofillFrameId: frameId,
                        _autofillTabId: undefined, // will be set by background
                    });
                } catch { /* ignore */ }
            }
        } catch (err) {
            captureError(err, 'auto-detect');
        }
    }, 1500);
}

// Export for the loader
export function onExecute(_ctx?: { perf?: { injectTime: number; loadTime: number } }) {
    init();
}

// Also run immediately
init();
