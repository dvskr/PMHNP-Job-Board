/**
 * Cheap client-side check for "this browser might have a Supabase session".
 *
 * Several client components fetch /api/auth/me on mount. For an anonymous
 * visitor (and for Googlebot's renderer, which executes the page) every one of
 * those is a serverless invocation that can only ever answer 401. The job
 * detail page alone fired three to four of them per view.
 *
 * ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
 *
 * It is an optimisation: a false result means "skip work that would almost
 * certainly be wasted". It is NOT an authentication decision in either
 * direction. A true result is not proof of a session, because the cookie may
 * be stale and only the server can say. A FALSE result is not proof of the
 * absence of one either, and that half was learned the hard way.
 *
 * ── THE BUG THIS REGEX ONCE HAD ────────────────────────────────────────────
 *
 * The predicate used to be `sb-[^=]+-auth-token=`, which requires the cookie
 * name to end in exactly `-auth-token`. @supabase/ssr CHUNKS any cookie over
 * MAX_CHUNK_SIZE (3180 bytes) into `sb-<ref>-auth-token.0`,
 * `sb-<ref>-auth-token.1`, ... (see its chunker.js, CHUNK_LIKE_REGEX
 * `^(.*)[.](0|[1-9][0-9]*)$`). A chunked name ends in `.0`, so it did not
 * match and the holder looked signed out.
 *
 * That is not an edge case. The session cookie crosses 3180 bytes once the
 * JWT carries a fully populated profile, so the people it hit were exactly
 * the ones who had finished setting up their account: they were shown "Sign
 * in to apply" on every job, on every browser and device, and clearing
 * cookies did not help because signing in again produced another chunked
 * cookie. Two reported it before anything caught it, which is the real
 * lesson here, not the regex.
 *
 * `-code-verifier` (the transient PKCE cookie) deliberately does not match:
 * it exists mid-sign-in and is not a session.
 *
 * This is the only copy. useSavedJobs and useAppliedJobs each carried a
 * private one, which is how the same predicate ended up with three slightly
 * different comments and three chances to drift apart.
 */

/**
 * `sb-<ref>-auth-token`, optionally with a `.<n>` chunk suffix.
 *
 * `[^=;\s]+` rather than `[^=]+` for the ref segment. In a well-formed jar
 * the `=` in every pair already stops it running past one cookie, so this is
 * hardening rather than a fix for an observed match: it keeps a malformed or
 * valueless cookie from letting the segment span a `;` and splice the tail of
 * one name onto the head of the next.
 */
const SUPABASE_AUTH_COOKIE = /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=/;

export function hasLikelyAuthCookie(): boolean {
    if (typeof document === 'undefined') return false;
    return SUPABASE_AUTH_COOKIE.test(document.cookie);
}

/** Exported for the regression test; not part of the runtime contract. */
export const _SUPABASE_AUTH_COOKIE_PATTERN = SUPABASE_AUTH_COOKIE;
