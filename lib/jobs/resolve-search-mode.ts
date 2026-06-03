/**
 * lib/jobs/resolve-search-mode.ts — pure decision helper for the /jobs AI search
 * bar (F1).
 *
 * The AI/semantic search used to be a dead end: a 404 (flag off), any HTTP error,
 * or an empty result set (embeddings table empty — the C1 problem) all discarded
 * the user's typed query and showed a dead-end message. This helper maps the HTTP
 * outcome to either an `ai` result or a `keyword-fallback` that PRESERVES the
 * query so the caller can re-run it through the existing keyword search.
 */

export type AiSearchOutcome =
  | { mode: 'ai'; jobs: unknown[] }
  | {
      mode: 'keyword-fallback';
      reason: 'flag-off' | 'no-results' | 'error';
      query: string;
    };

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * @param status HTTP status from the semantic endpoint, or `null` on a network throw.
 * @param jobs   Parsed jobs array, or `null` if the request failed/was not parsed.
 * @param query  The user's typed query, already trimmed by the caller (passed through verbatim).
 */
export function resolveAiSearchMode(
  status: number | null,
  jobs: unknown[] | null,
  query: string,
): AiSearchOutcome {
  // Flag off — the endpoint 404s when AI search is disabled.
  if (status === 404) return { mode: 'keyword-fallback', reason: 'flag-off', query };
  // Network failure or any non-2xx — fall back rather than strand the user.
  if (status === null || !isOk(status)) return { mode: 'keyword-fallback', reason: 'error', query };
  // Reachable but empty (no embeddings yet) — keyword search will still find matches.
  if (jobs !== null && jobs.length === 0) return { mode: 'keyword-fallback', reason: 'no-results', query };
  // Genuine AI results.
  return { mode: 'ai', jobs: jobs ?? [] };
}
