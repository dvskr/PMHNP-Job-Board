/**
 * Multi-page form support.
 * Tracks which fields have been filled across page navigations
 * and resumes autofill on subsequent pages of multi-step applications.
 *
 * v2: Added page navigation — findNextButton, findSubmitButton,
 *     isLastPage, advancePage with DOM change detection.
 */

import { STORAGE_KEYS } from '@/shared/constants';
import { log, warn } from '@/shared/logger';

// ─── Constants ───

const MAX_PAGES = 10;          // Safety: max pages per session
const PAGE_TIMEOUT_MS = 60_000; // 60s timeout per page advance
const DOM_SETTLE_MS = 2000;     // Wait for DOM to settle after click

// ─── Types ───

interface MultiPageState {
    url: string;
    atsName: string | null;
    filledFields: string[];
    startedAt: string;
    currentPage: number;
    totalPages: number | null;
    lastFieldSnapshot: string;
}

const STORAGE_KEY = STORAGE_KEYS.AUTOFILLED_URLS;

// ─── State Persistence ───

/** Save the current multi-page state. */
export async function saveMultiPageState(state: MultiPageState): Promise<void> {
    const domain = new URL(state.url).hostname;
    const key = `mp_${domain}`;
    await chrome.storage.local.set({ [key]: state });
}

/** Load the multi-page state for the current page. */
export async function loadMultiPageState(): Promise<MultiPageState | null> {
    const domain = window.location.hostname;
    const key = `mp_${domain}`;
    const result = await chrome.storage.local.get(key);
    const state = result[key] as MultiPageState | undefined;

    if (!state) return null;

    // Expire after 30 minutes
    const age = Date.now() - new Date(state.startedAt).getTime();
    if (age > 30 * 60 * 1000) {
        await chrome.storage.local.remove(key);
        return null;
    }

    return state;
}

/** Clear the multi-page state for the current domain. */
export async function clearMultiPageState(): Promise<void> {
    const domain = window.location.hostname;
    const key = `mp_${domain}`;
    await chrome.storage.local.remove(key);
}

/** Record that a field was filled. */
export async function recordFilledField(fieldId: string): Promise<void> {
    const state = await loadMultiPageState();
    if (state) {
        if (!state.filledFields.includes(fieldId)) {
            state.filledFields.push(fieldId);
        }
        await saveMultiPageState(state);
    }
}

/** Advance the page counter after successful fill. */
export async function advancePageCounter(): Promise<void> {
    const state = await loadMultiPageState();
    if (state) {
        state.currentPage++;
        state.lastFieldSnapshot = getFieldSnapshotKey();
        await saveMultiPageState(state);
    }
}

/** Check if a field was already filled in a previous page. */
export function wasFieldFilled(state: MultiPageState, fieldId: string): boolean {
    return state.filledFields.includes(fieldId);
}

/** Check if we've exceeded the safety page limit. */
export async function hasExceededPageLimit(): Promise<boolean> {
    const state = await loadMultiPageState();
    return state ? state.currentPage >= MAX_PAGES : false;
}

/**
 * Detect if the current page is a continuation of a multi-page form.
 * Returns true if:
 * - We have a saved state for this domain
 * - The state is less than 30 minutes old
 * - We're on a different URL path OR the DOM fields changed
 */
export async function isMultiPageContinuation(): Promise<boolean> {
    const state = await loadMultiPageState();
    if (!state) return false;

    const savedUrl = new URL(state.url);

    // Same domain, different path = likely next page of form
    if (savedUrl.hostname === window.location.hostname && savedUrl.pathname !== window.location.pathname) {
        return true;
    }

    // Same URL but different field snapshot = SPA page change (React/Angular render new fields without URL change)
    if (savedUrl.hostname === window.location.hostname && state.lastFieldSnapshot) {
        const currentSnapshot = getFieldSnapshotKey();
        return currentSnapshot !== state.lastFieldSnapshot && currentSnapshot.length > 0;
    }

    return false;
}

// ─── Page Navigation ───

/** Text patterns for "Next" / "Continue" buttons (case-insensitive) */
const NEXT_BUTTON_PATTERNS = [
    /^next$/i,
    /^continue$/i,
    /^save\s*&?\s*continue$/i,
    /^save\s+and\s+continue$/i,
    /^proceed$/i,
    /^next\s+step$/i,
    /^go\s+to\s+next/i,
    /^move\s+forward$/i,
    /^save\s+&?\s*next$/i,
    /^next\s+page$/i,
    /^forward$/i,
];

