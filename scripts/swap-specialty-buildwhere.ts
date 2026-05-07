/**
 * Codemod: rewrite every specialty buildWhere in
 * lib/pseo/category-city-template.tsx to use `categoryTags: { has: '<slug>' }`.
 *
 * Strategy: brace-walk to find the precise end of each buildWhere arrow
 * function body, then replace it. Idempotent.
 */
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.join(process.cwd(), 'lib', 'pseo', 'category-city-template.tsx');
const src0 = fs.readFileSync(FILE, 'utf8');

// Find each `buildWhere: (...) => ({` start, walk braces to the matching
// `})` end, plus the trailing comma. Re-derive the slug from the
// preceding `slug: 'X',` declaration in the same enclosing object.
const buildWhereRe = /buildWhere:\s*\((stateName:\s*string(?:,\s*cityName\?:\s*string)?)\)\s*=>\s*\(\{/g;
let out = '';
let cursor = 0;
let count = 0;
let skipped = 0;

let m: RegExpExecArray | null;
while ((m = buildWhereRe.exec(src0)) !== null) {
    const sig = m[1];
    const blockStart = m.index;        // beginning of `buildWhere: ...`
    const bodyStart = m.index + m[0].length; // just after `({`
    // Walk braces until depth returns to 0. We started after `({` so depth=1
    // (the outer object literal that the arrow returns).
    let depth = 1;
    let i = bodyStart;
    while (i < src0.length && depth > 0) {
        const ch = src0[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
        if (depth === 0) break;
    }
    if (depth !== 0) continue;
    // After the closing `}`, expect `),` (end of arrow IIFE-style return).
    let blockEnd = i;
    if (src0[blockEnd] === ')') blockEnd++;
    if (src0[blockEnd] === ',') blockEnd++;

    // Find the slug in the preceding window (look back ~500 chars for
    // `slug: 'X',`). The enclosing object literal always has slug declared
    // before buildWhere by convention.
    const lookback = src0.slice(Math.max(0, blockStart - 800), blockStart);
    const slugMatches = [...lookback.matchAll(/slug:\s*'([a-z0-9-]+)'/g)];
    const slugMatch = slugMatches[slugMatches.length - 1];
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    // If this block is already converted (no OR: [ inside), skip.
    const blockText = src0.slice(blockStart, blockEnd);
    if (!/\bOR:\s*\[/.test(blockText) && /categoryTags:\s*\{\s*has:/.test(blockText)) {
        out += src0.slice(cursor, blockEnd);
        cursor = blockEnd;
        skipped++;
        continue;
    }

    // Append everything before this block, then write the replacement.
    out += src0.slice(cursor, blockStart);
    const hasCity = /cityName\?:\s*string/.test(sig);
    const cityLine = hasCity
        ? "\n      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),"
        : '';
    const replacement =
        `buildWhere: (${sig}) => ({\n` +
        `      isPublished: true,\n` +
        `      state: { equals: stateName, mode: 'insensitive' },${cityLine}\n` +
        `      categoryTags: { has: '${slug}' },\n` +
        `    }),`;
    out += replacement;
    cursor = blockEnd;
    count++;
}

out += src0.slice(cursor);
fs.writeFileSync(FILE, out, 'utf8');
console.log(`Converted ${count} buildWhere blocks. Skipped ${skipped} already-converted.`);
