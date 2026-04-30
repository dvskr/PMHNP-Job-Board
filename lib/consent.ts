/**
 * Consent state + event bus.
 *
 * Source of truth (Sprint 4 onwards): the HttpOnly cookie
 * `pmhnp_consent_v2`, set by `POST /api/consent`. Server reads it via
 * `cookies()` in `app/layout.tsx` and passes initial state to client
 * components as a prop.
 *
 * Client components (CookieConsent banner, ConsentGatedTelemetry,
 * GoogleAnalytics inline script) read the prop and listen for the
 * `pmhnp:consent-changed` window event to react to mid-session
 * accept/deny without a page reload.
 *
 * `getConsentCategories()` below still reads localStorage purely as a
 * legacy fallback for old tabs. Writes never go to localStorage.
 */

export type ConsentState = 'accepted' | 'denied' | null;
export type PrivacySignal = 'gpc' | 'dnt' | null;
export type ConsentRegion = 'strict' | 'implied';

/**
 * Per-category consent. Mapped to Google Consent Mode v2 signals:
 *   essential  → security_storage, functionality_storage (always granted)
 *   analytics  → analytics_storage, personalization_storage
 *   marketing  → ad_storage, ad_user_data, ad_personalization
 */
export interface ConsentCategories {
    analytics: boolean;
    marketing: boolean;
}

export const ALL_GRANTED: ConsentCategories = { analytics: true, marketing: true };
export const ALL_DENIED: ConsentCategories = { analytics: false, marketing: false };
export const ANALYTICS_ONLY: ConsentCategories = { analytics: true, marketing: false };

/**
 * Bump this when the cookie/privacy policy changes materially.
 * Stored consents from prior versions are treated as expired and the
 * banner re-prompts. Format: integer string (sortable, easy to diff).
 */
export const CONSENT_VERSION = '1';

export const CONSENT_STORAGE_KEY = 'pmhnp_cookie_consent';
export const CONSENT_EVENT = 'pmhnp:consent-changed';
export const CONSENT_REOPEN_EVENT = 'pmhnp:consent-reopen';
export const PRIVACY_SIGNAL_COOKIE = 'pmhnp_privacy_signal';
export const CONSENT_REGION_COOKIE = 'pmhnp_consent_region';
export const CONSENT_COOKIE = 'pmhnp_consent_v2';

/**
 * Format used for both the legacy localStorage value and the new
 * HttpOnly cookie. Server reads the cookie; client receives initial
 * state as a layout prop and only mutates via /api/consent.
 */
export function serializeConsent(categories: ConsentCategories): string {
    return JSON.stringify({
        categories,
        version: CONSENT_VERSION,
        ts: Date.now(),
    });
}

export function parseConsentCookie(raw: string | undefined | null): ConsentCategories | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw) as { categories?: unknown; version?: unknown };
        if (obj.version !== CONSENT_VERSION) return null;
        const c = obj.categories as Partial<ConsentCategories> | undefined;
        if (!c || typeof c.analytics !== 'boolean' || typeof c.marketing !== 'boolean') return null;
        return { analytics: c.analytics, marketing: c.marketing };
    } catch {
        return null;
    }
}

interface StoredConsent {
    categories: ConsentCategories;
    version: string;
    ts: number;
}

function parseStored(raw: string | null): StoredConsent | null {
    if (!raw) return null;
    // Old format was a bare string ('accepted' | 'denied') — treat as expired
    // so users re-consent under the current policy.
    if (raw === 'accepted' || raw === 'denied') return null;
    try {
        const obj = JSON.parse(raw) as Partial<StoredConsent> & {
            value?: 'accepted' | 'denied';
        };
        if (typeof obj.version !== 'string' || typeof obj.ts !== 'number') {
            return null;
        }
        // Backward-compat for v1 single-value shape: treat as all-or-nothing.
        if (!obj.categories && (obj.value === 'accepted' || obj.value === 'denied')) {
            return {
                categories: obj.value === 'accepted' ? ALL_GRANTED : ALL_DENIED,
                version: obj.version,
                ts: obj.ts,
            };
        }
        if (
            obj.categories &&
            typeof obj.categories.analytics === 'boolean' &&
            typeof obj.categories.marketing === 'boolean'
        ) {
            return obj as StoredConsent;
        }
    } catch { /* fall through */ }
    return null;
}

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

