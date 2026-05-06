/**
 * Mine employer-contact details out of job descriptions for lead generation.
 *
 * Inputs: free-form description text (often HTML-stripped already).
 * Outputs: deduped lists of emails / phones / websites with junk filtered.
 *
 * Pure function — no DB access here. Persistence happens in the caller
 * (lib/lead-persistence.ts) so this module stays unit-testable without
 * Prisma.
 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;

// US-format phone (10 digits, optional +1 / parens / separators).
// Avoids matching SSNs / EINs by requiring exactly 10 digits in 3-3-4
// shape and rejecting consecutive `-` separators that imply other formats.
const PHONE_RE = /(?:\+1[-.\s]?)?\(?\b([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g;

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Email domains we treat as low-value / noise — ATS / job-board /
 * pipeline-internal addresses that don't represent reachable employer
 * contacts. Any address whose domain (case-insensitive) is in this set,
 * OR ends with `.<set-entry>` (subdomain match), is dropped.
 */
const NOISE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
    'greenhouse.io',
    'lever.co',
    'workday.com',
    'myworkdayjobs.com',
    'smartrecruiters.com',
    'adzuna.com',
    'indeed.com',
    'linkedin.com',
    'jooble.org',
    'jobs.lever.co',
    'boards.greenhouse.io',
    'example.com',
    'example.org',
    'sentry.io',
    'eepurl.com',
    'mailchimp.com',
    'sendgrid.net',
    'amazonses.com',
]);

/**
 * Local-parts that signal automated/no-contact mailboxes. Filtered case-
 * insensitively. Do NOT include `careers` or `jobs` — those are real
 * employer hiring inboxes and exactly the leads we want.
 */
const NOISE_EMAIL_LOCALPARTS: ReadonlySet<string> = new Set([
    'noreply',
    'no-reply',
    'donotreply',
    'do-not-reply',
    'notifications',
    'notification',
    'mailer-daemon',
    'postmaster',
    'webmaster',
    'abuse',
]);

/** URL hosts representing job platforms / aggregators / our own domain. */
const NOISE_URL_HOSTS: ReadonlySet<string> = new Set([
    'greenhouse.io',
    'boards.greenhouse.io',
    'lever.co',
    'jobs.lever.co',
    'workday.com',
    'myworkdayjobs.com',
    'smartrecruiters.com',
    'adzuna.com',
    'indeed.com',
    'linkedin.com',
    'jooble.org',
    'pmhnphiring.com',
    'ziprecruiter.com',
    'glassdoor.com',
    'monster.com',
    'careerbuilder.com',
    'simplyhired.com',
]);

export interface MinedLeads {
    emails: string[];
    phones: string[];
    websites: string[];
}

function isJunkEmail(rawEmail: string): boolean {
    const email = rawEmail.toLowerCase();
    const at = email.lastIndexOf('@');
    if (at < 0) return true;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (!domain || !local) return true;

    // Image / templating accidents like "logo@2x.png" or "icon@3x.svg"
    if (/\.(png|jpe?g|gif|svg|webp|ico|bmp|pdf)$/.test(email)) return true;
    if (/^[a-z0-9_]+@[1-3]x$/i.test(rawEmail)) return true;

    if (NOISE_EMAIL_LOCALPARTS.has(local)) return true;
    if (NOISE_EMAIL_DOMAINS.has(domain)) return true;
    for (const noisy of NOISE_EMAIL_DOMAINS) {
        if (domain.endsWith('.' + noisy)) return true;
    }
    return false;
}

function isJunkUrl(rawUrl: string): boolean {
    let host: string;
    try {
        host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return true;
    }
    if (NOISE_URL_HOSTS.has(host)) return true;
    for (const noisy of NOISE_URL_HOSTS) {
        if (host.endsWith('.' + noisy)) return true;
    }
    return false;
}

function normalizePhone(raw: string): string {
    // Keep digits only; prepend country code if 11 digits starting with 1
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length === 11 && digits.startsWith('1')) return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return raw.trim();
}

function trimUrlPunctuation(url: string): string {
    // The URL_RE eats trailing punctuation when descriptions end with
    // "see https://example.com." — strip common terminators.
    return url.replace(/[).,;:!?>]+$/, '');
}

/**
 * Pull deduped emails / phones / websites out of a free-form text blob.
 * No DB writes. Empty arrays when nothing is found.
 */
export function mineLeadsFromText(text: string | null | undefined): MinedLeads {
    if (!text || typeof text !== 'string' || text.length === 0) {
        return { emails: [], phones: [], websites: [] };
    }

    const emails = new Set<string>();
    for (const m of text.matchAll(EMAIL_RE)) {
        const e = m[0];
        if (!isJunkEmail(e)) emails.add(e.toLowerCase());
    }

    const phones = new Set<string>();
    for (const m of text.matchAll(PHONE_RE)) {
        phones.add(normalizePhone(m[0]));
    }

    const websites = new Set<string>();
    for (const m of text.matchAll(URL_RE)) {
        const url = trimUrlPunctuation(m[0]);
        if (!isJunkUrl(url)) websites.add(url);
    }

    return {
        emails: [...emails],
        phones: [...phones],
        websites: [...websites],
    };
}
