import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// U+FFFD (Unicode replacement character) — appears when a file is mis-decoded
// or copy-pasted from a source that lost the original bytes. Once it lands in
// a title tag, OG metadata, or visible text it shows up as a literal "?" or a
// replacement-character glyph in Google SERPs and social cards.
//
// Past incident (2026-05-08 SEO audit): 16 occurrences across 8 category
// pages corrupted hero badges, FAQ answers, and the /jobs/senior <title> +
// og:title. This guard prevents recurrence.
const REPLACEMENT_CHAR = '�';

const ROOTS = ['app', 'components', 'lib'] as const;
const TEXT_EXT = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.css', '.scss', '.html', '.md', '.mdx', '.json', '.yml', '.yaml',
]);

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            // Skip generated/hidden trees
            if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
            walk(full, out);
        } else {
            const dot = entry.lastIndexOf('.');
            if (dot >= 0 && TEXT_EXT.has(entry.slice(dot))) out.push(full);
        }
    }
    return out;
}

describe('no Unicode replacement character (U+FFFD) in source', () => {
    it('has zero \\uFFFD in app/, components/, lib/', () => {
        const offenders: string[] = [];
        for (const root of ROOTS) {
            for (const file of walk(root)) {
                const content = readFileSync(file, 'utf8');
                if (!content.includes(REPLACEMENT_CHAR)) continue;
                content.split('\n').forEach((line, i) => {
                    if (line.includes(REPLACEMENT_CHAR)) {
                        offenders.push(`${relative(process.cwd(), file)}:${i + 1}`);
                    }
                });
            }
        }
        if (offenders.length > 0) {
            // Spell out the fix in the failure message so future devs don't have to chase context.
            throw new Error(
                `Unicode replacement character (U+FFFD) found in ${offenders.length} location(s):\n  ` +
                offenders.join('\n  ') +
                `\n\nReplace with the intended character:\n` +
                `  · (middle dot, U+00B7) for badge separators like "12 live roles · updated today"\n` +
                `  — (em dash, U+2014) for prose/title separators\n` +
                `Re-save the file as UTF-8 and commit.`,
            );
        }
        expect(offenders).toEqual([]);
    });
});
