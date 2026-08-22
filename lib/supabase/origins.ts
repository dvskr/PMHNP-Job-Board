/**
 * Hosts that serve this project's Supabase endpoints (auth, REST, storage).
 *
 * Anything on `*.supabase.co` is already covered by the wildcards in the CSP
 * and in next/image's `remotePatterns`, so this module exists for exactly one
 * case: a Supabase Custom Domain (e.g. api.pmhnphiring.com), which is a plain
 * host with no wildcard to hide behind. Without an explicit entry the browser
 * blocks every auth/storage request the moment the domain is activated.
 *
 * Activation is therefore an env-only switch: point NEXT_PUBLIC_SUPABASE_URL
 * (and NEXT_PUBLIC_ASSET_BASE_URL, if assets move too) at the custom host and
 * the CSP + image allowlist follow automatically.
 *
 * Supabase keeps the default `<ref>.supabase.co` domain serving after a custom
 * domain is activated, so both stay allowed and the *.supabase.co URLs already
 * stored in the database (résumés, logos, attachments) never break.
 *
 * See docs/runbooks/supabase-custom-domain.md.
 */

/** `*.supabase.co` is matched by wildcard elsewhere, so those need no entry. */
function isDefaultSupabaseHost(host: string): boolean {
  return host === 'supabase.co' || host.endsWith('.supabase.co');
}

/**
 * Bare hostnames (no protocol, no port) of any non-default Supabase host
 * found in the given URLs. Unset and unparseable values are ignored so a
 * missing env var degrades to "no custom domain" rather than a build crash.
 */
export function customSupabaseHostsFrom(
  urls: ReadonlyArray<string | undefined>
): string[] {
  const hosts = urls.flatMap((raw) => {
    if (!raw) return [];
    let host: string;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      return [];
    }
    return isDefaultSupabaseHost(host) ? [] : [host];
  });

  return [...new Set(hosts)];
}

// Read as literal member expressions: Next.js only inlines NEXT_PUBLIC_ vars
// when it sees `process.env.NEXT_PUBLIC_X` verbatim, not via a destructured
// or forwarded `process.env`.
export const CUSTOM_SUPABASE_HOSTS: readonly string[] = customSupabaseHostsFrom([
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_ASSET_BASE_URL,
]);

/** CSP source list covering the default domain plus any custom domain. */
export const SUPABASE_CSP_SOURCES: string = [
  'https://*.supabase.co',
  ...CUSTOM_SUPABASE_HOSTS.map((host) => `https://${host}`),
].join(' ');

/**
 * True when `url` points at storage we control — used to keep user-supplied
 * file URLs (résumés, cover letters) from pointing anywhere else.
 *
 * Accepts both the default domain and an activated custom domain, since files
 * uploaded before the switch keep their `<ref>.supabase.co` URLs.
 */
export function isOwnSupabaseStorageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  // The leading dot matters: a bare 'supabase.co' suffix test would also
  // accept an attacker-registered host such as 'notsupabase.co'.
  return host.endsWith('.supabase.co') || CUSTOM_SUPABASE_HOSTS.includes(host);
}
