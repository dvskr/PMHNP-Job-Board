/**
 * The header's "Job Alerts" pill and the alert modal live in different trees:
 * the pill is in the always-mounted Header, the modal is inside
 * app/jobs/JobsPageClient.tsx (which owns the filter state that makes
 * "Create Alert for This Search" possible). The pill therefore asks the page
 * to open the modal rather than duplicating the form.
 *
 * A bare CustomEvent is not enough on its own. The /jobs subtree hydrates
 * behind its own Suspense boundary, so the Header can be interactive while
 * JobsPageClient has not yet registered its listener in an effect. An event
 * dispatched in that window has no listener, no buffer and no state fallback:
 * the click is silently dropped and the user sees nothing happen.
 *
 * So a request is recorded in two ways: the event (instant, for a page that
 * is already listening) and a durable flag on `window` that a late-mounting
 * listener consumes exactly once. Both sides of that contract live here so
 * the key can never drift between them.
 */

/** Event the header dispatches; JobsPageClient listens for it. */
export const ALERT_MODAL_EVENT = 'pmhnp:open-alert-modal';

/** Window key holding a request made before the listener existed. */
const PENDING_KEY = '__pmhnpPendingAlertModal';

type AlertModalWindow = Window & { [PENDING_KEY]?: boolean };

/**
 * Ask the jobs page to open the alert modal. Safe to call before that page
 * has hydrated: the flag survives until a listener consumes it.
 */
export function requestAlertModal(): void {
    if (typeof window === 'undefined') return;
    (window as AlertModalWindow)[PENDING_KEY] = true;
    window.dispatchEvent(new CustomEvent(ALERT_MODAL_EVENT));
}

/**
 * True when a request was made before the caller started listening. Clears
 * the flag, so a second caller (or a re-mount) does not reopen the modal.
 */
export function consumePendingAlertModal(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as AlertModalWindow;
    const pending = w[PENDING_KEY] === true;
    delete w[PENDING_KEY];
    return pending;
}

/** Clears any request without acting on it (e.g. when the modal just closed). */
export function clearPendingAlertModal(): void {
    if (typeof window === 'undefined') return;
    delete (window as AlertModalWindow)[PENDING_KEY];
}
