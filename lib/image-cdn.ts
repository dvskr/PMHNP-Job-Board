/**
 * Centralized image CDN base URL.
 * 
 * In production, Vercel sets NEXT_PUBLIC_SUPABASE_URL to the prod instance.
 * Locally, .env.local points to the dev instance.
 * 
 * All image paths in the codebase should use this constant instead of
 * hardcoding the Supabase URL.
 */
export const IMAGE_CDN_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets`;
