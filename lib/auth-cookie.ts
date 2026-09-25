/**
 * Cheap client-side check for "this browser might have a Supabase session".
 *
 * Several client components fetch /api/auth/me on mount. For an anonymous
 * visitor (and for Googlebot's renderer, which executes the page) every one of
 * those is a serverless invocation that can only ever answer 401. The job
 * detail page alone fired three to four of them per view.
 *
 * Supabase stores its session in a readable `sb-<ref>-auth-token` cookie, so
 * its absence means there is definitely no session and the request can be
 * skipped. Its presence only means "probably signed in": the server still
 * validates, so a stale cookie just costs the request we would have made
 * anyway. Never treat a true result as proof of authentication.
 *
 * This is the only copy. useSavedJobs and useAppliedJobs each carried a
 * private one, which is how the same predicate ended up with three slightly
 * different comments and three chances to drift apart.
 */
export function hasLikelyAuthCookie(): boolean {
    if (typeof document === 'undefined') return false;
    return /(?:^|;\s*)sb-[^=]+-auth-token=/.test(document.cookie);
}
