/**
 * lib/email/list-unsubscribe.ts — RFC 8058 List-Unsubscribe header construction (E1).
 *
 * Gmail/Yahoo machine-POST `List-Unsubscribe=One-Click` to the List-Unsubscribe
 * URL with no human interaction. That URL MUST resolve to a real POST handler.
 * Every header in the codebase used to point at a 'use client' page (405 on POST)
 * — a deliverability penalty. These helpers point the machine-POST URL at the real
 * /api/one-click-unsubscribe endpoint and keep the human page as a second fallback.
 */

const ONE_CLICK_PATH = '/api/one-click-unsubscribe';

/** Build the RFC 8058 machine-POST URL from a base + unsubscribe token. */
export function oneClickUnsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}${ONE_CLICK_PATH}?token=${token}`;
}

/**
 * Build the List-Unsubscribe header set from a human-facing unsubscribe URL.
 * - No URL → null (transactional mail gets no header).
 * - URL with ?token= → one-click API URL + human page fallback + One-Click POST header.
 * - URL without a token → the page as a plain (non-one-click) unsubscribe link only,
 *   so we never falsely advertise RFC 8058 support for a URL we can't POST to.
 */
export function buildListUnsubscribeHeaders(
  unsubscribeUrl: string | undefined,
  baseUrl: string,
): Record<string, string> | null {
  if (!unsubscribeUrl) return null;

  const tokenMatch = unsubscribeUrl.match(/[?&]token=([^&]+)/);
  if (!tokenMatch) {
    return { 'List-Unsubscribe': `<${unsubscribeUrl}>` };
  }

  const oneClickUrl = oneClickUnsubscribeUrl(baseUrl, tokenMatch[1]);
  return {
    'List-Unsubscribe': `<${oneClickUrl}>, <${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
