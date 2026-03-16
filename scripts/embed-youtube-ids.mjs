#!/usr/bin/env node
/**
 * embed-youtube-ids.mjs
 * ────────────────────────────────────────────────────────────────────
 * DB-driven script to embed YouTube video IDs into blog posts.
 * Reads from youtube_videos table, checks for published videos,
 * and updates both youtube_videos and blog_posts tables.
 *
 * Usage:
 *   node scripts/embed-youtube-ids.mjs                    # auto from DB
 *   node scripts/embed-youtube-ids.mjs --dry-run          # preview only
 *   node scripts/embed-youtube-ids.mjs --manual           # interactive
 *   node scripts/embed-youtube-ids.mjs --from-file map.json  # bulk from JSON
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   BLOG_API_KEY (for PATCH /api/blog)
 *   POSTIZ_API_KEY (for checking published posts)
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

const BLOG_API_KEY = process.env.BLOG_API_KEY;
const BLOG_API_BASE_URL = (process.env.BLOG_API_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;
const POSTIZ_API_URL = (process.env.POSTIZ_API_URL || 'https://app.postiz.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MANUAL_MODE = args.includes('--manual');
const fromFileArg = args.find((_, i) => args[i - 1] === '--from-file');

// ─── Helpers ────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function patchBlogPost(slug, youtubeVideoId) {
    const res = await fetch(`${BLOG_API_BASE_URL}/api/blog`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${BLOG_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug, youtube_video_id: youtubeVideoId }),
    });
    if (!res.ok) throw new Error(`PATCH failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

async function getPostizPostDetails(postId) {
    const res = await fetch(`${POSTIZ_API_URL}/public/v1/posts/${postId}`, {
        headers: { Authorization: `Bearer ${POSTIZ_API_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
}

// ─── Mode 1: From JSON file ────────────────────────────────────────
async function embedFromFile(supabase, filePath) {
    console.log(`📂 Loading mapping from: ${filePath}\n`);

    const mapping = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let entries;
    if (Array.isArray(mapping)) {
        entries = mapping.map((m) => ({ slug: m.slug || m.blog_slug, videoId: m.youtube_video_id || m.videoId }));
    } else {
        entries = Object.entries(mapping).map(([slug, videoId]) => ({ slug, videoId }));
    }

    let success = 0, failed = 0;

    for (const { slug, videoId } of entries) {
        if (!slug || !videoId) { console.log(`  ⏭️ Skipping: ${slug || 'no slug'}`); continue; }

        console.log(`  📝 ${slug} → ${videoId}`);

        if (DRY_RUN) { console.log(`     ✅ [DRY RUN]\n`); success++; continue; }

        try {
            // Update blog post
            await patchBlogPost(slug, videoId);

            // Update youtube_videos table
            await supabase
                .from('youtube_videos')
                .update({
                    youtube_video_id: videoId,
                    status: 'embedded',
                    published_date: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('blog_slug', slug);

            console.log(`     ✅ Updated!\n`);
            success++;
            await sleep(500);
        } catch (err) {
            console.error(`     ❌ ${err.message}\n`);
            failed++;
        }
    }

    return { success, failed, skipped: 0 };
}

// ─── Mode 2: Auto from DB + Postiz ─────────────────────────────────
async function embedFromDB(supabase) {
    const now = new Date();

    // Fetch videos that are scheduled and past their scheduled date
    const { data: videos, error } = await supabase
        .from('youtube_videos')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_date', now.toISOString())
        .order('scheduled_date');

    if (error) { console.error(`❌ DB error: ${error.message}`); process.exit(1); }

    console.log(`  📊 Found ${videos.length} scheduled videos past their publish date\n`);

    let success = 0, failed = 0, skipped = 0;

    for (const video of videos) {
        console.log(`  🔍 ${video.state_name} (scheduled: ${new Date(video.scheduled_date).toLocaleDateString()})`);

        // Check Postiz for the YouTube video ID
        if (video.postiz_post_id && POSTIZ_API_KEY) {
            try {
                const details = await getPostizPostDetails(video.postiz_post_id);
                const ytId = details?.youtubeVideoId || details?.externalId;

                if (ytId) {
                    console.log(`     Found YT ID: ${ytId}`);

                    if (!DRY_RUN) {
                        await patchBlogPost(video.blog_slug, ytId);

                        await supabase
                            .from('youtube_videos')
                            .update({
                                youtube_video_id: ytId,
                                status: 'embedded',
                                published_date: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', video.id);

                        console.log(`     ✅ Embedded into blog!\n`);
                    } else {
                        console.log(`     ✅ [DRY RUN] Would embed\n`);
                    }
                    success++;
                } else {
                    console.log(`     ⏳ Video not yet processed by YouTube\n`);
                    skipped++;
                }
                await sleep(1000);
            } catch (err) {
                console.error(`     ❌ ${err.message}\n`);
                failed++;
            }
        } else {
            console.log(`     ⚠️ No Postiz post ID — use --from-file or --manual\n`);
            skipped++;
        }
    }

    return { success, failed, skipped };
}

// ─── Mode 3: Manual ─────────────────────────────────────────────────
async function embedManual(supabase) {
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise((r) => rl.question(q, r));

    console.log('🖊️  Manual YouTube ID Embedding\n');

    // Show available states from DB
    const { data: videos } = await supabase
        .from('youtube_videos')
        .select('state_key, state_name, blog_slug, youtube_video_id, status')
        .is('youtube_video_id', null)
        .order('state_key');

    if (videos?.length) {
        console.log(`  States without YouTube ID (${videos.length}):`);
        for (const v of videos) {
            console.log(`    ${v.state_key} → ${v.blog_slug} [${v.status}]`);
        }
        console.log('');
    }

    while (true) {
        const slug = await question('  Blog slug (or "done"): ');
        if (slug.trim().toLowerCase() === 'done') break;

        const videoId = await question('  YouTube video ID: ');
        if (!videoId.trim()) { console.log('  ⏭️ Skipped\n'); continue; }

        if (DRY_RUN) {
            console.log(`  ✅ [DRY] ${slug} → ${videoId}\n`);
        } else {
            try {
                await patchBlogPost(slug.trim(), videoId.trim());
                await supabase
                    .from('youtube_videos')
                    .update({
                        youtube_video_id: videoId.trim(),
                        status: 'embedded',
                        published_date: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('blog_slug', slug.trim());
                console.log(`  ✅ Updated!\n`);
            } catch (err) {
                console.error(`  ❌ ${err.message}\n`);
            }
        }
    }

    rl.close();
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔗 YouTube Video ID → Blog Post Embedder (DB-driven)');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE\n');

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let result;
    if (fromFileArg) {
        result = await embedFromFile(supabase, fromFileArg);
    } else if (MANUAL_MODE) {
        await embedManual(supabase);
        return;
    } else {
        result = await embedFromDB(supabase);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Embedded: ${result.success}`);
    if (result.failed) console.log(`  ❌ Failed:   ${result.failed}`);
    if (result.skipped) console.log(`  ⏭️ Skipped:  ${result.skipped}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
