import { initiateLogin, logout, getAuthState, refreshTokenIfNeeded } from '@/shared/auth';
import { fetchProfile, getProfileReadiness, fetchUsage, classifyFields, recordAutofill } from '@/shared/api';
import { captureError } from '@/shared/errorHandler';
import { ALARM_NAMES, TOKEN_REFRESH_INTERVAL, PROFILE_REFRESH_INTERVAL } from '@/shared/constants';
import type { ExtensionMessage } from '@/shared/types';

// ─── Install / Startup ───

chrome.runtime.onInstalled.addListener(async () => {
    console.log('[PMHNP] Extension installed');

    // Set up alarms
    chrome.alarms.create(ALARM_NAMES.TOKEN_REFRESH, { periodInMinutes: TOKEN_REFRESH_INTERVAL });
    chrome.alarms.create(ALARM_NAMES.PROFILE_REFRESH, { periodInMinutes: PROFILE_REFRESH_INTERVAL });

    // Fetch profile if already logged in
    try {
        const auth = await getAuthState();
        if (auth.isLoggedIn) {
            await fetchProfile();
        }
    } catch (err) {
        captureError(err, 'onInstalled profile fetch');
    }
});

// ─── Alarms ───

chrome.alarms.onAlarm.addListener(async (alarm) => {
    try {
        if (alarm.name === ALARM_NAMES.TOKEN_REFRESH) {
            await refreshTokenIfNeeded();
        } else if (alarm.name === ALARM_NAMES.PROFILE_REFRESH) {
            const auth = await getAuthState();
            if (auth.isLoggedIn) {
                await fetchProfile(true);
                // Broadcast to content scripts
                broadcastToContentScripts({ type: 'PROFILE_UPDATED' });
            }
        }
    } catch (err) {
        captureError(err, `alarm:${alarm.name}`);
    }
});

