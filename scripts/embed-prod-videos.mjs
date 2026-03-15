#!/usr/bin/env node
/**
 * Embeds Supabase Storage video URLs into prod blog_posts table.
 * Reads video_url from dev youtube_videos → updates prod blog_posts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = 'c:/Users/daggu/PMHNP-Job-Board';

// Load .env
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

// Dev Supabase client (has youtube_videos table)
const devSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Prod DB client
const prodClient = new pg.Client({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📹 Embed Videos into Prod Blog Posts');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Get all video URLs from dev DB
    const { data: videos, error } = await devSb
        .from('youtube_videos')
        .select('state_key, state_name, video_url, thumbnail_url')
        .order('state_key');

    if (error) { console.error('Dev DB error:', error.message); process.exit(1); }
    console.log(`  📊 Found ${videos.length} videos in dev DB\n`);

    // 2. Connect to prod DB
    await prodClient.connect();
    console.log('  ✅ Connected to prod DB\n');

    // 3. Check if video_url column exists on blog_posts
    const colCheck = await prodClient.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'blog_posts' AND column_name = 'video_url'`
    );

    if (colCheck.rows.length === 0) {
        console.log('  📝 Adding video_url column to blog_posts...');
        await prodClient.query(`ALTER TABLE blog_posts ADD COLUMN video_url TEXT`);
        console.log('  ✅ Column added\n');
    } else {
        console.log('  ✅ video_url column already exists\n');
    }

    // 4. Update each blog post
    let updated = 0, notFound = 0;

    for (const video of videos) {
        function getBlogSlug(stateKey) {
    return `how-to-get-your-pmhnp-license-in-${stateKey}-2026-requirements-steps-salary`;
}
        const slug = getBlogSlug(video.state_key);

        const result = await prodClient.query(
            `UPDATE blog_posts SET video_url = $1, updated_at = NOW() 
             WHERE slug = $2 AND (video_url IS NULL OR video_url != $1)
             RETURNING id`,
            [video.video_url, slug]
        );

        if (result.rowCount > 0) {
            console.log(`  ✅ ${video.state_name} → ${slug}`);
            updated++;
        } else {
            // Check if post exists
            const exists = await prodClient.query(
                `SELECT id, video_url FROM blog_posts WHERE slug = $1`, [slug]
            );
            if (exists.rows.length === 0) {
                console.log(`  ❌ ${video.state_name} — blog not found: ${slug}`);
                notFound++;
            } else {
                console.log(`  ⏭️  ${video.state_name} — already set`);
            }
        }
    }

    await prodClient.end();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Updated: ${updated}  |  ❌ Not found: ${notFound}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
