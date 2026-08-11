/**
 * lib/email/email-click-allowlist.ts — destination validation for
 * /api/track/email-click. Pure and dependency-free so tests can pin the
 * no-open-redirect guarantee directly.
 *
 * The tracking route 302s to whatever `d` says AFTER this validation, so
 * the validator is the entire defense against open redirects. Rules:
 *   - relative path only (leading '/', never '//' or '/\' which browsers
 *     treat as protocol-relative)
 *   - no backslashes, whitespace, or control characters anywhere
 *   - no '..' traversal and no percent-encoded '/', '\', or '.' smuggling
 *     in the path portion
 *   - no ':' in the path portion (blocks 'https:' style smuggling)
 *   - path must sit under one of the allowlisted prefixes
 * Anything that fails falls back to DEFAULT_CLICK_DESTINATION — an email
 * click must never strand the user on an error page.
 */

export const EMAIL_CLICK_ALLOWED_PREFIXES: readonly string[] = [
  '/employer/candidates',
  '/employer/talent-search',
  '/employer/dashboard',
];

export const DEFAULT_CLICK_DESTINATION = '/employer/candidates';

/** Backslash or any whitespace character. */
const BACKSLASH_OR_WHITESPACE = /[\\]|\s/;

/** True when the string contains a C0 control character or DEL. */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function resolveClickDestination(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_CLICK_DESTINATION;
  if (!raw.startsWith('/')) return DEFAULT_CLICK_DESTINATION;
  // '//host' and '/\host' resolve protocol-relative in browsers. The
  // backslash arm is redundant with BACKSLASH_OR_WHITESPACE below but kept
  // explicit because it is the classic open-redirect bypass.
  if (raw.length > 1 && (raw[1] === '/' || raw.charCodeAt(1) === 0x5c)) {
    return DEFAULT_CLICK_DESTINATION;
  }
  if (BACKSLASH_OR_WHITESPACE.test(raw)) return DEFAULT_CLICK_DESTINATION;
  if (hasControlChar(raw)) return DEFAULT_CLICK_DESTINATION;
  if (raw.includes('..')) return DEFAULT_CLICK_DESTINATION;

  const pathOnly = raw.split(/[?#]/)[0];
  if (pathOnly.includes(':')) return DEFAULT_CLICK_DESTINATION;
  // Percent-encoded slash/backslash/dot could smuggle traversal past the
  // literal checks above once a downstream layer decodes them.
  if (/%2e|%2f|%5c/i.test(pathOnly)) return DEFAULT_CLICK_DESTINATION;

  const allowed = EMAIL_CLICK_ALLOWED_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  );
  return allowed ? raw : DEFAULT_CLICK_DESTINATION;
}
