/**
 * Preview script — generates FB caption + Instagram carousel images locally.
 * Saves images to /tmp/social-preview/ for inspection.
 *
 * Usage: npx tsx preview-social-post.ts
 */

import 'dotenv/config';
import { fetchTopJobsForSocial, buildFacebookCaption, buildInstagramCaption, generateCarouselImages } from './lib/social-post-generator';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
    console.log('🔍 Fetching top jobs from DB...\n');
    const jobs = await fetchTopJobsForSocial();

    if (jobs.length === 0) {
        console.error('No jobs found!');
        process.exit(1);
    }

    console.log(`Found ${jobs.length} jobs\n`);

    // ── Facebook caption ──
    const fbCaption = buildFacebookCaption(jobs);
    console.log('═'.repeat(60));
    console.log('📘  FACEBOOK CAPTION');
    console.log('═'.repeat(60));
    console.log(fbCaption);
    console.log();

    // ── Instagram caption ──
    const igCaption = buildInstagramCaption(jobs);
    console.log('═'.repeat(60));
    console.log('📸  INSTAGRAM CAPTION');
    console.log('═'.repeat(60));
    console.log(igCaption);
    console.log();

    // ── Generate carousel images ──
    console.log('🎨 Generating carousel images...');
    const images = await generateCarouselImages(jobs);

    const outDir = join(__dirname, 'tmp', 'social-preview');
    mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < images.length; i++) {
        const path = join(outDir, `slide-${i + 1}.png`);
        writeFileSync(path, images[i]);
        console.log(`  ✅ Saved ${path}`);
    }

    console.log(`\n🎉 Done! Preview images saved to: ${outDir}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
