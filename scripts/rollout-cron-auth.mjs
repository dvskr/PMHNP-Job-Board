#!/usr/bin/env node
/**
 * One-shot migration: replace inline CRON_SECRET checks with the shared
 * verifyCronOrAdmin helper across all cron handlers. Idempotent — files
 * already migrated are left alone.
 *
 * Patterns recognized:
 *   A. Inline check with literal:
 *      const authHeader = (req|request).headers.get(
 *        'authorization' | 'Authorization');
 *      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
 *        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *      }
 *   B. Same with intermediate cronSecret variable + optional secret-not-configured guard.
 *
 * Replacement (single pattern for both):
 *      const authError = await verifyCronOrAdmin(req|request);
 *      if (authError) return authError;
 *
 * Usage: node scripts/rollout-cron-auth.mjs [--dry]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DRY = process.argv.includes('--dry');
const CRON_DIR = 'app/api/cron';
const HELPER_IMPORT = "import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';";
const SKIP = new Set(['check-dead-links', 'source-presence-unpublish']); // already migrated

function listCronRoutes() {
    const out = [];
    for (const name of readdirSync(CRON_DIR)) {
        if (SKIP.has(name)) continue;
        const p = join(CRON_DIR, name, 'route.ts');
        try {
            if (statSync(p).isFile()) out.push({ name, path: p });
        } catch { /* not a route */ }
    }
    return out;
}

function transform(code) {
    let out = code;
    let changed = false;

    // Skip if already migrated.
    if (out.includes('verifyCronOrAdmin')) return { out, changed: false };

    // Multi-step approach so we don't have to balance braces with regex.
    // Step 1: find a likely auth-check window (between the const authHeader
    // line and a return-Unauthorized line). Step 2: confirm the window
    // contains a CRON_SECRET reference. Step 3: extend the window to the
    // matching `}` of the enclosing `if`. Step 4: splice in the helper call.

    const lines = out.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const m = /const\s+authHeader\s*=\s*(\w+)\.headers\.get\(\s*['"][Aa]uthorization['"]\s*\)/.exec(line);
        if (!m) {
            result.push(line);
            i++;
            continue;
        }
        // Look ahead up to 12 lines for a CRON_SECRET-bearing if block.
        const windowEnd = Math.min(i + 12, lines.length);
        const windowText = lines.slice(i, windowEnd).join('\n');
        if (!windowText.includes('CRON_SECRET') && !windowText.includes('cronSecret')) {
            result.push(line);
            i++;
            continue;
        }
        // Find the start of the `if (authHeader !== ...)` line within the window.
        let ifStart = -1;
        for (let j = i + 1; j < windowEnd; j++) {
            if (/^\s*if\s*\(/.test(lines[j]) && /authHeader/.test(lines[j])) {
                ifStart = j;
                break;
            }
        }
        if (ifStart === -1) {
            result.push(line);
            i++;
            continue;
        }
        // Walk forward from ifStart, balancing braces, to find the closing `}`.
        // Strip template-literal `${...}` and string contents before counting,
        // otherwise template substitutions trip the balance back to 0 prematurely.
        const stripNonCodeBraces = (s) =>
            s
                .replace(/\$\{[^}]*\}/g, '')   // ${...} substitutions
                .replace(/'(?:\\.|[^'\\])*'/g, '""')  // 'string'
                .replace(/"(?:\\.|[^"\\])*"/g, '""')  // "string"
                .replace(/`(?:\\.|[^`\\])*`/g, '""'); // `template` (no remaining ${} after first pass)
        let depth = 0;
        let started = false;
        let ifEnd = -1;
        for (let j = ifStart; j < lines.length; j++) {
            const cleaned = stripNonCodeBraces(lines[j]);
            for (const ch of cleaned) {
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}') { depth--; if (started && depth === 0) { ifEnd = j; break; } }
            }
            if (ifEnd !== -1) break;
        }
        if (ifEnd === -1) {
            result.push(line);
            i++;
            continue;
        }
        // Look for an optional preceding "if (!cronSecret) { ... }" guard
        // and an optional "const cronSecret = ..." line that bookends the auth check.
        // Replace the entire range [i .. ifEnd] with the helper call.
        const indent = (line.match(/^\s*/) || [''])[0];
        const reqName = m[1];
        result.push(`${indent}const authError = await verifyCronOrAdmin(${reqName});`);
        result.push(`${indent}if (authError) return authError;`);
        i = ifEnd + 1;
        changed = true;
    }
    out = result.join('\n');

    // Add the import if we changed something and it's not already there.
    if (changed && !out.includes('verify-cron-or-admin')) {
        // Find the last existing import line and insert after it.
        const importLines = [...out.matchAll(/^import .*$/gm)];
        if (importLines.length > 0) {
            const lastImport = importLines[importLines.length - 1];
            const insertAt = lastImport.index + lastImport[0].length;
            out = out.slice(0, insertAt) + '\n' + HELPER_IMPORT + out.slice(insertAt);
        } else {
            out = HELPER_IMPORT + '\n' + out;
        }
    }

    return { out, changed };
}

function main() {
    const routes = listCronRoutes();
    const results = [];
    for (const r of routes) {
        const code = readFileSync(r.path, 'utf8');
        const { out, changed } = transform(code);
        if (changed) {
            if (!DRY) writeFileSync(r.path, out, 'utf8');
            results.push({ name: r.name, status: 'updated' });
        } else {
            const reason = code.includes('verifyCronOrAdmin')
                ? 'already-migrated'
                : 'pattern-not-recognized';
            results.push({ name: r.name, status: reason });
        }
    }

    console.log(DRY ? '🔍 DRY-RUN' : '🟢 APPLY');
    for (const r of results) {
        const tag = r.status === 'updated' ? '✓' : (r.status === 'already-migrated' ? '·' : '⚠');
        console.log(`  ${tag} ${r.name.padEnd(35)} ${r.status}`);
    }

    const updated = results.filter((r) => r.status === 'updated').length;
    const unrecognized = results.filter((r) => r.status === 'pattern-not-recognized').length;
    console.log(`\n${updated} updated, ${unrecognized} need manual review.`);
}

main();
