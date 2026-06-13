/**
 * Returns a safe SAME-ORIGIN redirect path, or the fallback when the input is
 * untrusted. Guards against open redirects: a value like `//evil.com` or
 * `/\evil.com` starts with `/` but browsers resolve it to an external origin,
 * so `startsWith('/')` alone is not sufficient.
 *
 * Accepts only paths that start with a single `/` followed by a non-slash,
 * non-backslash character (or the bare root `/`).
 */
export function safeInternalPath(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (value === '/') return value;
  // Must start with `/`, and the 2nd char must not be `/` or `\` (which would
  // make it protocol-relative / a host). Reject control characters too.
  if (!/^\/[^/\\]/.test(value)) return fallback;
  if (/[\x00-\x1f]/.test(value)) return fallback;
  return value;
}
