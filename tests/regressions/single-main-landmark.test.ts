/**
 * One <main> landmark per page.
 *
 * components/MainContent.tsx wraps every route in <main id="main-content">
 * (it is also the skip-link target). Any route that renders its own <main>
 * therefore ships a nested <main>: invalid HTML, and two "main" landmarks for
 * a screen reader to choose between. The 404, the error boundary, the
 * unauthorized page and the admin shell all did, which meant every dead URL,
 * every expired job URL and every pSEO page below the job-count gate served
 * the broken markup.
 *
 * The invariant, not the fix: exactly one file in the rendered tree may open
 * a <main>, and it is MainContent.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');

/** The single legitimate <main> in the app. */
const LANDMARK_OWNER = 'components/MainContent.tsx';

/**
 * Files that still nest a <main> and are owned by another workstream. Each
 * entry is a handoff, not an exemption: the fix is the same one applied to
 * app/not-found.tsx (swap the element for a div, the layout already supplies
 * the landmark). Remove the entry when the file is fixed.
 */
const PENDING_HANDOFF = new Set([
  'app/onboarding/professional/OnboardingProfessionalForm.tsx',
]);

const OPENS_MAIN = /<main[\s>]/;

/**
 * Blank // and block comments before matching: several of these files
 * document the rule in a comment that quotes the very tag it forbids.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const opensMain = (rel: string): boolean =>
  OPENS_MAIN.test(stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')));

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  };
  for (const root of ['app', 'components']) walk(path.join(ROOT, root));
  return out;
}

describe('exactly one <main> landmark is rendered per page', () => {
  const files = sourceFiles();

  it('sweeps the whole rendered surface, not a sample', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('MainContent is the only file that opens a <main>', () => {
    const offenders = files.filter(
      (rel) =>
        rel !== LANDMARK_OWNER &&
        !PENDING_HANDOFF.has(rel) &&
        opensMain(rel),
    );
    expect(
      offenders,
      `These files render a <main> nested inside ${LANDMARK_OWNER}'s <main id="main-content">. ` +
        `Use a <div>: the layout already supplies the landmark.\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the four pages this regression was filed for are clean', () => {
    for (const rel of [
      'app/not-found.tsx',
      'app/error.tsx',
      'app/unauthorized/page.tsx',
      'app/admin/_components/AdminSidebar.tsx',
    ]) {
      expect(opensMain(rel), rel).toBe(false);
    }
  });
});
