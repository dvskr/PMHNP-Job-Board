#!/usr/bin/env node
/**
 * rewrite-image-paths.mjs
 * 
 * Reads the manifest from migrate-images-to-supabase.mjs and rewrites
 * all image references in the codebase from local /images/... paths
 * to Supabase CDN URLs.
 *
 * Usage:
 *   node scripts/rewrite-image-paths.mjs
 *   node scripts/rewrite-image-paths.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const MANIFEST_PATH = path.resolve('scripts/image-manifest.json');

// Directories to scan for image references
const SCAN_DIRS = ['components', 'app', 'lib', 'pages'];
const SCAN_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.css', '.json', '.md', '.mdx']);

// Skip directories
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '_turbopack_recovery', 'public']);

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('❌ Manifest not found. Run migrate-images-to-supabase.mjs first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
console.log(`\n📋 Loaded manifest with ${Object.keys(manifest).length} path mappings\n`);

// Build regex patterns for replacement
// We need to match paths like:
//   /images/states/california.png  →  https://xxx.supabase.co/.../images/states/california.webp
//   /hero-nurses.png               →  https://xxx.supabase.co/.../hero-nurses.webp
//
// Also match template literal patterns like:
//   `/images/states/${state.slug}.png`  →  needs special handling

// Collect all files
function collectFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCAN_EXTENSIONS.has(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

function rewriteFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  let changes = [];
  
  // 1. Direct path replacements (exact matches)
  for (const [oldPath, newUrl] of Object.entries(manifest)) {
    // Match the path in quotes or backticks
    const escapedPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPath, 'g');
    
    if (regex.test(content)) {
      content = content.replace(regex, newUrl);
      changes.push(`  ${oldPath} → CDN`);
    }
  }
  
  // 2. Handle template literal patterns like `/images/states/${slug}.png`
  //    Convert to: `${SUPABASE_URL}/images/states/${slug}.webp`
  //    We detect the base URL from the manifest
  const sampleUrl = Object.values(manifest)[0];
  const baseUrl = sampleUrl?.match(/(https:\/\/[^/]+\/storage\/v1\/object\/public\/site-assets)/)?.[1];
  
  if (baseUrl) {
    // Pattern: /images/{folder}/${expr}.png → CDN URL with .webp
    const templateRegex = /\/images\/([a-z-]+)\/\$\{([^}]+)\}\.png/g;
    let match;
    while ((match = templateRegex.exec(content)) !== null) {
      const folder = match[1];
      const expr = match[2];
      const oldStr = match[0];
      const newStr = `${baseUrl}/images/${folder}/\${${expr}}.webp`;
      content = content.replace(oldStr, newStr);
      changes.push(`  Template: ${oldStr} → CDN`);
    }
    
    // Also handle root-level template patterns: /hero-nurses.png etc
    // These are less common so handle them explicitly
  }
  
  if (content !== originalContent) {
    if (DRY_RUN) {
      console.log(`📝 Would update: ${filePath}`);
      changes.forEach(c => console.log(c));
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      changes.forEach(c => console.log(c));
    }
    return changes.length;
  }
  return 0;
}

function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🔄 Rewriting Image Paths → Supabase CDN URLs');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? '🏜️ DRY RUN' : '🚀 LIVE REWRITE'}`);
  console.log('');
  
  const rootDir = path.resolve('.');
  let allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...collectFiles(path.join(rootDir, dir)));
  }
  
  console.log(`  Scanning ${allFiles.length} files...\n`);
  
  let totalChanges = 0;
  let filesChanged = 0;
  
  for (const file of allFiles) {
    const n = rewriteFile(file);
    if (n > 0) {
      totalChanges += n;
      filesChanged++;
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✅ ${totalChanges} replacements in ${filesChanged} files`);
  if (DRY_RUN) {
    console.log('  ℹ️  Run without --dry-run to apply changes');
  }
  console.log('═══════════════════════════════════════════════════');
}

main();
