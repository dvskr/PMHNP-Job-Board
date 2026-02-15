import { initiateLogin, logout, getAuthState, refreshTokenIfNeeded } from '@/shared/auth';
import { fetchProfile, getProfileReadiness } from '@/shared/api';
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
