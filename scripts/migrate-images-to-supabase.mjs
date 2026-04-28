#!/usr/bin/env node
/**
 * migrate-images-to-supabase.mjs
 * 
 * 1. Converts PNG/JPG images → WebP using Sharp
 * 2. Uploads them to Supabase Storage bucket "site-assets"
 * 3. Outputs a manifest JSON for codebase path rewriting
 *
 * Usage:
 *   node scripts/migrate-images-to-supabase.mjs
 *   node scripts/migrate-images-to-supabase.mjs --dry-run   (preview only)
 *   node scripts/migrate-images-to-supabase.mjs --folder=states  (single folder)
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load env — support --prod flag for production Supabase
const USE_PROD = process.argv.includes('--prod');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
if (USE_PROD) {
  dotenv.config({ path: '.env.prod', override: true });
}

const SUPABASE_URL = USE_PROD
  ? process.env.PROD_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = USE_PROD
  ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'site-assets';
const PUBLIC_DIR = path.resolve('public');
const WEBP_QUALITY = 80;
const DRY_RUN = process.argv.includes('--dry-run');
const FOLDER_FILTER = process.argv.find(a => a.startsWith('--folder='))?.split('=')[1];

// Files/folders to skip (favicons, SVGs, tiny icons)
const SKIP_FILES = new Set([
  'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png',
  'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png',
  'icon-192x192.png', 'logo.png', 'pmhnp_logo.png',
]);
const SKIP_EXTENSIONS = new Set(['.svg', '.ico', '.woff2', '.txt', '.xml', '.json', '.webmanifest']);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(`❌ Missing Supabase credentials for ${USE_PROD ? 'PROD' : 'DEV'}`);
  console.error(USE_PROD
    ? '   Need PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY in .env.prod'
    : '   Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Collect all image files ──
function collectImages(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    const full = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip hidden dirs, node_modules, .well-known
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      files.push(...collectImages(full, rel));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;
      if (SKIP_FILES.has(entry.name)) continue;
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
      
      files.push({ fullPath: full, relativePath: rel });
    }
  }
  return files;
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  
  if (!exists) {
    console.log(`📦 Creating bucket "${BUCKET}"...`);
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml'],
    });
    if (error) {
      console.error('❌ Failed to create bucket:', error.message);
      process.exit(1);
    }
    console.log(`✅ Bucket "${BUCKET}" created`);
  } else {
    console.log(`✅ Bucket "${BUCKET}" already exists`);
  }
}

async function convertAndUpload(file, manifest) {
  const ext = path.extname(file.relativePath).toLowerCase();
  
  // Build the storage path: images/states/california.webp
  const storagePath = file.relativePath
    .replace(/\\/g, '/')
    .replace(/\.(png|jpg|jpeg)$/i, '.webp');
  
  // If already WebP, just upload as-is
  const isAlreadyWebp = ext === '.webp';
  
  try {
    let buffer;
    let originalSize = fs.statSync(file.fullPath).size;
    
    if (isAlreadyWebp) {
      buffer = fs.readFileSync(file.fullPath);
    } else {
      buffer = await sharp(file.fullPath)
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer();
    }
    
    const savings = ((1 - buffer.length / originalSize) * 100).toFixed(1);
    const oldKB = (originalSize / 1024).toFixed(0);
    const newKB = (buffer.length / 1024).toFixed(0);
    
    if (DRY_RUN) {
      console.log(`  🔄 ${file.relativePath} → ${storagePath}  (${oldKB}KB → ${newKB}KB, -${savings}%)`);
    } else {
      // Upload to Supabase
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: 'image/webp',
          upsert: true,
          cacheControl: '31536000', // 1 year cache
        });
      
      if (error) {
        console.error(`  ❌ ${storagePath}: ${error.message}`);
        return;
      }
      
      console.log(`  ✅ ${storagePath}  (${oldKB}KB → ${newKB}KB, -${savings}%)`);
    }
    
    // Build public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
    
    // Map: /images/states/california.png → https://xxx.supabase.co/.../images/states/california.webp
    const oldPublicPath = '/' + file.relativePath.replace(/\\/g, '/');
    manifest[oldPublicPath] = publicUrl;
    
  } catch (err) {
    console.error(`  ❌ ${file.relativePath}: ${err.message}`);
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  🖼️  Image Migration: PNG → WebP + Supabase CDN');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? '🏜️ DRY RUN' : '🚀 LIVE UPLOAD'}`);
  console.log(`  Target: ${USE_PROD ? '🔴 PRODUCTION' : '🟢 DEV'} (${SUPABASE_URL})`);
  console.log(`  Bucket: ${BUCKET}`);
  console.log(`  WebP Quality: ${WEBP_QUALITY}`);
  console.log('');
  
  // Ensure bucket exists
  if (!DRY_RUN) {
    await ensureBucket();
  }
  
  // Collect images from public/images/
  const imagesDir = path.join(PUBLIC_DIR, 'images');
  let allFiles = [];
  
  if (FOLDER_FILTER) {
    const targetDir = path.join(imagesDir, FOLDER_FILTER);
    if (fs.existsSync(targetDir)) {
      allFiles = collectImages(targetDir, `images/${FOLDER_FILTER}`);
    } else {
      console.error(`❌ Folder not found: ${targetDir}`);
      process.exit(1);
    }
  } else {
    // All images in public/images/
    allFiles = collectImages(imagesDir, 'images');
    
    // Also grab root-level hero images
    const rootImages = ['hero-nurses.png', 'hero-1.png', 'hero-enterprise.png', 'og-image.png', 'test.png']
      .filter(name => fs.existsSync(path.join(PUBLIC_DIR, name)))
      .map(name => ({
        fullPath: path.join(PUBLIC_DIR, name),
        relativePath: name,
      }));
    
    allFiles.push(...rootImages);
  }
  
  console.log(`  Found ${allFiles.length} images to process`);
  console.log('');
  
  const manifest = {};
  let processed = 0;
  
  // Process in batches of 5 for concurrency
  const BATCH_SIZE = 5;
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(f => convertAndUpload(f, manifest)));
    processed += batch.length;
    
    if (processed % 50 === 0) {
      console.log(`\n  ⏳ Progress: ${processed}/${allFiles.length}\n`);
    }
  }
  
  // Save manifest
  const manifestPath = path.resolve('scripts/image-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✅ Done! ${Object.keys(manifest).length} images processed`);
  console.log(`  📋 Manifest saved: scripts/image-manifest.json`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Run: node scripts/rewrite-image-paths.mjs');
  console.log('    2. Test the site');
  console.log('    3. Delete public/images/ after confirming');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
