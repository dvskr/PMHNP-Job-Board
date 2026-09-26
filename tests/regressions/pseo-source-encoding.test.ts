/**
 * Double-encoded UTF-8 must never reach a reader.
 *
 * lib/pseo/setting-state-template.tsx was saved through a CP1252 round trip
 * at some point and shipped the result in rendered strings: "View All Jobs
 * â†’", "â† Previous", "Next â†’", "... in {state} â€” delivered daily." and a
 * list bullet rendered as "â€¢", on every indexable /jobs/{setting}/{state}
 * page. tests/seo/no-replacement-char.test.ts did not catch it because the
 * bytes are valid UTF-8: the file really does contain U+00E2 followed by a
 * CP1252-range character, not U+FFFD.
 *
 * The same round trip also disabled a code path: line 414 split a salary
 * range on the mojibake sequence for an en dash, so the split never matched
 * and the whole range string rendered under an "avg salary" label.
 *
 * The invariant is byte-level and file-agnostic: no source a reader can
 * reach contains a Latin-1 lead byte followed by a character from the CP1252
 * upper range, which is the signature every mis-decode leaves behind.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const ROOTS = ['app', 'components', 'lib'];

/**
 * U+00C2 / U+00C3 / U+00E2 are what the UTF-8 lead bytes C2, C3 and E2 decode
 * to under Latin-1, and the continuation byte lands somewhere in the CP1252
 * upper range (which maps 0x80 to 0x9F onto punctuation like U+2014 and
 * U+2019). A legitimate word never puts those two next to each other.
 */
const MOJIBAKE =
  /[ÂÃâ][\u0080-ÿ–—‘’‚“”„†‡•…‰‹›€™ŒœŠšŸŽžƒˆ˜]/;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.(tsx?|jsx?|mjs|cjs|css|md|mdx|json)$/.test(entry.name)) {
        out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  };
  for (const root of ROOTS) walk(path.join(ROOT, root));
  return out;
}

describe('no double-encoded UTF-8 in reader-facing source', () => {
  const files = sourceFiles();

  it('sweeps the whole surface, not a sample', () => {
    // Guards the guard: a wrong root would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(500);
  });

  it('every swept source is free of mis-decoded byte sequences', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      // lib/description-cleaner.ts repairs mojibake in scraped job text, so
      // the sequences are its input data rather than copy it publishes.
      if (rel === 'lib/description-cleaner.ts') continue;
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (!MOJIBAKE.test(src)) continue;
      src.split('\n').forEach((line, index) => {
        if (MOJIBAKE.test(line)) offenders.push(`${rel}:${index + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(
      offenders,
      `${offenders.length} double-encoded sequence(s). Re-save the file as UTF-8 with the intended ` +
        `character, and check whether any of them sit inside a string a comparison or split depends on:\n  ` +
        offenders.slice(0, 40).join('\n  '),
    ).toEqual([]);
  });
});
