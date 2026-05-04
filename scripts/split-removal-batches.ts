/**
 * Split gsc-removal-safe.txt into 4 daily batches of ≤1,000 URLs each
 * (matches GSC's per-property daily quota). Ordered so the most-impactful
 * categories ship first:
 *
 *   Day 1: "Not found (404)" — biggest GSC error category
 *   Day 2: "Server error (5xx)"
 *   Day 3: "Soft 404"
 *   Day 4: "Indexed, though blocked by robots.txt" + spillover
 *
 * Run after export-removal-list.ts:
 *   npx tsx scripts/split-removal-batches.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GSC_DIR = join(process.cwd(), 'GSC ISSUES');
const DAILY_QUOTA = 1000;

function parseTableCsv(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const urls: string[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        let url: string;
        if (line.startsWith('"')) {
            const closeIdx = line.indexOf('"', 1);
            if (closeIdx < 0) continue;
            url = line.slice(1, closeIdx);
        } else {
            const commaIdx = line.indexOf(',');
            url = commaIdx < 0 ? line : line.slice(0, commaIdx);
        }
        url = url.trim();
        if (url.startsWith('http')) urls.push(url);
    }
    return urls;
}

function inferIssue(metadata: string): string {
    const m = metadata.match(/Issue,(.+)/i);
    if (!m) return '';
    return m[1].trim().replace(/^"|"$/g, '').toLowerCase();
}

function categoryOf(issue: string): string {
    if (issue.includes('not found')) return '1-not-found';
    if (issue.includes('server error')) return '2-server-error';
    if (issue.includes('soft 404')) return '3-soft-404';
    if (issue.includes('blocked by robots.txt') && issue.includes('indexed')) return '4-indexed-blocked';
    return '5-other';
}

function loadSafeWithCategory(): { url: string; category: string }[] {
    // Re-read the SAFE list and tag each URL with its source category.
    const safePath = resolve(process.cwd(), 'gsc-removal-safe.txt');
    if (!existsSync(safePath)) {
        console.error(`gsc-removal-safe.txt not found. Run scripts/export-removal-list.ts first.`);
        process.exit(1);
    }
    const safeUrls = new Set(readFileSync(safePath, 'utf8').split(/\r?\n/).filter(Boolean));

    // For each URL, find which GSC drilldown labeled it.
    const urlCategory = new Map<string, string>();
    const folders = readdirSync(GSC_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    for (const folder of folders) {
        const tablePath = join(GSC_DIR, folder, 'Table.csv');
        const metaPath = join(GSC_DIR, folder, 'Metadata.csv');
        if (!existsSync(tablePath) || !existsSync(metaPath)) continue;
        const issue = inferIssue(readFileSync(metaPath, 'utf8'));
        const cat = categoryOf(issue);
        for (const url of parseTableCsv(readFileSync(tablePath, 'utf8'))) {
            if (!safeUrls.has(url)) continue;
            // Prefer the highest-priority category if URL appears in multiple drilldowns.
            const existing = urlCategory.get(url);
            if (!existing || cat < existing) urlCategory.set(url, cat);
        }
    }

    return [...safeUrls].map((url) => ({
        url,
        category: urlCategory.get(url) ?? '5-other',
    }));
}

function main() {
    const tagged = loadSafeWithCategory();
    // Sort by category (1-not-found first, then 2-server-error, etc.)
    tagged.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.url.localeCompare(b.url);
    });

    console.log(`Total SAFE URLs: ${tagged.length}`);
    const byCategory = new Map<string, number>();
    for (const t of tagged) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
    for (const [c, n] of [...byCategory.entries()].sort()) {
        console.log(`  ${c}: ${n}`);
    }

    // Split into N batches of ≤ DAILY_QUOTA each.
    const numBatches = Math.ceil(tagged.length / DAILY_QUOTA);
    const batchSize = Math.ceil(tagged.length / numBatches);
    console.log(`\nSplitting into ${numBatches} batches of ~${batchSize} URLs each.\n`);

    for (let i = 0; i < numBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, tagged.length);
        const batch = tagged.slice(start, end).map((t) => t.url);
        const path = resolve(process.cwd(), `gsc-removal-day${i + 1}.txt`);
        writeFileSync(path, batch.join('\n'), 'utf8');
        const cats = new Set(tagged.slice(start, end).map((t) => t.category));
        console.log(`  Day ${i + 1}: ${batch.length} URLs  (categories: ${[...cats].join(', ')})  →  ${path}`);
    }

    console.log(`\nWorkflow:`);
    console.log(`  Day 1: open gsc-removal-day1.txt, paste each URL into GSC Removals UI.`);
    console.log(`  Day 2-${numBatches}: same with the corresponding daily file.`);
    console.log(`  GSC quota: 1,000 URLs/property/day. Resets at midnight Pacific Time.`);
}

main();
