#!/usr/bin/env node
/**
 * schedule-social-videos.mjs
 * ────────────────────────────────────────────────────────────────────
 * Multi-platform video scheduler via the Postiz API.
 * Reads metadata from the youtube_videos table, uploads videos to
 * Postiz, and schedules posts across: YouTube, LinkedIn, X, Facebook.
 *
 * Usage:
 *   node scripts/schedule-social-videos.mjs                          # schedule all pending
 *   node scripts/schedule-social-videos.mjs --dry-run                # preview only
 *   node scripts/schedule-social-videos.mjs --start-date 2026-03-15  # custom start
 *   node scripts/schedule-social-videos.mjs --state alabama          # single state
 *   node scripts/schedule-social-videos.mjs --platforms yt,li,x,fb   # select platforms
 *
 * Required env vars:
 *   POSTIZ_API_KEY, POSTIZ_API_URL
 *   POSTIZ_YT_INTEGRATION_ID   — YouTube
 *   POSTIZ_LI_INTEGRATION_ID   — LinkedIn
 *   POSTIZ_X_INTEGRATION_ID    — X (Twitter)
 *   POSTIZ_FB_INTEGRATION_ID   — Facebook
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
const POSTIZ_API_URL = (process.env.POSTIZ_API_URL || 'https://api.postiz.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const INTEGRATIONS = {
    yt: process.env.POSTIZ_YT_INTEGRATION_ID,
    li: process.env.POSTIZ_LI_INTEGRATION_ID,
    x: process.env.POSTIZ_X_INTEGRATION_ID,
    fb: process.env.POSTIZ_FB_INTEGRATION_ID,
};

const PLATFORM_NAMES = { yt: 'YouTube', li: 'LinkedIn', x: 'X (Twitter)', fb: 'Facebook' };

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const startDateArg = args.find((_, i) => args[i - 1] === '--start-date');
const singleState = args.find((_, i) => args[i - 1] === '--state');
const platformsArg = args.find((_, i) => args[i - 1] === '--platforms');

// Default: start Monday March 16 at 10 AM EST (UTC-5 = 15:00 UTC)
const START_DATE = startDateArg
    ? new Date(`${startDateArg}T15:00:00.000Z`)
    : new Date('2026-03-16T15:00:00.000Z');

// 2 videos per day: 10 AM EST (15:00 UTC) and 3 PM EST (20:00 UTC)
const MORNING_HOUR_UTC = 15; // 10 AM EST
const AFTERNOON_HOUR_UTC = 20; // 3 PM EST

// Select platforms (default: yt, li, fb — no X)
const ENABLED_PLATFORMS = platformsArg
    ? platformsArg.split(',').map(p => p.trim().toLowerCase())
    : ['yt', 'li', 'fb'];

// ─── Helpers ────────────────────────────────────────────────────────

function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

/**
 * 2 per day: index 0 → day 0 morning, index 1 → day 0 afternoon,
 *            index 2 → day 1 morning, index 3 → day 1 afternoon, ...
 */
