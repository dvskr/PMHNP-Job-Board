import type { ProfileData, ProfileReadiness, UsageData } from './types';
import {
    API_BASE_URL,
    PROFILE_EXPORT_ENDPOINT,
    AUTOFILL_TRACK_ENDPOINT,
    AUTOFILL_USAGE_ENDPOINT,
    AI_GENERATE_ENDPOINT,
    AI_COVER_LETTER_ENDPOINT,
    AI_BULK_ENDPOINT,
    AI_CLASSIFY_ENDPOINT,
} from './constants';
import { getAuthHeaders } from './auth';
import { getCachedProfile, setCachedProfile, isCacheStale, getCachedUsage, setCachedUsage } from './storage';
import type { AIGenerateRequest, AIGenerateResponse } from './types';

// ─── CORS Proxy ───
// Content scripts can't fetch localhost due to CORS. Route through background service worker.

function isContentScript(): boolean {
    try {
        // chrome.tabs is undefined in content scripts
        return typeof chrome !== 'undefined' && typeof chrome.tabs === 'undefined';
    } catch {
        return false;
    }
}

interface ProxyResponse {
    ok: boolean;
    status: number;
    body?: unknown;
    error?: string;
    json(): Promise<unknown>;
    text(): Promise<string>;
}

async function proxyFetch(url: string, options?: RequestInit): Promise<ProxyResponse> {
    if (!isContentScript()) {
        // In background/popup — use native fetch
        return fetch(url, options);
    }

    // In content script — proxy through background
    const serializableOptions: Record<string, unknown> = {};
    if (options?.method) serializableOptions.method = options.method;
    if (options?.headers) serializableOptions.headers = options.headers;
    if (options?.body) serializableOptions.body = options.body;

    const result = await chrome.runtime.sendMessage({
        type: 'PROXY_FETCH',
        payload: { url, options: serializableOptions },
    }) as { ok: boolean; status: number; body?: unknown; error?: string };

    if (result.error && !result.ok) {
        throw new Error(result.error);
    }

    // Return a fetch-Response-like object
    return {
        ok: result.ok,
        status: result.status,
        body: result.body,
        json: async () => result.body,
        text: async () => (typeof result.body === 'string' ? result.body : JSON.stringify(result.body)),
    };
}

// ─── Profile ───

export async function fetchProfile(forceRefresh = false): Promise<ProfileData> {
    if (!forceRefresh) {
        const cached = await getCachedProfile();
        if (cached && !(await isCacheStale())) {
            return cached.data;
        }
    }

    const headers = await getAuthHeaders();
    const response = await proxyFetch(`${API_BASE_URL}${PROFILE_EXPORT_ENDPOINT}`, {
        headers: { ...headers, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        if (response.status === 401) throw new Error('Unauthorized — please log in again');
        throw new Error(`Profile fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as ProfileData;
    await setCachedProfile(data);
    return data;
}

export function getProfileReadiness(profile: ProfileData): ProfileReadiness {
    const missing: string[] = [];
    let filled = 0;
    let total = 0;

    const check = (val: unknown, label: string, required = false) => {
        total++;
        if (val !== null && val !== undefined && val !== '') {
            filled++;
        } else if (required) {
            missing.push(label);
        }
    };

    // Required
    check(profile.personal.firstName, 'First Name', true);
    check(profile.personal.lastName, 'Last Name', true);
    check(profile.personal.email, 'Email', true);

    // Recommended
    check(profile.personal.phone, 'Phone');
    check(profile.personal.address.line1, 'Address');
    check(profile.personal.address.city, 'City');
    check(profile.personal.address.state, 'State');
    check(profile.personal.address.zip, 'ZIP Code');
    check(profile.credentials.npiNumber, 'NPI Number');
    check(profile.credentials.deaNumber, 'DEA Number');
    check(profile.credentials.licenses.length > 0 ? true : null, 'At least 1 License');
    check(profile.credentials.certifications.length > 0 ? true : null, 'At least 1 Certification');
    check(profile.education.length > 0 ? true : null, 'Education');
    check(profile.workExperience.length > 0 ? true : null, 'Work Experience');
    check(profile.meta.resumeUrl, 'Resume');

    const completeness = total > 0 ? Math.round((filled / total) * 100) : 0;
    const ready = missing.filter((m) => ['First Name', 'Last Name', 'Email'].includes(m)).length === 0;

    return { ready, missing, completeness };
}

// ─── Usage ───

export async function fetchUsage(): Promise<UsageData> {
    const cached = await getCachedUsage();
    if (cached) return cached;

    const headers = await getAuthHeaders();
    const response = await proxyFetch(`${API_BASE_URL}${AUTOFILL_USAGE_ENDPOINT}`, {
        headers: { ...headers, 'Content-Type': 'application/json' },
    });

    if (!response.ok) throw new Error(`Usage fetch failed: ${response.status}`);

    const data = (await response.json()) as UsageData;
    await setCachedUsage(data);
    return data;
}

export async function recordAutofill(
    pageUrl: string,
    atsName: string | null,
    fieldsFilled: number,
    aiGenerations: number
): Promise<void> {
    try {
        const headers = await getAuthHeaders();
        await proxyFetch(`${API_BASE_URL}${AUTOFILL_TRACK_ENDPOINT}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageUrl, atsName, fieldsFilled, aiGenerations }),
        });
    } catch (err) {
        console.error('[PMHNP] Failed to record autofill:', err);
    }
}

