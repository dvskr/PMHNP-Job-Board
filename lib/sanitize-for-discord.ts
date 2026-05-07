/**
 * Strip secrets and PII from strings before they're sent to Discord.
 *
 * Cron failure alerts include raw error messages + stack traces. If an
 * upstream throw embeds a Postgres connection string with password, an
 * API key, a Bearer token, or a user email, those land in our team
 * channel as-is. Discord webhooks are not encrypted and the channel
 * scrollback is searchable forever.
 *
 * This is best-effort defense in depth — it does NOT replace careful
 * error throwing in upstream code, just catches the obvious slips.
 *
 * Patterns covered:
 *   - DB URLs with credentials (postgres / mongodb / mysql / redis)
 *   - Bearer tokens
 *   - sk_/pk_/rk_ key prefixes (Stripe, RapidAPI, OpenAI-style)
 *   - JWT-shaped tokens (header.body.sig)
 *   - Email addresses (PII)
 *   - Long base64-ish blobs ≥ 32 chars (catches API keys we missed)
 */

const PATTERNS: ReadonlyArray<{ id: string; re: RegExp; replacement: string }> = [
    // Database URLs with embedded credentials
    {
        id: 'db_url',
        re: /\b(postgres|postgresql|mongodb|mongodb\+srv|mysql|mariadb|redis|rediss):\/\/[^\s/@]+:[^\s@]*@[^\s"'`<>]+/gi,
        replacement: '[REDACTED_DB_URL]',
    },
    // Bearer tokens
    {
        id: 'bearer',
        re: /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/g,
        replacement: 'Bearer [REDACTED]',
    },
    // Stripe / OpenAI / RapidAPI / Anthropic key prefixes
    {
        id: 'api_key_prefix',
        re: /\b(sk|pk|rk|sk-ant|sk-proj)[_-][A-Za-z0-9_\-]{16,}/g,
        replacement: '[REDACTED_API_KEY]',
    },
    // JWT tokens (header.payload.signature, all base64url)
    {
        id: 'jwt',
        re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
        replacement: '[REDACTED_JWT]',
    },
    // PII: email addresses
    {
        id: 'email',
        re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
        replacement: '[REDACTED_EMAIL]',
    },
    // Long base64-ish or hex blobs (catches keys we don't have explicit prefixes for).
    // Tuned narrow: ≥40 chars of base64 alphabet without dots — typical for raw
    // API keys but not for paths or long URLs (which contain "/").
    {
        id: 'long_token',
        re: /\b[A-Za-z0-9_\-+]{40,}\b/g,
        replacement: '[REDACTED_TOKEN]',
    },
];

/**
 * Run every redaction pattern against the input. Order is significant —
 * specific patterns (db_url, bearer, JWT) run before the catch-all
 * long_token so they get more descriptive replacement labels.
 */
export function sanitizeForDiscord(input: string | null | undefined): string {
    if (input === null || input === undefined) return '';
    let out = String(input);
    for (const p of PATTERNS) {
        out = out.replace(p.re, p.replacement);
    }
    return out;
}
