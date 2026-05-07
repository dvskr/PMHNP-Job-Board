/**
 * Codemod #2: rewrite specialty buildWhere blocks in
 * lib/pseo/category-city-template.tsx to use `withTagFallback('X')`
 * instead of `categoryTags: { has: 'X' }`.
 *
 * Provides backward-compat during the deploy → backfill window. See
 * docs/runbooks/p9-category-tags-rollout.md.
 */
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.join(process.cwd(), 'lib', 'pseo', 'category-city-template.tsx');
let src = fs.readFileSync(FILE, 'utf8');

// Add the import if not present.
if (!src.includes("from './category-tagger'")) {
    // Insert after the last import line.
    const importBlock = src.match(/(^import [^\n]+\n)+/m);
    if (importBlock) {
        const insertAt = importBlock.index! + importBlock[0].length;
        src = src.slice(0, insertAt) +
            "import { withTagFallback } from './category-tagger';\n" +
            src.slice(insertAt);
    }
}

// Swap every `categoryTags: { has: '<slug>' },` for `...withTagFallback('<slug>'),`.
const before = src;
src = src.replace(
    /categoryTags:\s*\{\s*has:\s*'([a-z0-9-]+)'\s*\}\s*,/g,
    (_, slug) => `...withTagFallback('${slug}'),`,
);

const replacements = (before.match(/categoryTags:\s*\{\s*has:/g) || []).length
    - (src.match(/categoryTags:\s*\{\s*has:/g) || []).length;

fs.writeFileSync(FILE, src, 'utf8');
console.log(`Replaced ${replacements} categoryTags: { has } occurrences with withTagFallback().`);
