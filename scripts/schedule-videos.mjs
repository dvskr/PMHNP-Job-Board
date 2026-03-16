#!/usr/bin/env node
/**
 * schedule-videos.mjs
 * ────────────────────────────────────────────────────────────────────
 * DB-driven YouTube video scheduler via the Postiz API.
 * Reads metadata from the youtube_videos table, uploads to Postiz,
 * and updates status/dates in the database.
 *
 * Usage:
 *   node scripts/schedule-videos.mjs                        # schedule all pending
 *   node scripts/schedule-videos.mjs --dry-run              # preview only
 *   node scripts/schedule-videos.mjs --start-date 2026-03-15  # custom start
 *   node scripts/schedule-videos.mjs --state alabama        # single state
 *
 * Required env vars:
 *   POSTIZ_API_KEY, POSTIZ_API_URL, POSTIZ_YT_INTEGRATION_ID
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

// ─── Config ─────────────────────────────────────────────────────────
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;
const POSTIZ_API_URL = (process.env.POSTIZ_API_URL || 'https://app.postiz.com').replace(/\/$/, '');
const POSTIZ_YT_INTEGRATION_ID = process.env.POSTIZ_YT_INTEGRATION_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const startDateArg = args.find((_, i) => args[i - 1] === '--start-date');
const singleState = args.find((_, i) => args[i - 1] === '--state');

// Default: start tomorrow at 10 AM EST (UTC-5 = 15:00 UTC)
const START_DATE = startDateArg
    ? new Date(`${startDateArg}T15:00:00.000Z`)
    : (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(15, 0, 0, 0);
        return d;
    })();

// ─── Helpers ────────────────────────────────────────────────────────

function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── Postiz API ─────────────────────────────────────────────────────

async function postizUploadFromUrl(url) {
    const res = await fetch(`${POSTIZ_API_URL}/public/v1/upload-from-url`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${POSTIZ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

async function postizUploadFile(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const blob = new Blob([fileBuffer]);
    const formData = new globalThis.FormData();
    formData.append('file', blob, fileName);

    const res = await fetch(`${POSTIZ_API_URL}/public/v1/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${POSTIZ_API_KEY}` },
        body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

async function postizSchedulePost(payload) {
    const res = await fetch(`${POSTIZ_API_URL}/public/v1/posts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${POSTIZ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Schedule failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

async function postizGetIntegrations() {
    const res = await fetch(`${POSTIZ_API_URL}/public/v1/integrations`, {
        headers: { Authorization: `Bearer ${POSTIZ_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Integrations failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📹 YouTube Video Scheduler (DB-driven) via Postiz');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE — no API calls\n');

    // Validate config
    if (!DRY_RUN) {
        if (!POSTIZ_API_KEY) { console.error('❌ POSTIZ_API_KEY not set'); process.exit(1); }
        if (!POSTIZ_YT_INTEGRATION_ID) {
            console.error('❌ POSTIZ_YT_INTEGRATION_ID not set. Fetching available integrations...\n');
            try { console.log(JSON.stringify(await postizGetIntegrations(), null, 2)); } catch (e) { console.error(e.message); }
            process.exit(1);
        }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch pending videos from DB
    let query = supabase
        .from('youtube_videos')
        .select('*')
        .eq('status', 'pending');

    if (singleState) query = query.eq('state_key', singleState);

    const { data: videos, error } = await query.order('state_key');
    if (error) { console.error(`❌ DB error: ${error.message}`); process.exit(1); }

    console.log(`  📊 Found ${videos.length} pending videos in DB\n`);

    if (videos.length === 0) {
        console.log('  Nothing to schedule. All videos are already scheduled or published.');
        process.exit(0);
    }

    let successCount = 0;

    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const scheduledDate = addDays(START_DATE, i);
        const dateStr = scheduledDate.toISOString();

        console.log(`  [${i + 1}/${videos.length}] ${video.state_name}`);
        console.log(`    📅 Schedule: ${scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`);
        console.log(`    🎬 Title:    ${video.yt_title}`);
        console.log(`    📹 Video:    ${video.video_url ? '✅ in Storage' : '❌ not uploaded'}`);
        console.log(`    🖼️  Thumb:    ${video.thumbnail_url ? '✅ in Storage' : '⚠️ none'}`);

        if (DRY_RUN) {
            console.log(`    ✅ [DRY RUN] Would schedule\n`);
            successCount++;
            continue;
        }

        if (!video.video_url) {
            console.log(`    ⏭️  Skipping — no video uploaded yet\n`);
            continue;
        }

        try {
            // Upload video to Postiz from Supabase Storage URL
            console.log(`    ⬆️  Sending video to Postiz...`);
            const videoUpload = await postizUploadFromUrl(video.video_url);
            console.log(`    ✅ Video sent (id: ${videoUpload.id || 'ok'})`);

            // Upload thumbnail if available
            let thumbUpload = null;
            if (video.thumbnail_url) {
                console.log(`    ⬆️  Sending thumbnail...`);
                thumbUpload = await postizUploadFromUrl(video.thumbnail_url);
                console.log(`    ✅ Thumbnail sent`);
            }

            // Schedule the post
            console.log(`    📅 Scheduling...`);
            const payload = {
                type: 'schedule',
                date: dateStr,
                posts: [{
                    integration: POSTIZ_YT_INTEGRATION_ID,
                    value: video.yt_description,
                    media: videoUpload.id ? [{ id: videoUpload.id }] : [],
                    settings: {
                        title: video.yt_title,
                        description: video.yt_description,
                        tags: video.yt_tags,
                        privacy: 'public',
                        ...(thumbUpload?.id ? { thumbnail: { id: thumbUpload.id } } : {}),
                    },
                }],
            };

            const result = await postizSchedulePost(payload);

            // Update DB
            await supabase
                .from('youtube_videos')
                .update({
                    status: 'scheduled',
                    postiz_post_id: result.id || result.postId || null,
                    scheduled_date: dateStr,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', video.id);

            successCount++;
            console.log(`    ✅ Scheduled successfully!\n`);

            // Rate limit
            if (i < videos.length - 1) await sleep(3000);
        } catch (err) {
            console.error(`    ❌ Failed: ${err.message}\n`);
            await supabase
                .from('youtube_videos')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', video.id);
        }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Scheduled: ${successCount}/${videos.length}`);
    console.log(`  📅 Range: ${START_DATE.toLocaleDateString()} → ${addDays(START_DATE, videos.length - 1).toLocaleDateString()}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
