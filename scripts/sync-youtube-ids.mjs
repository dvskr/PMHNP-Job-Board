#!/usr/bin/env node
/**
 * sync-youtube-ids.mjs
 * ────────────────────────────────────────────────────────────────────
 * After Postiz publishes videos to YouTube, this script:
 *   1. Fetches your YouTube channel's recent uploads via Data API v3
 *   2. Matches video titles to state keys (e.g. "PMHNP License in Alabama" → alabama)
 *   3. Updates prod blog_posts.youtube_video_id directly
 *
 * Usage:
 *   node scripts/sync-youtube-ids.mjs                  # sync all
 *   node scripts/sync-youtube-ids.mjs --dry-run        # preview only
 *   node scripts/sync-youtube-ids.mjs --state alabama  # single state
 *
 * Required env vars:
 *   YOUTUBE_API_KEY         — YouTube Data API v3 key (free tier)
 *   YOUTUBE_CHANNEL_ID      — Your YouTube channel ID
 *   PROD_DATABASE_URL       — Prod Supabase Postgres connection string
 * ────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

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
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const PROD_DB_URL = process.env.PROD_DATABASE_URL;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const singleState = args.find((_, i) => args[i - 1] === '--state');

// ─── US States ──────────────────────────────────────────────────────
const US_STATES = [
    'alabama','alaska','arizona','arkansas','california','colorado',
    'connecticut','delaware','florida','georgia','hawaii','idaho',
    'illinois','indiana','iowa','kansas','kentucky','louisiana',
    'maine','maryland','massachusetts','michigan','minnesota',
    'mississippi','missouri','montana','nebraska','nevada',
    'new-hampshire','new-jersey','new-mexico','new-york',
    'north-carolina','north-dakota','ohio','oklahoma','oregon',
    'pennsylvania','rhode-island','south-carolina','south-dakota',
    'tennessee','texas','utah','vermont','virginia','washington',
    'west-virginia','wisconsin','wyoming',
];

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extract state key from a YouTube video title.
 * Matches patterns like:
 *   "How to Get Your PMHNP License in Alabama (2026 Guide)"
 *   "PMHNP License in New York — 2026"
 */
function titleToStateKey(title) {
    const lower = title.toLowerCase();
    // Try to extract state name after "in " or "license "
    for (const stateKey of US_STATES) {
        const stateName = stateKey.replace(/-/g, ' ');
        if (lower.includes(stateName) && (lower.includes('pmhnp') || lower.includes('license'))) {
            return stateKey;
        }
    }
    return null;
}

/**
 * Fetch all uploads from a YouTube channel using Data API v3.
 * Paginates through all results.
 */
async function fetchChannelVideos() {
    // Step 1: Get the uploads playlist ID
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${YOUTUBE_CHANNEL_ID}&key=${YOUTUBE_API_KEY}`;
    const channelRes = await fetch(channelUrl);
    if (!channelRes.ok) throw new Error(`Channel API failed: ${channelRes.status} ${await channelRes.text()}`);
    const channelData = await channelRes.json();

    if (!channelData.items?.length) throw new Error('Channel not found');
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

    // Step 2: Paginate through all uploads
    const videos = [];
    let nextPageToken = '';
    do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${YOUTUBE_API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Playlist API failed: ${res.status} ${await res.text()}`);
        const data = await res.json();

        for (const item of data.items || []) {
            videos.push({
                videoId: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                publishedAt: item.snippet.publishedAt,
            });
        }
        nextPageToken = data.nextPageToken || '';
    } while (nextPageToken);

    return videos;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔗 Sync YouTube Video IDs → Prod Blog Posts');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE\n');

    if (!YOUTUBE_API_KEY) {
        console.error('❌ Missing YOUTUBE_API_KEY env var');
        console.log('   Get one at: https://console.cloud.google.com/apis/credentials');
        console.log('   Enable "YouTube Data API v3" in your Google Cloud project');
        process.exit(1);
    }
    if (!YOUTUBE_CHANNEL_ID) {
        console.error('❌ Missing YOUTUBE_CHANNEL_ID env var');
        process.exit(1);
    }
    if (!PROD_DB_URL) {
        console.error('❌ Missing PROD_DATABASE_URL env var');
        process.exit(1);
    }

    // Step 1: Fetch YouTube videos
    console.log('  📡 Fetching videos from YouTube channel...');
    const videos = await fetchChannelVideos();
    console.log(`  📊 Found ${videos.length} videos on channel\n`);

    // Step 2: Match to states
    const stateVideos = new Map();
    for (const video of videos) {
        const stateKey = titleToStateKey(video.title);
        if (stateKey && (!singleState || singleState === stateKey)) {
            // Keep the most recent video for each state
            if (!stateVideos.has(stateKey) || video.publishedAt > stateVideos.get(stateKey).publishedAt) {
                stateVideos.set(stateKey, video);
            }
        }
    }
    console.log(`  🎯 Matched ${stateVideos.size} state videos\n`);

    if (stateVideos.size === 0) {
        console.log('  No matching videos found. Videos may not have been published yet.');
        process.exit(0);
    }

    // Step 3: Update prod blog_posts
    const prodClient = new pg.Client({ connectionString: PROD_DB_URL });
    await prodClient.connect();
    console.log('  ✅ Connected to prod DB\n');

    let updated = 0, skipped = 0, notFound = 0;

    for (const [stateKey, video] of stateVideos) {
        const slug = `how-to-get-your-pmhnp-license-in-${stateKey}-2026-requirements-steps-salary`;

        if (DRY_RUN) {
            console.log(`  ✅ [DRY] ${stateKey} → ${video.videoId} (${video.title.slice(0, 50)}...)`);
            updated++;
            continue;
        }

        const result = await prodClient.query(
            `UPDATE blog_posts 
             SET youtube_video_id = $1, updated_at = NOW() 
             WHERE slug = $2 AND (youtube_video_id IS NULL OR youtube_video_id != $1)
             RETURNING id`,
            [video.videoId, slug]
        );

        if (result.rowCount > 0) {
            console.log(`  ✅ ${stateKey} → ${video.videoId}`);
            updated++;
        } else {
            const exists = await prodClient.query('SELECT youtube_video_id FROM blog_posts WHERE slug = $1', [slug]);
            if (exists.rows.length === 0) {
                console.log(`  ❌ ${stateKey} — blog not found`);
                notFound++;
            } else if (exists.rows[0].youtube_video_id === video.videoId) {
                console.log(`  ⏭️  ${stateKey} — already set`);
                skipped++;
            }
        }
    }

    await prodClient.end();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Updated: ${updated}  |  ⏭️ Skipped: ${skipped}  |  ❌ Not found: ${notFound}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
