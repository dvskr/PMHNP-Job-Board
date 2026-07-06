/**
 * Central base URL for public Supabase Storage assets (images, icons, PDFs).
 *
 * This is the ONLY place the asset host may appear in lib/ or components/ —
 * every other module must build URLs via siteAsset()/storageAsset() so a
 * bucket/project move is a one-line change instead of a ~950-site sweep.
 * (tests/regressions/supabase-url-ratchet.test.ts enforces this: the set of
 * files still hardcoding the host can only shrink.)
 *
 * IMPORTANT: the asset host is a DIFFERENT Supabase project from the app's
 * database/auth/uploads project (NEXT_PUBLIC_SUPABASE_URL) — do NOT derive
 * this from NEXT_PUBLIC_SUPABASE_URL or any existing supabase client env.
 *
 * NEXT_PUBLIC_ vars are inlined at build time, so this module is safe to
 * import from both server and client components.
 */

export const ASSET_BASE =
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ||
  'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public';

/** Strips leading slashes so callers can pass '/images/x.webp' or 'images/x.webp'. */
function trimLeadingSlashes(path: string): string {
  return path.replace(/^\/+/, '');
}

/**
 * Public URL for a file in an arbitrary public storage bucket.
 * e.g. storageAsset('email-assets', 'logo.png')
 */
export function storageAsset(bucket: string, path: string): string {
  return `${ASSET_BASE}/${trimLeadingSlashes(bucket)}/${trimLeadingSlashes(path)}`;
}

/**
 * Public URL for a file in the `site-assets` bucket (the default bucket for
 * page imagery). e.g. siteAsset('images/categories/hero_wc_remote.webp')
 */
export function siteAsset(path: string): string {
  return storageAsset('site-assets', path);
}
