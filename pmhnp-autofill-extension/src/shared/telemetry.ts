import { STORAGE_KEYS } from './constants';
import { log } from './logger';

// ─── Telemetry Types ───

export interface FieldTelemetryEntry {
    timestamp: string;
    atsName: string | null;
    pageDomain: string;       // domain only, no path for privacy
    fieldName: string;         // field.name attribute
    fieldId: string;           // field.id attribute
    fieldLabel: string;        // extracted label (truncated to 120 chars)
    fieldType: string;         // text, select, textarea, etc.
    matchMethod: 'deterministic' | 'ai' | 'unmatched';
    profileKey: string | null; // which profile key was matched
    valueSample: string;       // first 50 chars of filled value (for pattern analysis)
    confidence: number;        // 1.0 for deterministic, AI confidence for AI, 0 for unmatched
    filled: boolean;           // whether the fill succeeded
}

export interface TelemetryBatch {
    entries: FieldTelemetryEntry[];
    collectedAt: string;
}

const MAX_LOCAL_ENTRIES = 500;

// ─── Local Storage ───

export async function recordFieldTelemetry(entries: FieldTelemetryEntry[]): Promise<void> {
    if (entries.length === 0) return;

    try {
        const existing = await getFieldTelemetry();
        const combined = [...existing, ...entries];
        // Keep only the most recent entries
        const trimmed = combined.slice(-MAX_LOCAL_ENTRIES);
        await chrome.storage.local.set({ [STORAGE_KEYS.FIELD_TELEMETRY]: trimmed });
        log(`[PMHNP-Telemetry] Recorded ${entries.length} entries (total: ${trimmed.length})`);
    } catch (err) {
        // Non-fatal — telemetry should never break autofill
        console.warn('[PMHNP-Telemetry] Failed to record:', err);
    }
}

export async function getFieldTelemetry(): Promise<FieldTelemetryEntry[]> {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.FIELD_TELEMETRY);
        return (result[STORAGE_KEYS.FIELD_TELEMETRY] as FieldTelemetryEntry[]) || [];
    } catch {
        return [];
    }
}

export async function clearFieldTelemetry(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.FIELD_TELEMETRY);
}

// ─── Server Flush ───

export async function flushTelemetryToServer(apiBaseUrl: string, token: string): Promise<{ sent: number; error?: string }> {
    const entries = await getFieldTelemetry();
    if (entries.length === 0) return { sent: 0 };

    try {
        const response = await fetch(`${apiBaseUrl}/api/autofill/telemetry`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ entries }),
        });

        if (!response.ok) {
            const text = await response.text();
            return { sent: 0, error: `Server responded with ${response.status}: ${text}` };
        }

        const result = await response.json();
        log(`[PMHNP-Telemetry] Flushed ${result.received || entries.length} entries to server`);

        // Clear local entries after successful flush
        await clearFieldTelemetry();
        return { sent: result.received || entries.length };
    } catch (err) {
        return { sent: 0, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

// ─── Pattern Analysis (local, for logging) ───

/**
 * Analyze local telemetry for frequently AI-matched patterns that
 * could be promoted to deterministic rules.
 * Returns patterns seen 3+ times with the same fieldName → profileKey mapping.
 */
export async function analyzePatterns(): Promise<{ fieldName: string; profileKey: string; count: number; confidence: number }[]> {
    const entries = await getFieldTelemetry();
    const aiEntries = entries.filter(e => e.matchMethod === 'ai' && e.profileKey && e.filled);

    // Group by fieldName + profileKey
    const groups = new Map<string, { count: number; totalConfidence: number; profileKey: string; fieldName: string }>();
    for (const e of aiEntries) {
        const key = `${e.fieldName}::${e.profileKey}`;
        const existing = groups.get(key) || { count: 0, totalConfidence: 0, profileKey: e.profileKey!, fieldName: e.fieldName };
        existing.count++;
        existing.totalConfidence += e.confidence;
        groups.set(key, existing);
    }

    // Return patterns seen 3+ times, sorted by frequency
    return Array.from(groups.values())
        .filter(g => g.count >= 3)
        .sort((a, b) => b.count - a.count)
        .map(g => ({
            fieldName: g.fieldName,
            profileKey: g.profileKey,
            count: g.count,
            confidence: g.totalConfidence / g.count,
        }));
}
