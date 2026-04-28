/**
 * Upload all email assets from public/images/email/ to Supabase Storage
 * 
 * Usage:
 *   node scripts/upload-email-assets.js
 * 
 * Prerequisites:
 *   - PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY in .env.prod
 *   - The 'email-assets' bucket must exist in Supabase (public bucket)
 * 
 * This script will:
 *   1. Create the 'email-assets' bucket if it doesn't exist
 *   2. Upload all .png files from public/images/email/
 *   3. Skip files that already exist (unless --force flag is used)
 */

const fs = require('fs');
const path = require('path');

// Load env from .env.prod
const envPath = path.join(__dirname, '..', '.env.prod');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = envVars.PROD_SUPABASE_URL;
const SERVICE_ROLE_KEY = envVars.PROD_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'email-assets';
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'email');
const FORCE = process.argv.includes('--force');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing PROD_SUPABASE_URL or PROD_SUPABASE_SERVICE_ROLE_KEY in .env.prod');
  process.exit(1);
}

const storageUrl = `${SUPABASE_URL}/storage/v1`;
const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
};

async function createBucketIfNeeded() {
  // Check if bucket exists
  const res = await fetch(`${storageUrl}/bucket/${BUCKET}`, { headers });
  if (res.ok) {
    console.log(`✅ Bucket '${BUCKET}' exists`);
    return;
  }

  // Create public bucket
  console.log(`📦 Creating bucket '${BUCKET}'...`);
  const createRes = await fetch(`${storageUrl}/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 5242880, // 5MB
      allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    }),
  });

  if (createRes.ok) {
    console.log(`✅ Bucket '${BUCKET}' created (public)`);
  } else {
    const err = await createRes.text();
    console.error(`❌ Failed to create bucket: ${err}`);
    process.exit(1);
  }
}

async function uploadFile(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);
  
  const res = await fetch(`${storageUrl}/object/${BUCKET}/${fileName}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'image/png',
      'x-upsert': FORCE ? 'true' : 'false',
    },
    body: fileBuffer,
  });

  if (res.ok) {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
    return { success: true, url: publicUrl };
  } else {
    const err = await res.text();
    // If file already exists and not forcing, that's fine
    if (err.includes('already exists') || err.includes('Duplicate')) {
      return { success: true, skipped: true };
    }
    return { success: false, error: err };
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Email Assets → Supabase Storage Upload');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Source:  ${IMAGES_DIR}`);
  console.log(`  Target:  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
  console.log(`  Force:   ${FORCE ? 'YES (overwrite existing)' : 'NO (skip existing)'}`);
  console.log('');

  // 1. Ensure bucket exists
  await createBucketIfNeeded();

  // 2. Get all PNG files
  const files = fs.readdirSync(IMAGES_DIR).filter(f => 
    f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')
  );
  
  console.log(`\n📤 Uploading ${files.length} files...\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(IMAGES_DIR, file);
    const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
    
    process.stdout.write(`  ${file} (${sizeKB}KB) ... `);
    
    const result = await uploadFile(filePath, file);
    
    if (result.success && result.skipped) {
      console.log('⏭️  exists');
      skipped++;
    } else if (result.success) {
      console.log('✅ uploaded');
      uploaded++;
    } else {
      console.log(`❌ ${result.error}`);
      failed++;
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ✅ Uploaded: ${uploaded}`);
  console.log(`  ⏭️  Skipped:  ${skipped}`);
  console.log(`  ❌ Failed:   ${failed}`);
  console.log(`  📊 Total:    ${files.length}`);
  console.log('');
  
  if (uploaded > 0 || skipped > 0) {
    console.log('  🔗 Base URL for emails:');
    console.log(`     ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
    console.log('');
    console.log('  📋 Add to Vercel env vars:');
    console.log(`     EMAIL_ASSETS_URL=${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`);
  }
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
