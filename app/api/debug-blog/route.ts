import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Temporary debug endpoint - remove after fixing blog issue
export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const results: Record<string, unknown> = {
        supabase_url: url ? `${url.substring(0, 30)}...` : 'NOT SET',
        anon_key_set: !!anonKey,
        service_key_set: !!serviceKey,
    };

    // Try with anon key (what blog pages use)
    if (url && anonKey) {
        try {
            const supabaseAnon = createClient(url, anonKey);
            const { data, error, count } = await supabaseAnon
                .from('blog_posts')
                .select('id, title, slug, status', { count: 'exact' });

            results.anon_query = {
                success: !error,
                error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null,
                count: count,
                posts: data?.map(p => ({ slug: p.slug, status: p.status })) || [],
            };
        } catch (e) {
            results.anon_query = { error: e instanceof Error ? e.message : String(e) };
        }
    }

    // Try with service role key (bypasses RLS)
    if (url && serviceKey) {
        try {
            const supabaseService = createClient(url, serviceKey);
            const { data, error, count } = await supabaseService
                .from('blog_posts')
                .select('id, title, slug, status', { count: 'exact' });

            results.service_query = {
                success: !error,
                error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null,
                count: count,
                posts: data?.map(p => ({ slug: p.slug, status: p.status })) || [],
            };
        } catch (e) {
            results.service_query = { error: e instanceof Error ? e.message : String(e) };
        }
    }

    return NextResponse.json(results);
}
