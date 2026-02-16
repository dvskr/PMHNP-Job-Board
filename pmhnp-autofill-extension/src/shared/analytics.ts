/**
 * Extension analytics module.
 * Tracks autofill success rates, ATS detection accuracy, and field match
 * confidence distribution — only when the user has opted in.
 */
import { getSettings } from './storage';

interface AnalyticsEvent {
    event: string;
    properties: Record<string, string | number | boolean>;
    timestamp: number;
}

let eventQueue: AnalyticsEvent[] = [];
const MAX_QUEUE_SIZE = 50;
const FLUSH_INTERVAL = 30_000; // 30 seconds

/**
 * Track an analytics event. Only recorded if the user has opted in.
 */
export async function trackEvent(
    event: string,
    properties: Record<string, string | number | boolean> = {}
): Promise<void> {
    try {
        const settings = await getSettings();
        if (!settings.sendAnalytics) return;

        eventQueue.push({
            event,
            properties: {
                ...properties,
                extensionVersion: chrome.runtime.getManifest().version,
            },
            timestamp: Date.now(),
        });

        // Flush if queue is large enough
        if (eventQueue.length >= MAX_QUEUE_SIZE) {
            await flushEvents();
        }
    } catch {
        // Analytics should never break the extension
    }
}

/**
 * Track an autofill completion.
 */
export async function trackAutofillComplete(data: {
    atsName: string | null;
    totalFields: number;
    filledFields: number;
    skippedFields: number;
    failedFields: number;
    aiGenerated: number;
    documentsAttached: number;
    durationMs: number;
}): Promise<void> {
    await trackEvent('autofill_complete', {
        ats_name: data.atsName || 'unknown',
        total_fields: data.totalFields,
        filled_fields: data.filledFields,
        skipped_fields: data.skippedFields,
        failed_fields: data.failedFields,
        ai_generated: data.aiGenerated,
        documents_attached: data.documentsAttached,
        duration_ms: data.durationMs,
        success_rate: data.totalFields > 0 ? Math.round((data.filledFields / data.totalFields) * 100) : 0,
    });
}

/**
 * Track an ATS detection event.
 */
export async function trackATSDetection(atsName: string, confidence: number): Promise<void> {
    await trackEvent('ats_detected', {
        ats_name: atsName,
        confidence,
        url_domain: window.location.hostname,
    });
}

/**
 * Track a field match event.
 */
export async function trackFieldMatch(identifier: string, confidence: number, method: string): Promise<void> {
    await trackEvent('field_matched', {
        field_identifier: identifier,
        confidence,
        match_method: method,
    });
}

/**
 * Track an error event.
 */
export async function trackError(error: string, context: string): Promise<void> {
    await trackEvent('error', {
        error_message: error.substring(0, 200),
        context,
    });
}

/**
 * Flush queued events to the backend.
 */
async function flushEvents(): Promise<void> {
    if (eventQueue.length === 0) return;

    const events = [...eventQueue];
    eventQueue = [];

    try {
        const token = await chrome.storage.local.get('pmhnp_token');
        if (!token.pmhnp_token) return;

        await fetch(`${getApiBaseUrl()}/api/autofill/analytics`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.pmhnp_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ events }),
        });
    } catch {
        // If flush fails, re-queue events (up to max)
        eventQueue = [...events, ...eventQueue].slice(0, MAX_QUEUE_SIZE);
    }
}

function getApiBaseUrl(): string {
    // Check if we're in development mode
    const manifest = chrome.runtime.getManifest();
    if (manifest.update_url) {
        // Published extension — use production URL
        return 'https://pmhnphiring.com';
    }
    // Unpublished/development — use localhost
    return 'http://localhost:3000';
}

// Auto-flush on interval
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startAnalyticsFlush(): void {
    if (flushTimer) return;
    flushTimer = setInterval(flushEvents, FLUSH_INTERVAL);
}

export function stopAnalyticsFlush(): void {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    // Final flush
    flushEvents();
}
