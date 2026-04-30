#!/usr/bin/env node
/**
 * One-shot migration: inject sendCronFailureAlert into every cron's
 * catch block so unhandled failures push to Discord instead of vanishing.
 * Idempotent — files already with sendCronFailureAlert are skipped.
 *
 * Usage: node scripts/rollout-cron-alerts.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DRY = process.argv.includes('--dry');
const CRON_DIR = 'app/api/cron';
const ALERT_IMPORT = "import { sendCronFailureAlert } from '@/lib/discord-notifier';";

function listCronRoutes() {
    const out = [];
    for (const name of readdirSync(CRON_DIR)) {
        const p = join(CRON_DIR, name, 'route.ts');
        try {
            if (statSync(p).isFile()) out.push({ name, path: p });
        } catch { /* not a route */ }
    }
    return out;
}

function transform(name, code) {
    let out = code;
    let changed = false;

    if (out.includes('sendCronFailureAlert')) return { out, changed: false };

    // Inject only into FUNCTION-LEVEL catches — i.e. catch blocks whose body
    // contains `return NextResponse.json(... { status: 5xx } ...)`. Inner
    // try/catch blocks for non-fatal sub-operations (e.g. inngest.send) are
    // skipped so we don't page on every non-fatal warning.
    //
    // Strategy: find each `} catch (...)` token, scan forward to its matching
    // `}`, check if the body returns a NextResponse with a 5xx status, and
    // inject only when it does.
    const lines = out.split('\n');
    const catchOpenRe = /\}\s*catch\s*\(\s*(\w+)\b[^)]*\)\s*\{/;

    for (let i = 0; i < lines.length; i++) {
        const m = catchOpenRe.exec(lines[i]);
        if (!m) continue;
        const errName = m[1];

        // Find the closing `}` of this catch block by balancing braces.
        // Critical: start counting only from the FIRST `{` AFTER the catch
        // keyword (i.e. the catch block's opener). The `}` that closes the
        // preceding try block must NOT count.
        const stripNonCode = (s) =>
            s.replace(/\$\{[^}]*\}/g, '').replace(/'(?:\\.|[^'\\])*'/g, '""')
             .replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/`(?:\\.|[^`\\])*`/g, '""');
        let depth = 0;
        let started = false;
        let endLine = -1;
        // Find the offset of the catch's opening brace within line i.
        const catchOpenIdx = lines[i].indexOf('{', m.index);
        if (catchOpenIdx === -1) continue;
        for (let j = i; j < lines.length; j++) {
            const cleaned = stripNonCode(lines[j]);
            const startCol = j === i ? catchOpenIdx : 0;
            for (let k = startCol; k < cleaned.length; k++) {
                const ch = cleaned[k];
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}') { depth--; if (started && depth === 0) { endLine = j; break; } }
            }
            if (endLine !== -1) break;
        }
        if (endLine === -1) continue;

        // Check if body returns a 5xx NextResponse. Multiline-tolerant —
        // some crons split the json() call across several lines.
        const body = lines.slice(i, endLine + 1).join('\n');
        const isFunctionLevel = /return\s+NextResponse\.json\([\s\S]*?status\s*:\s*5\d\d/.test(body);
        if (!isFunctionLevel) continue;

        // Inject as a new line after the catch open.
        const indent = (lines[i].match(/^\s*/) || [''])[0] + '    ';
        lines.splice(i + 1, 0, `${indent}await sendCronFailureAlert('${name}', ${errName});`);
        changed = true;
        i++; // skip the inserted line
    }
    out = lines.join('\n');

    if (changed && !out.includes(ALERT_IMPORT)) {
        const importLines = [...out.matchAll(/^import .*$/gm)];
        if (importLines.length > 0) {
            const lastImport = importLines[importLines.length - 1];
            const insertAt = lastImport.index + lastImport[0].length;
            out = out.slice(0, insertAt) + '\n' + ALERT_IMPORT + out.slice(insertAt);
        } else {
            out = ALERT_IMPORT + '\n' + out;
        }
    }

    return { out, changed };
}

function main() {
    const routes = listCronRoutes();
    let updated = 0, skipped = 0, unchanged = 0;
    for (const r of routes) {
        const code = readFileSync(r.path, 'utf8');
        const { out, changed } = transform(r.name, code);
        if (code.includes('sendCronFailureAlert')) {
            console.log(`  · ${r.name.padEnd(35)} already-has-alert`);
            skipped++;
        } else if (changed) {
            if (!DRY) writeFileSync(r.path, out, 'utf8');
            console.log(`  ✓ ${r.name.padEnd(35)} updated`);
            updated++;
        } else {
            console.log(`  ⚠ ${r.name.padEnd(35)} no-catch-block`);
            unchanged++;
        }
    }
    console.log(`\n${updated} updated · ${skipped} already-had-alert · ${unchanged} no-catch-block`);
}

main();
