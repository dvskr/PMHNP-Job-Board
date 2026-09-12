/**
 * The validity window for an employer's `editToken` magic link.
 *
 * The token is a bearer credential mailed to the employer after they post. It
 * has no session behind it, so the only thing bounding a leaked link (a
 * forwarded email, an archived inbox, a breach) is this window.
 *
 * P5.A (2026-06-01) introduced the 30-day grace rule but applied it in one
 * place: the GET loader at /api/jobs/edit/[token]. The 2026-09-02 hunt found
 * that POST and DELETE /api/jobs/update never checked it, so a leaked token
 * still edited a posting (including its applyLink, which redirects every
 * applicant) or unpublished it, indefinitely. The rule now lives here and
 * every handler that accepts an editToken calls it.
 */

/** A token stays usable for 30 days past the posting's expiry cutoff. */
export const EDIT_TOKEN_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export interface EditTokenJobState {
    isPublished: boolean;
    expiresAt: Date | string | null;
}

/**
 * True when an editToken may still act on this posting: while it is published,
 * or within the grace window after it expired.
 *
 * A posting that is unpublished with no `expiresAt` has no measurable age, so
 * it is treated as outside the window rather than editable forever.
 */
export function isEditTokenWindowOpen(job: EditTokenJobState, now: number = Date.now()): boolean {
    if (job.isPublished) return true;
    if (!job.expiresAt) return false;
    const expiry = new Date(job.expiresAt).getTime();
    if (!Number.isFinite(expiry)) return false;
    return now - expiry <= EDIT_TOKEN_GRACE_MS;
}

/** The message shown when the window has closed. Shared so all routes agree. */
export const EDIT_TOKEN_CLOSED_MESSAGE =
    'Edit window has closed for this posting. Renew or re-post via your dashboard.';
