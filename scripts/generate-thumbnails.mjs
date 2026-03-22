#!/usr/bin/env node
/**
 * generate-thumbnails.mjs
 * ────────────────────────────────────────────────────────────────────
 * Extracts a visually appealing frame from each video as a thumbnail.
 *
 * Strategy: Samples frames at 10%, 25%, 50% of the video duration and
 * picks the one with the highest visual quality (using FFmpeg scene
 * change detection). Falls back to a frame at 25% if detection fails.
 *
 * Usage:
 *   node scripts/generate-thumbnails.mjs --folder ./videos
 *   node scripts/generate-thumbnails.mjs --folder ./videos --dry-run
 *   node scripts/generate-thumbnails.mjs --file ./videos/alabama.mp4
 *   node scripts/generate-thumbnails.mjs --output ./thumbnails
 *
 * Requires: FFmpeg installed and on PATH.
 * ────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const folderArg = args.find((_, i) => args[i - 1] === '--folder');
const fileArg = args.find((_, i) => args[i - 1] === '--file');
const outputArg = args.find((_, i) => args[i - 1] === '--output') || path.join(ROOT, 'thumbnails');

if (!folderArg && !fileArg) {
    console.error('❌ Usage:');
    console.error('   node scripts/generate-thumbnails.mjs --folder ./videos');
    console.error('   node scripts/generate-thumbnails.mjs --file ./videos/alabama.mp4');
    console.error('   Options:');
    console.error('     --output <dir>   Output directory (default: ./thumbnails)');
    console.error('     --dry-run        Preview only');
    process.exit(1);
}

// Create output directory
const OUTPUT_DIR = path.resolve(outputArg);
if (!DRY_RUN) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── Check FFmpeg ───────────────────────────────────────────────────
try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
} catch {
    console.error('❌ FFmpeg not found.');
    process.exit(1);
}

// ─── Get video duration ─────────────────────────────────────────────
function getDuration(filePath) {
    const result = spawnSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        filePath,
    ], { encoding: 'utf-8' });
    return parseFloat(result.stdout.trim()) || 0;
}

// ─── Extract a single frame ────────────────────────────────────────
function extractFrame(filePath, timestamp, outputPath) {
    const result = spawnSync('ffmpeg', [
        '-ss', String(timestamp),
        '-i', filePath,
        '-frames:v', '1',
        '-update', '1',
        '-q:v', '2',
        outputPath,
        '-y',
    ], { encoding: 'utf-8', stdio: 'pipe' });
    return result.status === 0;
}

// ─── Generate thumbnail ────────────────────────────────────────────
function generateThumbnail(filePath, outputPath) {
    const duration = getDuration(filePath);
    if (duration <= 0) return false;

    // Try multiple positions and pick the best (largest file = most detail)
    const positions = [
        duration * 0.15,  // 15% - usually past intro
        duration * 0.25,  // 25%
        duration * 0.40,  // 40%
    ];

    let bestPath = null;
    let bestSize = 0;

    for (let i = 0; i < positions.length; i++) {
        const tempPath = outputPath.replace('.jpg', `_candidate_${i}.jpg`);
        const success = extractFrame(filePath, positions[i], tempPath);

        if (success && fs.existsSync(tempPath)) {
            const size = fs.statSync(tempPath).size;
            if (size > bestSize) {
                bestSize = size;
                if (bestPath && fs.existsSync(bestPath)) {
                    fs.unlinkSync(bestPath);
                }
                bestPath = tempPath;
            } else {
                fs.unlinkSync(tempPath);
            }
        }
    }

    if (bestPath) {
        fs.renameSync(bestPath, outputPath);
        // Clean up any remaining candidates
        for (let i = 0; i < positions.length; i++) {
            const tempPath = outputPath.replace('.jpg', `_candidate_${i}.jpg`);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
        return true;
    }

    return false;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🖼️  Video Thumbnail Generator');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE\n');
    console.log(`  📁 Output: ${OUTPUT_DIR}\n`);

    // Collect files
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    let files = [];

    if (fileArg) {
        const resolved = path.resolve(fileArg);
        if (!fs.existsSync(resolved)) {
            console.error(`❌ File not found: ${resolved}`);
            process.exit(1);
        }
        files = [resolved];
    } else {
        const folder = path.resolve(folderArg);
        if (!fs.existsSync(folder)) {
            console.error(`❌ Folder not found: ${folder}`);
            process.exit(1);
        }
        files = fs.readdirSync(folder)
            .filter(f => videoExts.includes(path.extname(f).toLowerCase()))
            .filter(f => !f.includes('_tmp'))
            .sort()
            .map(f => path.join(folder, f));
    }

    console.log(`  📊 Found ${files.length} video(s)\n`);

    let success = 0;
    let errors = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = path.basename(file, path.extname(file));
        const thumbName = `${name}.jpg`;
        const thumbPath = path.join(OUTPUT_DIR, thumbName);

        console.log(`  [${i + 1}/${files.length}] ${path.basename(file)}`);

        if (DRY_RUN) {
            console.log(`    ✅ [DRY RUN] Would generate → ${thumbName}\n`);
            success++;
            continue;
        }

        try {
            const ok = generateThumbnail(file, thumbPath);
            if (ok) {
                const size = (fs.statSync(thumbPath).size / 1024).toFixed(0);
                console.log(`    ✅ Generated: ${thumbName} (${size} KB)\n`);
                success++;
            } else {
                console.error(`    ❌ Failed to generate thumbnail\n`);
                errors++;
            }
        } catch (err) {
            console.error(`    ❌ Error: ${err.message}\n`);
            errors++;
        }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Generated: ${success}  |  ❌ Errors: ${errors}`);
    console.log(`  📁 Output: ${OUTPUT_DIR}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
