#!/usr/bin/env node
/**
 * upload-yt-assets.mjs
 * ────────────────────────────────────────────────────────────────────
 * Uploads local thumbnails and videos to Supabase Storage buckets,
 * then updates the youtube_videos DB rows with public URLs.
 *
 * Usage:
 *   node scripts/upload-yt-assets.mjs                    # upload all
 *   node scripts/upload-yt-assets.mjs --thumbnails-only   # thumbnails only
 *   node scripts/upload-yt-assets.mjs --videos-only       # videos only
 *   node scripts/upload-yt-assets.mjs --dry-run           # preview only
 *   node scripts/upload-yt-assets.mjs --state alabama     # single state
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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const THUMBNAILS_DIR = path.join(ROOT, 'yt-thumbnails');
const VIDEOS_DIR = path.join(ROOT, 'yt-videos');

const THUMB_BUCKET = 'yt-thumbnails';
const VIDEO_BUCKET = 'yt-videos';

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const THUMBS_ONLY = args.includes('--thumbnails-only');
const VIDEOS_ONLY = args.includes('--videos-only');
const singleState = args.find((_, i) => args[i - 1] === '--state');

// ─── Helpers ────────────────────────────────────────────────────────

function getMimeType(ext) {
    const map = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    };
    return map[ext] || 'application/octet-stream';
}

function findFile(dir, stateKey, extensions) {
    for (const ext of extensions) {
        const filePath = path.join(dir, `${stateKey}${ext}`);
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ☁️  Upload YouTube Assets to Supabase Storage');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE\n');

    if (!SUPABASE_URL || !SERVICE_KEY) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Ensure buckets exist ──
    if (!DRY_RUN) {
        for (const bucket of [THUMB_BUCKET, VIDEO_BUCKET]) {
            const { data: buckets } = await supabase.storage.listBuckets();
            if (!buckets?.find((b) => b.name === bucket)) {
                const { error } = await supabase.storage.createBucket(bucket, {
                    public: true,
                    fileSizeLimit: bucket === VIDEO_BUCKET ? 500 * 1024 * 1024 : 10 * 1024 * 1024,
                });
                if (error && !error.message?.includes('already exists')) {
                    console.error(`  ❌ Failed to create bucket ${bucket}: ${error.message}`);
                } else {
                    console.log(`  📁 Created bucket: ${bucket}`);
                }
            } else {
                console.log(`  📁 Bucket exists: ${bucket}`);
            }
        }
        console.log('');
    }

    // ── Fetch all youtube_videos rows ──
    let query = supabase.from('youtube_videos').select('id, state_key, thumbnail_url, video_url');
    if (singleState) query = query.eq('state_key', singleState);
    const { data: rows, error } = await query.order('state_key');

    if (error) {
        console.error(`❌ DB query failed: ${error.message}`);
        process.exit(1);
    }

    console.log(`  Found ${rows.length} states in DB\n`);

    let thumbSuccess = 0, thumbSkipped = 0;
    let vidSuccess = 0, vidSkipped = 0;

    for (const row of rows) {
        const stateKey = row.state_key;
        console.log(`  📦 ${stateKey}`);

        // ── Upload thumbnail ──
        if (!VIDEOS_ONLY) {
            const thumbFile = findFile(THUMBNAILS_DIR, stateKey, ['.png', '.jpg', '.jpeg', '.webp']);
            if (thumbFile) {
                if (row.thumbnail_url) {
                    console.log(`     🖼️  Thumbnail already uploaded`);
                    thumbSkipped++;
                } else if (DRY_RUN) {
                    console.log(`     🖼️  [DRY] Would upload ${path.basename(thumbFile)}`);
                    thumbSuccess++;
                } else {
                    const ext = path.extname(thumbFile);
                    const storagePath = `${stateKey}${ext}`;
                    const fileBuffer = fs.readFileSync(thumbFile);

                    const { error: uploadErr } = await supabase.storage
                        .from(THUMB_BUCKET)
                        .upload(storagePath, fileBuffer, {
                            contentType: getMimeType(ext),
                            upsert: true,
                        });

                    if (uploadErr) {
                        console.log(`     ❌ Thumb upload failed: ${uploadErr.message}`);
                    } else {
                        const { data: urlData } = supabase.storage.from(THUMB_BUCKET).getPublicUrl(storagePath);
                        const publicUrl = urlData.publicUrl;

                        await supabase
                            .from('youtube_videos')
                            .update({ thumbnail_url: publicUrl, updated_at: new Date().toISOString() })
                            .eq('id', row.id);

                        console.log(`     🖼️  ✅ Thumbnail uploaded`);
                        thumbSuccess++;
                    }
                }
            } else {
                console.log(`     🖼️  ⚠️  No thumbnail file found`);
                thumbSkipped++;
            }
        }

        // ── Upload video ──
        if (!THUMBS_ONLY) {
            const vidFile = findFile(VIDEOS_DIR, stateKey, ['.mp4', '.webm', '.mov', '.avi', '.mkv']);
            if (vidFile) {
                if (row.video_url) {
                    console.log(`     📹 Video already uploaded`);
                    vidSkipped++;
                } else if (DRY_RUN) {
                    console.log(`     📹 [DRY] Would upload ${path.basename(vidFile)}`);
                    vidSuccess++;
                } else {
                    const ext = path.extname(vidFile);
                    const storagePath = `${stateKey}${ext}`;
                    const fileBuffer = fs.readFileSync(vidFile);

                    console.log(`     📹 Uploading ${path.basename(vidFile)} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);

                    const { error: uploadErr } = await supabase.storage
                        .from(VIDEO_BUCKET)
                        .upload(storagePath, fileBuffer, {
                            contentType: getMimeType(ext),
                            upsert: true,
                        });

                    if (uploadErr) {
                        console.log(`     ❌ Video upload failed: ${uploadErr.message}`);
                    } else {
                        const { data: urlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath);
                        const publicUrl = urlData.publicUrl;

                        await supabase
                            .from('youtube_videos')
                            .update({ video_url: publicUrl, updated_at: new Date().toISOString() })
                            .eq('id', row.id);

                        console.log(`     📹 ✅ Video uploaded`);
                        vidSuccess++;
                    }
                }
            } else {
                console.log(`     📹 ⚠️  No video file found`);
                vidSkipped++;
            }
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    if (!VIDEOS_ONLY) console.log(`  🖼️  Thumbnails: ${thumbSuccess} uploaded, ${thumbSkipped} skipped`);
    if (!THUMBS_ONLY) console.log(`  📹 Videos:     ${vidSuccess} uploaded, ${vidSkipped} skipped`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
