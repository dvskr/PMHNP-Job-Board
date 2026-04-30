/**
 * Consent state + event bus.
 *
 * Stored in localStorage under `pmhnp_cookie_consent` for backward compat
 * with the existing CookieConsent banner.
 *
 * Components (Vercel Speed Insights, Sentry, etc.) read getConsent() and
 * listen for the `pmhnp:consent-changed` window event to mount or unmount.
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

export function getConsentCategories(): ConsentCategories | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = parseStored(window.localStorage.getItem(CONSENT_STORAGE_KEY));
        if (!stored) return null;
        if (stored.version !== CONSENT_VERSION) return null; // Policy changed → re-prompt
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

export function setConsentCategories(categories: ConsentCategories): void {
    if (typeof window === 'undefined') return;
    const payload: StoredConsent = {
        categories,
        version: CONSENT_VERSION,
        ts: Date.now(),
    };
    try {
        window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* localStorage may be disabled */
    }
    try {
        window.dispatchEvent(
            new CustomEvent<ConsentCategories>(CONSENT_EVENT, { detail: categories }),
        );
    } catch {
        /* CustomEvent unavailable in extremely old browsers */
    }
}

/**
 * Convenience: store an all-or-nothing decision.
 * Kept for callers that don't need granular control.
 */
export function setConsent(value: Exclude<ConsentState, null>): void {
    setConsentCategories(value === 'accepted' ? ALL_GRANTED : ALL_DENIED);
}

export function clearConsent(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
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
 */
export function reopenConsentBanner(): void {
    if (typeof window === 'undefined') return;
    clearConsent();
    try {
        window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
    } catch { /* noop */ }
}

export function hasAnalyticsConsent(): boolean {
    return getConsentCategories()?.analytics === true;
}

export function hasMarketingConsent(): boolean {
    return getConsentCategories()?.marketing === true;
}