/**
 * Returns the consent region set by middleware based on the visitor's
 * country. Defaults to `'strict'` when the cookie is missing — fail safe
 * toward stronger consent, never weaker.
 */
export function getConsentRegion(): ConsentRegion {
    const value = readCookie(CONSENT_REGION_COOKIE);
    return value === 'implied' ? 'implied' : 'strict';
}

/**
 * Reads the privacy signal cookie set by middleware when the user's
 * browser sends `Sec-GPC: 1` (CCPA legal requirement) or `DNT: 1`.
 * Both signals are treated as a binding opt-out from analytics/advertising.
 */
export function getPrivacySignal(): PrivacySignal {
    const value = readCookie(PRIVACY_SIGNAL_COOKIE);
    return value === 'gpc' || value === 'dnt' ? value : null;
}

/**
 * Legacy localStorage reader. Kept around so any old build sitting in a
 * tab can still find its prior choice during the rollover; new writes
 * go to the HttpOnly cookie via setConsentCategories(). Returns null
 * once localStorage is empty.
 */
export function getConsentCategories(): ConsentCategories | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = parseStored(window.localStorage.getItem(CONSENT_STORAGE_KEY));
        if (!stored || stored.version !== CONSENT_VERSION) return null;
        return stored.categories;
    } catch {
        return null;
    }
}

export function getConsent(): ConsentState {
    const cats = getConsentCategories();
    if (!cats) return null;
    return cats.analytics || cats.marketing ? 'accepted' : 'denied';
}

/**
 * Persist consent via the HttpOnly cookie endpoint (Sprint 4).
 * Returns once the cookie is written so callers can be sure subsequent
 * page loads will see it.
 *
 * Falls back to dispatching the event even if the network call fails so
 * the in-memory listeners (e.g. ConsentGatedTelemetry) react immediately.
 */
export async function setConsentCategories(categories: ConsentCategories): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        await fetch('/api/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories }),
            credentials: 'same-origin',
        });
    } catch { /* surface state via event below regardless */ }
    try {
        window.dispatchEvent(
            new CustomEvent<ConsentCategories>(CONSENT_EVENT, { detail: categories }),
        );
    } catch { /* noop */ }
}

/**
 * Convenience: store an all-or-nothing decision.
 * Kept for callers that don't need granular control.
 */
export async function setConsent(value: Exclude<ConsentState, null>): Promise<void> {
    await setConsentCategories(value === 'accepted' ? ALL_GRANTED : ALL_DENIED);
}

export async function clearConsent(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        await fetch('/api/consent', { method: 'DELETE', credentials: 'same-origin' });
    } catch { /* noop */ }
    try {
        window.dispatchEvent(
            new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: null }),
        );
    } catch { /* noop */ }
}

/**
 * Re-opens the cookie consent banner so the user can change a prior choice.
 * Triggered by the "Cookie Settings" link in the footer.
 *
 * Fires the reopen event immediately for a snappy UI response, then
 * clears the server-side cookie in the background.
 */
export function reopenConsentBanner(): void {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
    } catch { /* noop */ }
    void clearConsent();
}

/**
 * Client-side helpers retained for the rare component that doesn't get
 * `initialConsent` from the server (e.g. the Do Not Sell page). They
 * dispatch the consent-changed event and call the API; the read side
 * reflects the server prop, not a localStorage echo.
 */
export function hasAnalyticsConsent(initial: ConsentCategories | null): boolean {
    return initial?.analytics === true;
}

export function hasMarketingConsent(initial: ConsentCategories | null): boolean {
    return initial?.marketing === true;
}
