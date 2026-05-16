/**
 * IndexNow client.
 *
 * IndexNow is a free protocol supported by Bing, Yandex, Seznam, and
 * Naver (and indirectly Google via Bing's API surface) that lets a
 * site signal "this URL just changed, please re-crawl." It removes the
 * "wait days for Google to notice your enriched content" problem.
 *
 * Protocol summary:
 *   - Host a key file at /{key}.txt containing the key (already in /public).
 *   - POST a JSON body listing URLs to the endpoint.
 *   - Rate limit: 10,000 URLs per day per host. Engines de-prioritize
 *     sites that spam.
 *
 * Env requirements:
 *   - INDEXNOW_KEY: 32-128 char hex string. Must match the file at /key.txt.
 *
 * Behavior:
 *   - When the key is missing, calls become no-ops (logged) so dev /
 *     preview environments don't pollute the daily quota.
 *   - All URLs must be on the configured host. Cross-host pings are
 *     rejected by the API anyway, so we filter client-side.
 */

import { logger } from './logger';

const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const HOST = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

function getKey(): string | null {
  const key = process.env.INDEXNOW_KEY;
  if (!key || key.length < 8) return null;
  return key;
}

function sameHost(urls: string[]): string[] {
  const host = new URL(HOST).host;
  return urls.filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
}

/**
 * Submit a list of URLs to IndexNow. Async + fire-and-forget-safe — the
 * caller can await for telemetry or ignore the promise. Throws only on
 * programmer error (no key when expected); network failures resolve
 * with `{ ok: false }` so the caller doesn't crash a cron.
 */
export async function pingIndexNow(urls: string[]): Promise<{ ok: boolean; submitted: number; reason?: string }> {
  if (urls.length === 0) return { ok: true, submitted: 0 };

  const filtered = sameHost(urls).slice(0, 10_000);
  if (filtered.length === 0) {
    return { ok: false, submitted: 0, reason: 'no_same_host_urls' };
  }

  const key = getKey();
  if (!key) {
    logger.info('IndexNow ping skipped — INDEXNOW_KEY not set', { count: filtered.length });
    return { ok: false, submitted: 0, reason: 'no_key' };
  }

  const host = new URL(HOST).host;
  const body = {
    host,
    key,
    keyLocation: `${HOST}/${key}.txt`,
    urlList: filtered,
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 202) {
      // IndexNow returns 200/202 on accept, 4xx on host mismatch / key error.
      const text = await res.text().catch(() => '');
      logger.warn('IndexNow rejected', { status: res.status, body: text.slice(0, 200) });
      return { ok: false, submitted: 0, reason: `http_${res.status}` };
    }
    return { ok: true, submitted: filtered.length };
  } catch (err) {
    logger.warn('IndexNow network error', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, submitted: 0, reason: 'network_error' };
  }
}