// ─── Message Handling ───

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch((err) => {
            captureError(err, `message:${message.type}`);
            sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
        });

    // Return true to indicate async response
    return true;
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
    switch (message.type) {
        case 'LOGIN':
            await initiateLogin();
            return { success: true };

        case 'LOGOUT':
            await logout();
            return { success: true };

        case 'GET_AUTH_STATE':
            return getAuthState();

        case 'GET_PROFILE': {
            const profile = await fetchProfile();
            return profile;
        }

        case 'REFRESH_PROFILE': {
            const profile = await fetchProfile(true);
            broadcastToContentScripts({ type: 'PROFILE_UPDATED' });
            return profile;
        }

        case 'GET_PROFILE_READINESS': {
            const p = await fetchProfile();
            return getProfileReadiness(p);
        }

        case 'START_AUTOFILL': {
            // Forward to the active tab's content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return { error: 'No active tab found' };

            // Try to get stored frame ID for the application form
            const stored = await chrome.storage.local.get(['_autofillFrameId', '_autofillTabId']);
            const frameId = stored._autofillTabId === tab.id ? (stored._autofillFrameId ?? 0) : 0;

            try {
                const result = await chrome.tabs.sendMessage(tab.id, { type: 'START_AUTOFILL' }, { frameId });
                return result;
            } catch (err) {
                return { error: err instanceof Error ? err.message : 'Failed to start autofill' };
            }
        }

        case 'GET_USAGE': {
            return fetchUsage();
        }

        case 'AUTOFILL_COMPLETE': {
            // Forward to side panel if open
            try {
                chrome.runtime.sendMessage(message).catch(() => { });
            } catch {
                // Side panel might not be open
            }
            return { success: true };
        }

        case 'PROXY_FETCH': {
            // Proxy fetch requests from content scripts to avoid CORS
            const { url, options } = message.payload as { url: string; options?: RequestInit };
            try {
                const response = await fetch(url, options);
                const contentType = response.headers.get('content-type') || '';
                let body: unknown;
                if (contentType.includes('application/json')) {
                    body = await response.json();
                } else {
                    body = await response.text();
                }
                return { ok: response.ok, status: response.status, body };
            } catch (err) {
                return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Fetch failed' };
            }
        }

        case 'CLASSIFY_AND_MAP': {
            // AI-first classification: fetch profile + classify all fields in one shot
            const { fields, pageUrl } = message.payload as {
                fields: {
                    index: number; tagName: string; type: string; label: string;
                    placeholder: string; name: string; id: string; options: string[];
                    isRequired: boolean; currentValue: string; attributes: Record<string, string>;
                }[];
                pageUrl: string;
            };

            try {
                // 1. Fetch profile
                const profile = await fetchProfile();
                if (!profile) {
                    return { mappings: [], uploads: [], error: 'No profile data — please log in' };
                }

                // 2. Extract job context from page title
                let jobTitle = '';
                let employerName = '';
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    const title = tab?.title || '';
                    // Try to parse "Job Title - Company - ..." format
                    const parts = title.split(/\s*[-–|]\s*/);
                    if (parts.length >= 2) {
                        jobTitle = parts[0].trim();
                        employerName = parts[1].trim();
                    }
                } catch { /* ignore */ }

                // 3. Map scanned fields to classify-fields API format
                const apiFields = fields.map(f => ({
                    label: f.label || f.placeholder || f.name || f.id,
                    placeholder: f.placeholder,
                    attributes: f.attributes,
                    fieldType: f.type,
                    options: f.options,
                }));

                // 4. Call AI classification
                const result = await classifyFields({
                    fields: apiFields,
                    jobTitle,
                    employerName,
                });

                console.log(`[PMHNP-BG] AI classified ${result.classified.length} fields`);

                // 5. Map results to fill instructions
                const mappings = result.classified
                    .filter((c: { confidence: number; value: string }) => c.confidence >= 0.2 && c.value)
                    .map((c: { index: number; value: string; confidence: number }) => {
                        const f = fields[c.index];
                        let interaction: string = 'text';

                        if (f) {
                            if (f.type === 'select') interaction = 'select';
                            else if (f.type === 'radio') interaction = 'radio';
                            else if (f.type === 'checkbox') interaction = 'checkbox';
                            else if (f.type === 'date') interaction = 'date';
                            else if (f.type === 'custom-dropdown') interaction = 'dropdown';
                            else if (f.type === 'file') interaction = 'file';
                        }

                        return {
                            index: c.index,
                            value: c.value,
                            interaction,
                            confidence: c.confidence,
                        };
                    });

                // 6. Detect file upload fields
                const uploads = fields
                    .filter(f => f.type === 'file')
                    .map(f => ({
                        index: f.index,
                        documentType: 'resume',
                    }));

                return { mappings, uploads };
            } catch (err) {
                console.error('[PMHNP-BG] CLASSIFY_AND_MAP error:', err);
                return { mappings: [], uploads: [], error: err instanceof Error ? err.message : 'Classification failed' };
            }
        }

        case 'FETCH_FILE': {
            // Fetch the user's resume and return as base64
            try {
                const profile = await fetchProfile();
                const resumeUrl = (profile as any)?.meta?.resumeUrl;

                if (!resumeUrl) {
                    return { error: 'No resume URL in profile' };
                }

                console.log(`[PMHNP-BG] Fetching resume from: ${resumeUrl.substring(0, 60)}...`);
                const response = await fetch(resumeUrl);
                if (!response.ok) {
                    return { error: `Resume fetch failed: ${response.status}` };
                }

                const blob = await response.arrayBuffer();
                const base64 = btoa(
                    new Uint8Array(blob).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );

                const contentType = response.headers.get('content-type') || 'application/pdf';
                const fileName = resumeUrl.split('/').pop()?.split('?')[0] || 'resume.pdf';

                console.log(`[PMHNP-BG] Resume fetched: ${blob.byteLength} bytes, type=${contentType}`);
                return { base64, fileName, mimeType: contentType };
            } catch (err) {
                console.error('[PMHNP-BG] FETCH_FILE error:', err);
                return { error: err instanceof Error ? err.message : 'File fetch failed' };
            }
        }

        case 'RECORD_AUTOFILL': {
            // Record autofill usage to the backend
            try {
                const { pageUrl, fieldsFilled } = message.payload as { pageUrl: string; fieldsFilled: number };
                await recordAutofill(pageUrl, null, fieldsFilled, 0);
                return { success: true };
            } catch (err) {
                return { success: false, error: err instanceof Error ? err.message : 'Record failed' };
            }
        }

        default:
            return { error: `Unknown message type: ${message.type}` };
    }
}

// ─── Helpers ───

function broadcastToContentScripts(message: ExtensionMessage): void {
    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, message).catch(() => {
                    // Tab might not have content script loaded — ignore
                });
            }
        }
    });
}
