/**
 * Guard for user-supplied image URLs rendered through next/image.
 *
 * Mirrors next.config.ts `images.remotePatterns`: the optimizer only accepts
 * local /public paths, `*.supabase.co/storage/**` (our upload buckets), and
 * `lh3.googleusercontent.com` (Google OAuth avatars). But several DB fields
 * that feed logos/avatars are NOT guaranteed to hold those hosts — the
 * employer settings "Logo URL" input is free text and is copied onto every
 * EmployerJob row (app/api/employer/settings/route.ts), and
 * /api/auth/profile accepts any https avatarUrl. Sending a foreign host
 * through the optimizer returns 400 in production (broken image) and throws
 * during render in dev.
 *
 * Callers gate with `unoptimized={!isOptimizableImageSrc(src)}`: allow-listed
 * uploads keep the sharp right-sized AVIF/WebP variants, while foreign hosts
 * fall back to serving the original file exactly like the old raw <img> did.
 *
 * Keep this list in sync with next.config.ts `images.remotePatterns`.
 */
export function isOptimizableImageSrc(src: string): boolean {
  // Local /public assets are always optimizable ('//' would be
  // protocol-relative, which next/image rejects outright).
  if (src.startsWith('/') && !src.startsWith('//')) return true;

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return false; // blob:, data:, malformed — not proxyable
  }

  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'lh3.googleusercontent.com') return true;
  return parsed.hostname.endsWith('.supabase.co') && parsed.pathname.startsWith('/storage/');
}