/** Text patterns for "Submit" / final buttons (case-insensitive) */
const SUBMIT_BUTTON_PATTERNS = [
    /^submit\s*(application)?$/i,
    /^apply(\s+now)?$/i,
    /^send\s*(application)?$/i,
    /^complete\s*(application)?$/i,
    /^finish$/i,
    /^done$/i,
    /^submit\s+your\s+application$/i,
    /^review\s+and\s+submit$/i,
    /^confirm\s+and\s+submit$/i,
];

/** ATS-specific data attributes that identify next/continue buttons */
const NEXT_BUTTON_SELECTORS = [
    '[data-automation-id="bottom-navigation-next-button"]',  // Workday
    '[data-automation-id="pageFooterNextButton"]',           // Workday alt
    'button[data-uxi-element-id="next"]',                    // SmartRecruiters
    '.application-form button[type="submit"]',                // Greenhouse
    'button.btn-next',                                        // Generic
    'button.next-btn',                                        // Generic
    '[data-testid="next-button"]',                            // BambooHR
    'a.next-step',                                            // Taleo
    '#next-button',                                           // Generic
    '.step-navigation button:last-child',                     // Generic step nav
];

/** ATS-specific data attributes that identify submit buttons */
const SUBMIT_BUTTON_SELECTORS = [
    '[data-automation-id="bottom-navigation-submit-button"]', // Workday
    'button[data-uxi-element-id="submit"]',                   // SmartRecruiters
    '#submit_app',                                             // Greenhouse
    'button.submit-application',                               // Generic
    '[data-testid="submit-button"]',                           // BambooHR
    'input[type="submit"][value*="Submit"]',                   // Form submits
];

/**
 * Find the "Next" / "Continue" button on the current page.
 * Checks ATS-specific selectors first, then falls back to text matching.
 */
export function findNextButton(): HTMLElement | null {
    // 1. Try ATS-specific selectors (highest accuracy)
    for (const selector of NEXT_BUTTON_SELECTORS) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el && isButtonVisible(el) && !isDisabledButton(el)) {
            log(`[PMHNP-MP] Found next button via selector: ${selector}`);
            return el;
        }
    }

    // 2. Scan all buttons/links for text matching
    const candidates = document.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], input[type="button"], a[role="button"], a.btn, [role="button"]'
    );

    for (const el of candidates) {
        const text = getButtonText(el).trim();
        if (!text || !isButtonVisible(el) || isDisabledButton(el)) continue;

        // Check against submit patterns FIRST — if it's a submit button, skip it
        if (SUBMIT_BUTTON_PATTERNS.some(p => p.test(text))) continue;

        // Check against next patterns
        if (NEXT_BUTTON_PATTERNS.some(p => p.test(text))) {
            log(`[PMHNP-MP] Found next button via text: "${text}"`);
            return el;
        }
    }

    return null;
}

/**
 * Find the "Submit" / "Apply" button on the current page.
 */
export function findSubmitButton(): HTMLElement | null {
    // 1. Try ATS-specific selectors
    for (const selector of SUBMIT_BUTTON_SELECTORS) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el && isButtonVisible(el) && !isDisabledButton(el)) {
            log(`[PMHNP-MP] Found submit button via selector: ${selector}`);
            return el;
        }
    }

    // 2. Text matching
    const candidates = document.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], a[role="button"], [role="button"]'
    );

    for (const el of candidates) {
        const text = getButtonText(el).trim();
        if (!text || !isButtonVisible(el) || isDisabledButton(el)) continue;

        if (SUBMIT_BUTTON_PATTERNS.some(p => p.test(text))) {
            log(`[PMHNP-MP] Found submit button via text: "${text}"`);
            return el;
        }
    }

    return null;
}

/**
 * Determine if the current page is the last page of the application.
 * Uses multiple signals: submit button presence, progress indicators, and button text.
 */
export function isLastPage(): boolean {
    // Signal 1: Submit button exists and no Next button → definitely last page
    const hasSubmit = !!findSubmitButton();
    const hasNext = !!findNextButton();

    if (hasSubmit && !hasNext) {
        log('[PMHNP-MP] Last page detected: submit button present, no next button');
        return true;
    }

    // Signal 2: Progress indicators (e.g., "Step 5 of 5", "Review & Submit")
    const progressText = document.body.innerText;
    const stepMatch = progressText.match(/step\s+(\d+)\s+(?:of|\/)\s+(\d+)/i);
    if (stepMatch) {
        const current = parseInt(stepMatch[1], 10);
        const total = parseInt(stepMatch[2], 10);
        if (current === total) {
            log(`[PMHNP-MP] Last page detected: step ${current}/${total}`);
            return true;
        }
    }

    // Signal 3: Page title/heading contains "Review", "Summary", "Confirm"
    const headings = document.querySelectorAll('h1, h2, h3, [role="heading"]');
    for (const h of headings) {
        const text = h.textContent?.toLowerCase() || '';
        if (/review|summary|confirm|final|submission/i.test(text)) {
            log(`[PMHNP-MP] Last page detected: heading "${text}"`);
            return true;
        }
    }

    return false;
}

