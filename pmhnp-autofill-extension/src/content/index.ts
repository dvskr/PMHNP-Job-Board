import type { ExtensionMessage, ApplicationPageInfo, ProfileData, FillResult } from '@/shared/types';
import { detectATS, isApplicationPage } from './detector';
import { mapFieldsToProfile } from './matcher';
import { fillForm } from './filler';
import { getActiveHandler } from './ats';
import { captureError } from '@/shared/errorHandler';

let cachedProfile: ProfileData | null = null;

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
            console.log(`[PMHNP] document.readyState: ${document.readyState}`);
            console.log(`[PMHNP] Total DOM elements: ${document.querySelectorAll('*').length}`);

            // Check for shadow DOM elements
            const allEls = document.querySelectorAll('*');
            let shadowCount = 0;
            for (const el of allEls) {
                if (el.shadowRoot) shadowCount++;
            }
            console.log(`[PMHNP] Elements with shadowRoot: ${shadowCount}`);

            const ats = detectATS();
            console.log('[PMHNP] ATS detection result:', ats);
            const handler = getActiveHandler();
            const fields = handler.detectFields();
            console.log(`[PMHNP] Detected ${fields.length} fields:`, fields.map(f => ({
                id: f.identifier, label: f.label, type: f.fieldType, confidence: f.confidence, category: f.fieldCategory,
            })));

            const isApp = isApplicationPage();
            console.log(`[PMHNP] isApplicationPage: ${isApp}`);

            // Log all visible inputs/selects/textareas on the page
            const allInputs = document.querySelectorAll('input, select, textarea');
            console.log(`[PMHNP] Total raw input/select/textarea: ${allInputs.length}`);
            if (allInputs.length > 0) {
                console.log(`[PMHNP] Inputs:`, Array.from(allInputs).map(el => ({
                    tag: el.tagName, type: (el as HTMLInputElement).type, name: (el as HTMLInputElement).name,
                    id: el.id, visible: (el as HTMLElement).getBoundingClientRect().width > 0,
                })));
            }

            // Check for iframes in this frame
            const iframes = document.querySelectorAll('iframe');
            console.log(`[PMHNP] Iframes in this frame: ${iframes.length}`);
            for (const iframe of iframes) {
                console.log(`[PMHNP]   iframe src="${iframe.src}", accessible=${(() => { try { return !!iframe.contentDocument; } catch { return false; } })()}`);
            }

            const info: ApplicationPageInfo = {
                isApplication: isApp,
                atsName: ats?.name || null,
                fieldCount: fields.length,
            };
            return info;
        }

        case 'START_AUTOFILL': {
            return performAutofill();
        }

        case 'PROFILE_UPDATED': {
            // Clear cached profile so next autofill fetches fresh data
            cachedProfile = null;
            return { success: true };
        }

        default:
            return {};
    }
}

// ─── Autofill Orchestration ───

async function performAutofill(): Promise<FillResult> {
    console.log('[PMHNP] Starting autofill...');

    // 1. Get profile data
    if (!cachedProfile) {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
        if (response?.error) throw new Error(response.error);
        cachedProfile = response as ProfileData;
    }

    // 2. Detect ATS and get handler
    const handler = getActiveHandler();
    console.log(`[PMHNP] Using handler: ${handler.name}`);

    // 3. Detect form fields
    const fields = handler.detectFields();
    console.log(`[PMHNP] Detected ${fields.length} form fields`);

    if (fields.length === 0) {
        throw new Error('No form fields detected on this page');
    }

    // 4. Map fields to profile data
    const mapped = mapFieldsToProfile(fields, cachedProfile);
    console.log(`[PMHNP] Mapped ${mapped.length} fields to profile data`);

    // Log detailed mapping summary
    console.log('[PMHNP] === Mapped Fields Summary ===');
    for (const m of mapped) {
        console.log(`[PMHNP]   ${m.field.identifier} → value="${String(m.value).substring(0, 30)}" status=${m.status} method=${m.fillMethod} ai=${m.requiresAI} file=${m.requiresFile}`);
    }

    // 5. Fill form
    const result = await fillForm(mapped);
    console.log(`[PMHNP] Fill complete: ${result.filled}/${result.total} fields filled`);

    // 6. SmartRecruiters-specific: run full application flow
    if (handler.name === 'SmartRecruiters' && cachedProfile) {
        try {
            const { runFullSmartRecruitersFlow } = await import('./ats/smartrecruiters');
            await runFullSmartRecruitersFlow(cachedProfile as unknown as Record<string, unknown>);
        } catch (err) {
            console.log('[PMHNP] SmartRecruiters full flow error:', err);
        }
    }

    return result;
}

// ─── Initialize ───

console.log('[PMHNP] Content script loaded');
