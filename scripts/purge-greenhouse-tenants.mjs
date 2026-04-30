#!/usr/bin/env node
/**
 * Trim GREENHOUSE_COMPANIES to only productive tenants based on the
 * audit report at .tmp_greenhouse_tenant_audit.json. Conservative:
 *   - KEEP every tenant that has added at least 1 job in the last 90d
 *   - KEEP a small monitoring whitelist (large brands likely to post again)
 *   - DROP everything else
 *
 * Usage:
 *   node scripts/audit-greenhouse-tenants.ts        # produce the report
 *   node scripts/purge-greenhouse-tenants.mjs --dry # preview
 *   node scripts/purge-greenhouse-tenants.mjs       # apply
 */
import { readFileSync, writeFileSync } from 'fs';

const DRY = process.argv.includes('--dry');
const REPORT_PATH = '.tmp_greenhouse_tenant_audit.json';
const SOURCE_FILE = 'lib/aggregators/greenhouse.ts';

// Brands to keep on watch even if they haven't added a PMHNP job recently.
// These have a track record OR are well-known mental-health employers we
// expect to start posting again. Cheap to keep.
const MONITORING_WHITELIST = new Set([
    'talkspace',
    'lifestancehealth',
    'lifestance',
    'modernhealth',
    'cerebral',
    'ayahealthcare',
    'amwell',
    'octave',
    'growtherapy',
    'springhealth66',
    'springhealth',
    'mantrahealth',
    'brightline',
    'twochairs',
    'ginger',
    'spring',
]);

function main() {
    const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
    const productive = new Set(report.topProductive.map((t) => t.slug));

    const code = readFileSync(SOURCE_FILE, 'utf8');
    const m = code.match(/(const GREENHOUSE_COMPANIES = \[)([\s\S]*?)(\];)/);
    if (!m) {
        console.error('Could not locate GREENHOUSE_COMPANIES in source file.');
        process.exit(1);
    }
    const before = m[1];
    const middle = m[2];
    const after = m[3];

    // Walk each existing line, decide keep or drop, preserve comments.
    const lines = middle.split('\n');
    const kept = [];
    const droppedSlugs = [];
    for (const line of lines) {
        const slugMatch = /^\s*'([a-z0-9_]+)'/.exec(line);
        if (!slugMatch) {
            // Non-slug line (comment, blank, etc.) — keep it.
            kept.push(line);
            continue;
        }
        const slug = slugMatch[1];
        if (productive.has(slug) || MONITORING_WHITELIST.has(slug)) {
            kept.push(line);
        } else {
            droppedSlugs.push(slug);
        }
    }

    // Re-tag the kept block with a header comment listing how the trim was done.
    const today = new Date().toISOString().slice(0, 10);
    const trimHeader = [
        '',
        `  // ── Trimmed ${today}: dropped ${droppedSlugs.length}/${droppedSlugs.length + kept.filter((l) => /^\\s*'/.test(l)).length} configured tenants`,
        `  // that had never added a PMHNP job. See scripts/audit-greenhouse-tenants.ts`,
        `  // and .tmp_greenhouse_tenant_audit.json for the source data.`,
        '',
    ].join('\n');

    const newMiddle = trimHeader + kept.join('\n');
    const newCode = code.replace(m[0], before + newMiddle + after);

    console.log(DRY ? '🔍 DRY-RUN' : '🟢 APPLY');
    console.log(`  Before: ${droppedSlugs.length + kept.filter((l) => /^\s*'/.test(l)).length} tenants configured`);
    console.log(`  After:  ${kept.filter((l) => /^\s*'/.test(l)).length} tenants kept`);
    console.log(`  Drop:   ${droppedSlugs.length} tenants`);

    if (!DRY) {
        writeFileSync(SOURCE_FILE, newCode, 'utf8');
        console.log(`\n  ✓ ${SOURCE_FILE} updated.`);
    } else {
        console.log(`\n  Re-run without --dry to apply.`);
    }
}

main();