function getScheduledDate(index) {
    const dayOffset = Math.floor(index / 2);
    const isAfternoon = index % 2 === 1;
    const d = addDays(START_DATE, dayOffset);
    d.setUTCHours(isAfternoon ? AFTERNOON_HOUR_UTC : MORNING_HOUR_UTC, 0, 0, 0);
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
            Authorization: POSTIZ_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

async function postizSchedulePost(payload) {
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(`${POSTIZ_API_URL}/public/v1/posts`, {
            method: 'POST',
            headers: {
                Authorization: POSTIZ_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (res.status === 429 && attempt < maxRetries) {
            const waitSec = 30 * Math.pow(2, attempt); // 30s, 60s, 120s, 240s, 480s
            console.log(`    ⏳ Rate limited (429), waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
            await sleep(waitSec * 1000);
            continue;
        }
        if (!res.ok) throw new Error(`Schedule failed (${res.status}): ${await res.text()}`);
        return await res.json();
    }
}

async function postizGetIntegrations() {
    const res = await fetch(`${POSTIZ_API_URL}/public/v1/integrations`, {
        headers: { Authorization: POSTIZ_API_KEY },
    });
    if (!res.ok) throw new Error(`Integrations failed (${res.status}): ${await res.text()}`);
    return await res.json();
}

// ─── Social Post Templates ──────────────────────────────────────────

function getLinkedInContent(video) {
    return `🏥 How to Get Your PMHNP License in ${video.state_name} (2026 Guide)

We just published a comprehensive breakdown of everything you need to know about becoming a Psychiatric-Mental Health Nurse Practitioner in ${video.state_name}:

✅ Step-by-step licensure process
✅ Practice authority details
✅ Salary data & job market
✅ Telehealth regulations

📌 Full written guide on pmhnphiring.com
📌 Search "PMHNP license ${video.state_name}" to find it

#PMHNP #NursePractitioner #MentalHealth #Nursing #Healthcare #${video.state_name.replace(/\s+/g, '')}`;
}

function getXContent(video) {
    return `🏥 How to get your PMHNP license in ${video.state_name} — complete 2026 guide

✅ Licensure steps
✅ Salary data
✅ Practice authority & telehealth rules

Full guide 👇
https://pmhnphiring.com/blog/pmhnp-license-${video.state_key}

#PMHNP #NursePractitioner #${video.state_name.replace(/\s+/g, '')}`;
}

function getFacebookContent(video) {
    return `🏥 How to Get Your PMHNP License in ${video.state_name} (2026 Guide)

Thinking about becoming a Psychiatric-Mental Health Nurse Practitioner in ${video.state_name}? We've put together a comprehensive guide covering:

✅ Step-by-step licensure requirements
✅ Full vs. reduced practice authority
✅ Prescriptive authority details
✅ Average salary & job market data
✅ Telehealth rules

📌 Read the full guide: https://pmhnphiring.com/blog/pmhnp-license-${video.state_key}
📌 Find PMHNP jobs: https://pmhnphiring.com/jobs

#PMHNP #NursePractitioner #MentalHealth #PsychNurse #${video.state_name.replace(/\s+/g, '')}`;
}

// ─── Build Post Entries ─────────────────────────────────────────────

function buildPostEntries(video, uploadResult) {
    const posts = [];
    const media = uploadResult?.id ? [{ id: uploadResult.id, path: uploadResult.path || '' }] : [];

    // YouTube
    if (ENABLED_PLATFORMS.includes('yt') && INTEGRATIONS.yt) {
        posts.push({
            integration: { id: INTEGRATIONS.yt },
            value: [{ content: video.yt_description, image: media }],
            settings: {
                __type: 'youtube',
                title: video.yt_title,
                type: 'public',
                selfDeclaredMadeForKids: 'no',
                tags: (video.yt_tags || []).map(t => ({ value: t, label: t })),
            },
        });
    }

    // LinkedIn
    if (ENABLED_PLATFORMS.includes('li') && INTEGRATIONS.li) {
        posts.push({
            integration: { id: INTEGRATIONS.li },
            value: [{ content: getLinkedInContent(video), image: media }],
            settings: { __type: 'linkedin' },
        });
    }

    // X (Twitter)
    if (ENABLED_PLATFORMS.includes('x') && INTEGRATIONS.x) {
        posts.push({
            integration: { id: INTEGRATIONS.x },
            value: [{ content: getXContent(video), image: media }],
            settings: { __type: 'x', who_can_reply_post: 'everyone' },
        });
    }

    // Facebook
    if (ENABLED_PLATFORMS.includes('fb') && INTEGRATIONS.fb) {
        posts.push({
            integration: { id: INTEGRATIONS.fb },
            value: [{ content: getFacebookContent(video), image: media }],
            settings: { __type: 'facebook' },
        });
    }

    return posts;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📹 Multi-Platform Video Scheduler via Postiz');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE — no API calls\n');

    // Show enabled platforms
    const enabledNames = ENABLED_PLATFORMS.map(p => PLATFORM_NAMES[p] || p).join(', ');
    console.log(`  📡 Platforms: ${enabledNames}\n`);

    // Validate config
    if (!DRY_RUN) {
        if (!POSTIZ_API_KEY) { console.error('❌ POSTIZ_API_KEY not set'); process.exit(1); }

        // Check which integrations are configured
        const missing = ENABLED_PLATFORMS.filter(p => !INTEGRATIONS[p]);
        if (missing.length > 0) {
            console.error(`❌ Missing integration IDs for: ${missing.map(p => PLATFORM_NAMES[p]).join(', ')}`);
            console.log('\n  Set the following env vars:');
            missing.forEach(p => {
                const envName = `POSTIZ_${p.toUpperCase()}_INTEGRATION_ID`;
                console.log(`    ${envName}`);
            });
            console.log('\n  Fetching available integrations from Postiz...\n');
            try {
                const integrations = await postizGetIntegrations();
                console.log(JSON.stringify(integrations, null, 2));
            } catch (e) {
                console.error(`  Could not fetch integrations: ${e.message}`);
            }
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
        const scheduledDate = getScheduledDate(i);
        const dateStr = scheduledDate.toISOString();
        const timeSlot = i % 2 === 0 ? '🌅 10 AM EST' : '🌇 3 PM EST';

        console.log(`  [${i + 1}/${videos.length}] ${video.state_name}`);
        console.log(`    📅 Schedule: ${scheduledDate.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        })} ${timeSlot}`);
        console.log(`    🎬 Title:    ${video.yt_title}`);
        console.log(`    📹 Video:    ${video.video_url ? '✅ in Storage' : '❌ not uploaded'}`);
        console.log(`    📡 Targets:  ${enabledNames}`);

        if (DRY_RUN) {
            console.log(`    ✅ [DRY RUN] Would schedule to ${enabledNames}\n`);
            successCount++;
            continue;
        }

        if (!video.video_url) {
            console.log(`    ⏭️  Skipping — no video uploaded yet\n`);
            continue;
        }

        try {
            // Upload video to Postiz from Supabase Storage URL
            console.log(`    ⬆️  Uploading video to Postiz...`);
            const uploadResult = await postizUploadFromUrl(video.video_url);
            console.log(`    ✅ Video uploaded (id: ${uploadResult.id || 'ok'})`);

            // Upload thumbnail if available
            let thumbResult = null;
            if (video.thumbnail_url) {
                console.log(`    ⬆️  Uploading thumbnail...`);
                thumbResult = await postizUploadFromUrl(video.thumbnail_url);
                console.log(`    ✅ Thumbnail uploaded`);
            }

            // Build multi-platform post entries
            const postEntries = buildPostEntries(video, uploadResult);

            if (postEntries.length === 0) {
                console.log(`    ⚠️  No platforms configured, skipping\n`);
                continue;
            }

            // Schedule the multi-platform post
            console.log(`    📅 Scheduling across ${postEntries.length} platform(s)...`);
            const payload = {
                type: 'schedule',
                date: dateStr,
                shortLink: false,
                tags: [],
                posts: postEntries,
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
            if (i < videos.length - 1) await sleep(30000);
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
    console.log(`  📡 Platforms: ${enabledNames}`);
    console.log(`  📅 Range: ${START_DATE.toLocaleDateString()} → ${addDays(START_DATE, videos.length - 1).toLocaleDateString()}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
