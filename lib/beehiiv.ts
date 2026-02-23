/**
 * Beehiiv Newsletter API Integration
 *
 * Syncs new email subscribers to Beehiiv automatically.
 * Fire-and-forget: errors are logged but never block the signup flow.
 *
 * Required env vars:
 *   BEEHIIV_API_KEY         — API key from Beehiiv dashboard
 *   BEEHIIV_PUBLICATION_ID  — Publication ID (starts with pub_)
 */

const BEEHIIV_API_KEY = process.env.BEEHIIV_API || process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;
const BEEHIIV_BASE_URL = 'https://api.beehiiv.com/v2';

interface BeehiivSyncOptions {
    /** UTM source tag, e.g. 'job_alert', 'newsletter', 'google_signup' */
    utmSource?: string;
    /** Send the Beehiiv welcome email (default: false) */
    sendWelcome?: boolean;
    /** Reactivate if previously unsubscribed (default: false) */
    reactivateExisting?: boolean;
}

/**
 * Sync an email to Beehiiv as a new subscriber.
 *
 * This is fire-and-forget — it runs in the background and never
 * throws or blocks the calling signup flow. Safe to call anywhere.
 */
export function syncToBeehiiv(
    email: string,
    options: BeehiivSyncOptions = {}
): void {
    // Skip silently if not configured (local dev, missing env vars)
    if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
        return;
    }

    // Fire-and-forget — don't await
    _doSync(email, options).catch((err) => {
        console.error('[beehiiv] Sync failed for', email, ':', err?.message || err);
    });
}

async function _doSync(
    email: string,
    options: BeehiivSyncOptions
): Promise<void> {
    const url = `${BEEHIIV_BASE_URL}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`;

    const body: Record<string, unknown> = {
        email: email.toLowerCase().trim(),
        reactivate_existing: options.reactivateExisting ?? false,
        send_welcome_email: options.sendWelcome ?? false,
        utm_source: options.utmSource || 'pmhnphiring',
        utm_medium: 'website',
        referring_site: 'https://pmhnphiring.com',
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${BEEHIIV_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        // 409 = already subscribed, not an error
        if (response.status === 409) {
            return;
        }
        throw new Error(`Beehiiv API ${response.status}: ${text}`);
    }
}
