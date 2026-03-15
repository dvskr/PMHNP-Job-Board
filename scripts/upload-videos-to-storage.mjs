#!/usr/bin/env node
/**
 * upload-videos-to-storage.mjs
 * ────────────────────────────────────────────────────────────────────
 * Batch-uploads local video files to Supabase Storage and updates
 * the youtube_videos table with the public URL.
 *
 * Expected file naming convention (any of these work):
 *   alabama.mp4, alaska.mp4, new-york.mp4, ...
 *   Alabama.mp4, New York.mp4, ...
 *   pmhnp-license-alabama.mp4, ...
 *
 * The script normalizes the filename to match the state_key in the DB.
 *
 * Usage:
 *   node scripts/upload-videos-to-storage.mjs --folder ./videos
 *   node scripts/upload-videos-to-storage.mjs --folder ./videos --dry-run
 *   node scripts/upload-videos-to-storage.mjs --folder ./videos --state alabama
 *   node scripts/upload-videos-to-storage.mjs --folder ./videos --bucket license-videos
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
const folderArg = args.find((_, i) => args[i - 1] === '--folder');
const singleState = args.find((_, i) => args[i - 1] === '--state');
const bucketArg = args.find((_, i) => args[i - 1] === '--bucket') || 'videos';

if (!folderArg) {
    console.error('❌ Usage: node scripts/upload-videos-to-storage.mjs --folder <path-to-videos>');
    console.error('   Example: node scripts/upload-videos-to-storage.mjs --folder ./license-videos');
    process.exit(1);
}

const VIDEOS_FOLDER = path.resolve(folderArg);

// ─── State key normalization ────────────────────────────────────────

const VALID_STATE_KEYS = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
    'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
    'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
    'new-hampshire', 'new-jersey', 'new-mexico', 'new-york',
    'north-carolina', 'north-dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode-island', 'south-carolina', 'south-dakota',
    'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
    'west-virginia', 'wisconsin', 'wyoming',
];

/**
 * Normalize a filename to a state_key.
 * Handles: "Alabama.mp4", "new york.mp4", "new-york.mp4",
 *          "pmhnp-license-alabama.mp4", "alabama.mp4"
 */
function filenameToStateKey(filename) {
    let name = path.basename(filename, path.extname(filename));

    // Strip common prefixes
    name = name.replace(/^pmhnp[-_]licensing[-_]guide[-_]/i, '');
    name = name.replace(/^pmhnp-license-/i, '');
    name = name.replace(/^how-to-get-your-pmhnp-license-in-/i, '');
    name = name.replace(/-2026.*$/i, '');

    // Normalize: lowercase, underscores/spaces to dashes
    name = name.toLowerCase().trim().replace(/[\s_]+/g, '-');

    // Validate
    if (VALID_STATE_KEYS.includes(name)) return name;

    // Fuzzy: try without dashes vs with
    const withDashes = name.replace(/_/g, '-');
    if (VALID_STATE_KEYS.includes(withDashes)) return withDashes;

    return null;
}

function getMimeType(ext) {
    const map = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
    };
    return map[ext.toLowerCase()] || 'video/mp4';
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ⬆️  Video Uploader → Supabase Storage');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE — no uploads\n');

    console.log(`  📁 Folder: ${VIDEOS_FOLDER}`);
    console.log(`  🪣 Bucket: ${bucketArg}\n`);

    // Validate folder
    if (!fs.existsSync(VIDEOS_FOLDER)) {
        console.error(`❌ Folder not found: ${VIDEOS_FOLDER}`);
        process.exit(1);
    }

    // Read video files
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    const allFiles = fs.readdirSync(VIDEOS_FOLDER)
        .filter(f => videoExts.includes(path.extname(f).toLowerCase()))
        .sort();

    console.log(`  📊 Found ${allFiles.length} video files\n`);

    if (allFiles.length === 0) {
        console.log('  No video files found. Supported formats: .mp4, .webm, .mov, .avi, .mkv');
        process.exit(0);
    }

    // Build file → state_key mapping
    const fileMappings = [];
    const unmapped = [];

    for (const file of allFiles) {
        const stateKey = filenameToStateKey(file);
        if (stateKey) {
            if (singleState && stateKey !== singleState) continue;
            fileMappings.push({ file, stateKey });
        } else {
            unmapped.push(file);
        }
    }

    if (unmapped.length > 0) {
        console.log(`  ⚠️  Could not map ${unmapped.length} file(s):`);
        unmapped.forEach(f => console.log(`     - ${f}`));
        console.log();
    }

    console.log(`  ✅ Mapped ${fileMappings.length} video(s) to states\n`);

    if (fileMappings.length === 0) {
        console.log('  Nothing to upload.');
        process.exit(0);
    }

    // Connect to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let uploaded = 0;
    let errors = 0;

    for (const { file, stateKey } of fileMappings) {
        const filePath = path.join(VIDEOS_FOLDER, file);
        const ext = path.extname(file).toLowerCase();
        const storagePath = `license-videos/${stateKey}${ext}`;
        const fileSize = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);

        console.log(`  [${stateKey}]`);
        console.log(`    📄 File: ${file} (${fileSize} MB)`);
        console.log(`    📦 Storage: ${bucketArg}/${storagePath}`);

        if (DRY_RUN) {
            console.log(`    ✅ [DRY RUN] Would upload & update DB\n`);
            uploaded++;
            continue;
        }

        try {
            // Upload to Supabase Storage
            const fileBuffer = fs.readFileSync(filePath);
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucketArg)
                .upload(storagePath, fileBuffer, {
                    contentType: getMimeType(ext),
                    upsert: true,
                });

            if (uploadError) {
                throw new Error(`Storage upload failed: ${uploadError.message}`);
            }

            console.log(`    ✅ Uploaded to storage`);

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(bucketArg)
                .getPublicUrl(storagePath);

            const publicUrl = urlData.publicUrl;
            console.log(`    🔗 URL: ${publicUrl}`);

            // Update youtube_videos table
            const { error: dbError } = await supabase
                .from('youtube_videos')
                .update({
                    video_url: publicUrl,
                    updated_at: new Date().toISOString(),
                })
                .eq('state_key', stateKey);

            if (dbError) {
                throw new Error(`DB update failed: ${dbError.message}`);
            }

            console.log(`    ✅ DB updated\n`);
            uploaded++;
        } catch (err) {
            console.error(`    ❌ Error: ${err.message}\n`);
            errors++;
        }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Uploaded: ${uploaded}  |  ❌ Errors: ${errors}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
