#!/usr/bin/env node
/**
 * embed-blog-videos.mjs
 * ────────────────────────────────────────────────────────────────────
 * Batch-embeds YouTube video IDs into license blog posts.
 *
 * Reads from `youtube_videos` table (state_key, yt_video_id) and
 * updates the matching `blog_posts` row's `youtube_video_id` column.
 *
 * The blog page already renders an iframe + VideoObject JSON-LD
 * when this field is populated, so no frontend changes needed.
 *
 * Usage:
 *   node scripts/embed-blog-videos.mjs                     # update all
 *   node scripts/embed-blog-videos.mjs --dry-run           # preview only
 *   node scripts/embed-blog-videos.mjs --state alabama     # single state
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env ──────────────────────────────────────────────────────
function loadEnv() {
    for (const file of ['.env.local', '.env']) {
        const filePath = path.join(ROOT, file);
        if (!fs.existsSync(filePath)) continue;
        for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim();
            if (!process.env[k]) process.env[k] = v;
        }
    }
}
loadEnv();

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const singleState = args.find((_, i) => args[i - 1] === '--state');

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Map state_key → blog slug.
 * The license blogs use the pattern: pmhnp-license-{state_key}
 */
function getBlogSlug(stateKey) {
    return `pmhnp-license-${stateKey}`;
}

/**
 * Extract YouTube video ID from various URL formats or a bare ID.
 */
function extractYouTubeId(input) {
    if (!input) return null;
    input = input.trim();

    // Already a bare video ID (11 chars, alphanum + dash/underscore)
    if (/^[\w-]{11}$/.test(input)) return input;

    // Standard watch URL
    const watchMatch = input.match(/[?&]v=([\w-]{11})/);
    if (watchMatch) return watchMatch[1];

    // Short URL
    const shortMatch = input.match(/youtu\.be\/([\w-]{11})/);
    if (shortMatch) return shortMatch[1];

    // Embed URL
    const embedMatch = input.match(/embed\/([\w-]{11})/);
    if (embedMatch) return embedMatch[1];

    return null;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📹 Blog Video Embedder — youtube_video_id Updater');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE — no DB writes\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ─── Step 1: Fetch video data from youtube_videos table ─────────
    let query = supabase
        .from('youtube_videos')
        .select('state_key, state_name, yt_video_id, video_url, blog_slug');

    if (singleState) query = query.eq('state_key', singleState);

    const { data: videos, error: vError } = await query.order('state_key');
    if (vError) {
        console.error(`❌ Error fetching youtube_videos: ${vError.message}`);
        process.exit(1);
    }

    console.log(`  📊 Found ${videos.length} video records\n`);

    if (videos.length === 0) {
        console.log('  Nothing to process.');
        process.exit(0);
    }

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const video of videos) {
        const blogSlug = getBlogSlug(video.state_key);

        // Try yt_video_id first, then extract from video_url
        let ytId = video.yt_video_id || extractYouTubeId(video.video_url);

        console.log(`  [${video.state_name}]`);
        console.log(`    Blog slug:  ${blogSlug}`);
        console.log(`    YT ID:      ${ytId || '❌ none'}`);

        if (!ytId) {
            console.log(`    ⏭️  Skipping — no YouTube video ID available\n`);
            skipped++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`    ✅ [DRY RUN] Would set blog_posts.youtube_video_id = ${ytId}\n`);
            updated++;
            continue;
        }

        // ─── Step 2: Update blog_posts row ──────────────────────────
        const { data: postData, error: postError } = await supabase
            .from('blog_posts')
            .update({
                youtube_video_id: ytId,
                updated_at: new Date().toISOString(),
            })
            .eq('slug', blogSlug)
            .select('id, slug')
            .single();

        if (postError) {
            if (postError.code === 'PGRST116') {
                console.log(`    ⚠️  Blog post not found for slug: ${blogSlug}\n`);
                notFound++;
            } else {
                console.error(`    ❌ Error: ${postError.message}\n`);
                skipped++;
            }
            continue;
        }

        console.log(`    ✅ Updated blog_posts row: ${postData.id}\n`);
        updated++;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Updated: ${updated}  |  ⏭️ Skipped: ${skipped}  |  ❓ Not found: ${notFound}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