// ─── AI ───

export async function generateAnswer(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const headers = await getAuthHeaders();
    const response = await proxyFetch(`${API_BASE_URL}${AI_GENERATE_ENDPOINT}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (response.status === 429) {
        const data = await response.json() as { error?: string };
        throw new Error(`Rate limited: ${data.error || 'AI generation limit reached'}`);
    }

    if (!response.ok) throw new Error(`AI generation failed: ${response.status}`);

    return (await response.json()) as AIGenerateResponse;
}

export async function generateCoverLetter(
    jobTitle: string,
    employerName: string,
    jobDescription: string
): Promise<{ coverLetter: string; model: string }> {
    const headers = await getAuthHeaders();
    const response = await proxyFetch(`${API_BASE_URL}${AI_COVER_LETTER_ENDPOINT}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, employerName, jobDescription }),
    });

    if (response.status === 429) throw new Error('AI generation limit reached');
    if (!response.ok) throw new Error(`Cover letter generation failed: ${response.status}`);

    return (await response.json()) as { coverLetter: string; model: string };
}

export async function generateBulkAnswers(
    questions: AIGenerateRequest[]
): Promise<AIGenerateResponse[]> {
    const headers = await getAuthHeaders();
    const response = await proxyFetch(`${API_BASE_URL}${AI_BULK_ENDPOINT}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
    });

    if (response.status === 429) throw new Error('AI generation limit reached');
    if (!response.ok) throw new Error(`Bulk generation failed: ${response.status}`);

    return (await response.json()) as AIGenerateResponse[];
}

// ─── AI Field Classification ───

export interface ClassifyFieldsRequest {
    fields: {
        label: string;
        placeholder: string;
        attributes: Record<string, string>;
        fieldType: string;
        options: string[];
    }[];
    jobTitle?: string;
    jobDescription?: string;
    employerName?: string;
}

export interface ClassifyFieldsResponse {
    classified: {
        index: number;
        identifier: string;
        profileKey: string | null;
        value: string;
        confidence: number;
        isQuestion: boolean;
    }[];
    model: string;
    resumeUsed: boolean;
}

export async function classifyFields(request: ClassifyFieldsRequest): Promise<ClassifyFieldsResponse> {
    const headers = await getAuthHeaders();
    const response = await proxyFetch(`${API_BASE_URL}${AI_CLASSIFY_ENDPOINT}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (response.status === 429) throw new Error('AI classification limit reached');
    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Field classification failed: ${response.status} — ${errBody}`);
    }

    return (await response.json()) as ClassifyFieldsResponse;
}