/**
 * Click the "Next" button and wait for the DOM to update with new fields.
 * Returns true if new fields appeared, false if timeout or no change.
 */
export async function advancePage(): Promise<boolean> {
    const nextBtn = findNextButton();
    if (!nextBtn) {
        warn('[PMHNP-MP] No next button found — cannot advance');
        return false;
    }

    // Safety check
    if (await hasExceededPageLimit()) {
        warn('[PMHNP-MP] Exceeded max page limit — stopping');
        return false;
    }

    const beforeSnapshot = getFieldSnapshotKey();
    log(`[PMHNP-MP] Advancing page — clicking "${getButtonText(nextBtn)}"`);

    // Click the next button
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    nextBtn.click();
    nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Wait for DOM to change (new fields to appear)
    return new Promise<boolean>((resolve) => {
        let resolved = false;

        // Use MutationObserver to detect when new content appears
        const observer = new MutationObserver(() => {
            if (resolved) return;

            // Check if fields changed
            const afterSnapshot = getFieldSnapshotKey();
            if (afterSnapshot !== beforeSnapshot && afterSnapshot.length > 0) {
                resolved = true;
                observer.disconnect();
                // Give a bit more time for the DOM to fully settle
                setTimeout(() => {
                    log(`[PMHNP-MP] Page advanced — new fields detected`);
                    resolve(true);
                }, DOM_SETTLE_MS);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });

        // Also check for URL change (full page navigation)
        const checkUrl = setInterval(() => {
            if (resolved) { clearInterval(checkUrl); return; }
            const afterSnapshot = getFieldSnapshotKey();
            if (afterSnapshot !== beforeSnapshot && afterSnapshot.length > 0) {
                resolved = true;
                observer.disconnect();
                clearInterval(checkUrl);
                setTimeout(() => {
                    log(`[PMHNP-MP] Page advanced via URL change`);
                    resolve(true);
                }, DOM_SETTLE_MS);
            }
        }, 500);

        // Timeout safety
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                clearInterval(checkUrl);
                warn(`[PMHNP-MP] Page advance timed out after ${PAGE_TIMEOUT_MS}ms`);
                resolve(false);
            }
        }, PAGE_TIMEOUT_MS);
    });
}

// ─── SPA URL Change Detection ───

let _pushStateIntercepted = false;
let _urlChangeCallback: (() => void) | null = null;

/**
 * Install a URL change listener that catches SPA navigations (pushState, popState).
 * This is needed for React/Angular SPAs that change URL without a full page reload.
 */
export function onUrlChange(callback: () => void): () => void {
    _urlChangeCallback = callback;

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', callback);

    // Intercept pushState and replaceState (SPA navigation)
    if (!_pushStateIntercepted) {
        _pushStateIntercepted = true;
        const originalPushState = history.pushState.bind(history);
        const originalReplaceState = history.replaceState.bind(history);

        history.pushState = function (...args: Parameters<typeof history.pushState>) {
            originalPushState(...args);
            _urlChangeCallback?.();
        };

        history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
            originalReplaceState(...args);
            _urlChangeCallback?.();
        };
    }

    // Cleanup function
    return () => {
        window.removeEventListener('popstate', callback);
        _urlChangeCallback = null;
    };
}

// ─── Helpers ───

/** Get text content of a button (handles input[type=submit] value, button text, aria-label) */
function getButtonText(el: HTMLElement): string {
    if (el.tagName === 'INPUT') {
        return (el as HTMLInputElement).value || el.getAttribute('aria-label') || '';
    }
    return el.textContent?.trim() || el.getAttribute('aria-label') || '';
}

/** Check if a button is visible */
function isButtonVisible(el: HTMLElement): boolean {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/** Check if a button is disabled */
function isDisabledButton(el: HTMLElement): boolean {
    return (
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('disabled')
    );
}

/**
 * Build a snapshot key of all visible form fields on the page.
 * Used to detect when fields change (SPA page transitions).
 */
export function getFieldSnapshotKey(): string {
    const fields = document.querySelectorAll('input, select, textarea');
    const keys: string[] = [];
    for (const f of fields) {
        const el = f as HTMLInputElement;
        const type = el.type?.toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button') continue;
        keys.push(`${el.tagName}:${el.name || el.id || ''}:${type || ''}`);
    }
    return keys.sort().join('|');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

