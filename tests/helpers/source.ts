/**
 * Helpers for the tests that have to assert against source text.
 *
 * This repo has no jsdom and no Testing Library, so a page component cannot
 * be rendered in a unit test. For those, reading the file is the only
 * available check. It is a weak one, and the weakness has bitten twice: a
 * test that pins a particular string breaks when a correct refactor moves the
 * code, and it passes when the string appears only in a comment explaining
 * the bug it is supposed to guard against.
 *
 * `blankComments` removes the second failure mode. The first is on whoever
 * writes the assertion: pin a shape the behaviour genuinely requires (an
 * identifier used in a render position, a field inside a request body), never
 * an incidental spelling.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');

/**
 * Blank out comments while preserving every character position, so a line
 * number reported against the result is the real one.
 *
 * Handles `//` (except after a colon, so URLs survive), `/* *\/` blocks, and
 * therefore JSX `{/* *\/}` comments too. Deliberately simple: it does not
 * track string or regex literals, so a comment marker inside a string is
 * blanked as well. That is the safe direction for these assertions.
 *
 * The line pattern is `[^\n]*`, not `.*`. This tree is mixed CRLF and LF, and
 * JavaScript's `.` does not match \r, so `.*$` could never reach the end of a
 * CRLF line and no `//` comment in such a file was blanked at all. That made
 * the helper quietly useless on exactly the files it mattered for: the first
 * sweep written against it reported a comment explaining a bug as an instance
 * of the bug.
 */
export function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) =>
      line.replace(/(^|[^:])\/\/[^\n]*$/, (_m, lead: string) =>
        lead + ' '.repeat(line.length - lead.length),
      ),
    )
    .join('\n');
}

/** Read a repo-relative source file with its comments blanked out. */
export function readCode(relativePath: string): string {
  return blankComments(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/** Every .ts/.tsx file under the given repo-relative roots, forward-slashed. */
export function sourceFilesUnder(roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  };
  for (const root of roots) walk(path.join(ROOT, root));
  return out;
}
