#!/usr/bin/env node
/**
 * remove-watermark.mjs
 * ────────────────────────────────────────────────────────────────────
 * Batch-removes the NotebookLM watermark from videos and replaces
 * it with the PMHNP Hiring branding: logo icon + "pmhnphiring.com".
 *
 * Uses FFmpeg's delogo filter to remove the original watermark,
 * then overlays public/logo.png (icon only) + drawtext for the URL.
 *
 * Usage:
 *   node scripts/remove-watermark.mjs --folder ./videos
 *   node scripts/remove-watermark.mjs --folder ./videos --dry-run
 *   node scripts/remove-watermark.mjs --file ./videos/alabama.mp4
 *   node scripts/remove-watermark.mjs --folder ./videos --replace
 *   node scripts/remove-watermark.mjs --folder ./videos --no-brand
 *
 * Requires: FFmpeg installed and on PATH.
 * ────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REPLACE = args.includes('--replace');
const NO_BRAND = args.includes('--no-brand');
const folderArg = args.find((_, i) => args[i - 1] === '--folder');
const fileArg = args.find((_, i) => args[i - 1] === '--file');

if (!folderArg && !fileArg) {
    console.error('❌ Usage:');
    console.error('   node scripts/remove-watermark.mjs --folder ./videos');
    console.error('   node scripts/remove-watermark.mjs --file ./videos/alabama.mp4');
    console.error('');
    console.error('   Flags:');
    console.error('     --dry-run    Preview only');
    console.error('     --replace    Replace originals (default: save as *_clean.mp4)');
    console.error("     --no-brand   Only remove watermark, don't add PMHNP branding");
    process.exit(1);
}

// ─── Paths ──────────────────────────────────────────────────────────
const LOGO_ICON_PATH = path.join(ROOT, 'public', 'logo.png');
// ─── Watermark removal config ───────────────────────────────────────

// CROP approach: cut the bottom 40px of the frame to completely remove
// the NotebookLM watermark, then scale back to 1280x720.
// This permanently removes the watermark — no overlay tricks.
const CROP_HEIGHT = 60; // pixels to crop from bottom
const ORIG_W = 1280;
const ORIG_H = 720;
const CROP_H = ORIG_H - CROP_HEIGHT; // 680

// PMHNP branding config (placed in bottom-right of the clean cropped frame)
const ICON_SCALE = 24;          // icon width in pixels
const BRAND_TEXT = 'pmhnphiring.com';
const FONT_SIZE = 13;
const TEXT_OPACITY = 0.90;
const ICON_X = 1095;            // icon x position
const ICON_Y = 694;             // icon y position
const TEXT_X = 1123;            // text x position (after icon)
const TEXT_Y = 698;             // text y position

// ─── Check FFmpeg ───────────────────────────────────────────────────
try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
} catch {
    console.error('❌ FFmpeg not found. Install it: https://ffmpeg.org/download.html');
    process.exit(1);
}

// ─── Build FFmpeg filter ────────────────────────────────────────────

function buildFilterComplex(hasBranding) {
    if (!hasBranding) {
        // Just crop + scale (no branding)
        return {
            isComplex: false,
            filter: `crop=${ORIG_W}:${CROP_H}:0:0,scale=${ORIG_W}:${ORIG_H}`,
        };
    }

    // Build filter_complex: crop → scale → icon overlay → drawtext
    const filter =
        `[0:v]crop=${ORIG_W}:${CROP_H}:0:0,scale=${ORIG_W}:${ORIG_H}[clean];` +
        `[1:v]scale=${ICON_SCALE}:-1,format=rgba,colorchannelmixer=aa=${TEXT_OPACITY}[icon];` +
        `[clean][icon]overlay=${ICON_X}:${ICON_Y}[branded];` +
        `[branded]drawtext=text=${BRAND_TEXT}:fontsize=${FONT_SIZE}:fontcolor=white@${TEXT_OPACITY}:x=${TEXT_X}:y=${TEXT_Y}:font=Arial`;

    return { isComplex: true, filter };
}

// ─── Detect the last silence (NotebookLM outro) ────────────────────

function detectLastSilence(inputPath) {
    return new Promise((resolve) => {
        // Get total duration first
        const durStr = execSync(
            `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputPath}"`
        ).toString().trim();
        const totalDuration = parseFloat(durStr);

        const proc = spawn('ffmpeg', [
            '-i', inputPath,
            '-af', 'silencedetect=noise=-30dB:d=0.5',
            '-f', 'null', '-',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', () => {
            // Find all silence_start and silence_end pairs
            const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)];
            const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)];

            if (starts.length === 0) {
                resolve(null);
                return;
            }

            const lastStart = parseFloat(starts[starts.length - 1][1]);

            // Check if the last silence extends to the end of the video
            // (either no silence_end after it, or silence_end is within 1s of total duration)
            const lastEnd = ends.length >= starts.length
                ? parseFloat(ends[ends.length - 1][1])
                : totalDuration;

            const extendsToEnd = Math.abs(lastEnd - totalDuration) < 1.0;
            const silenceDuration = lastEnd - lastStart;

            if (extendsToEnd && silenceDuration > 0.5 && silenceDuration < 5.0) {
                resolve(lastStart);
            } else {
                resolve(null); // not a final outro silence
            }
        });
    });
}

// ─── Process a single video ─────────────────────────────────────────

function processVideo(inputPath) {
    return new Promise(async (resolve, reject) => {
        const ext = path.extname(inputPath);
        const base = path.basename(inputPath, ext);
        const dir = path.dirname(inputPath);

        const outputPath = REPLACE
            ? path.join(dir, `${base}_tmp${ext}`)
            : path.join(dir, `${base}_clean${ext}`);

        const hasBranding = !NO_BRAND && fs.existsSync(LOGO_ICON_PATH);
        const { isComplex, filter } = buildFilterComplex(hasBranding);

        // Detect where the silent NotebookLM outro starts
        const trimTo = await detectLastSilence(inputPath);
        const trimArgs = trimTo ? ['-t', String(trimTo)] : [];
        if (trimTo) {
            const totalDur = parseFloat(execSync(
                `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputPath}"`
            ).toString().trim());
            console.log(`    ✂️  Trimming outro: ${(totalDur - trimTo).toFixed(1)}s silent ending removed`);
        }

        let ffmpegArgs;

        if (isComplex) {
            ffmpegArgs = [
                '-i', inputPath,
                '-i', LOGO_ICON_PATH,
                '-filter_complex', filter,
                ...trimArgs,
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                '-c:a', 'copy',
                outputPath, '-y',
            ];
        } else {
            ffmpegArgs = [
                '-i', inputPath,
                '-vf', filter,
                ...trimArgs,
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                '-c:a', 'copy',
                outputPath, '-y',
            ];
        }

        const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
                return;
            }

            if (REPLACE) {
                fs.unlinkSync(inputPath);
                fs.renameSync(outputPath, inputPath);
            }

            resolve(REPLACE ? inputPath : outputPath);
        });
    });
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🧹 NotebookLM Watermark → PMHNP Hiring Branding');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) console.log('  🔍 DRY RUN MODE\n');
    if (REPLACE) console.log('  ⚠️  REPLACE MODE — originals will be overwritten\n');

    if (NO_BRAND) {
        console.log('  🚫 No branding — only removing watermark\n');
    } else {
        console.log(`  🖼️  Icon: ${LOGO_ICON_PATH}`);
        console.log(`  📝 Text: ${BRAND_TEXT}\n`);
        if (!fs.existsSync(LOGO_ICON_PATH)) {
            console.log('  ⚠️  Icon not found — will only remove watermark\n');
        }
    }

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
            .filter(f => !f.includes('_clean') && !f.includes('_tmp'))
            .sort()
            .map(f => path.join(folder, f));
    }

    console.log(`  📊 Found ${files.length} video(s) to process\n`);

    let success = 0;
    let errors = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = path.basename(file);
        const size = (fs.statSync(file).size / (1024 * 1024)).toFixed(1);

        console.log(`  [${i + 1}/${files.length}] ${name} (${size} MB)`);

        if (DRY_RUN) {
            console.log(`    ✅ [DRY RUN] Would process\n`);
            success++;
            continue;
        }

        try {
            const outputPath = await processVideo(file);
            console.log(`    ✅ Saved: ${path.basename(outputPath)}\n`);
            success++;
        } catch (err) {
            console.error(`    ❌ Failed: ${err.message}\n`);
            errors++;
        }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Processed: ${success}  |  ❌ Errors: ${errors}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
