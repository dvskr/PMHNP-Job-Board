/**
 * Source lock on VideoObject markup.
 *
 * Until 2026-09-25 seven of the highest-authority pages on the site (the
 * homepage, /about, /blog, /faq, /for-job-seekers, /resources, /salary-guide)
 * shipped a VideoObject whose contentUrl and embedUrl pointed at a
 * /videos/*.webm scroll recording. No page rendered a player, and app/robots.ts
 * disallows /videos/, so the media was unfetchable too. Google requires the
 * video to be on the page and the file to be crawlable; markup for a video that
 * is neither is misleading structured data, and the exposure is site wide, not
 * just the lost video rich result.
 *
 * These tests pin the invariant rather than the removal, so the legitimate
 * alternative stays open: if someone later embeds a player AND unblocks the
 * media in robots.txt, the markup becomes allowed and this file stays green.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const ROOTS = ['app', 'components', 'lib'];

/** Every .ts/.tsx under the swept roots, repo-relative with forward slashes. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  };
  for (const root of ROOTS) walk(path.join(ROOT, root));
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const files = sourceFiles();
const robotsSrc = read('app/robots.ts');

/**
 * Whether robots.txt still refuses the self-hosted media directory. Read from
 * source rather than assumed, because the other honest fix for this defect is
 * to embed the clips and drop the Disallow, and that fix must not be blocked.
 */
const mediaDirIsBlocked = /^\s*'\/videos\/',/m.test(robotsSrc);

describe('VideoObject markup matches what the page actually serves', () => {
  it('no shipped source points a reader or a crawler at the blocked media directory', () => {
    if (!mediaDirIsBlocked) return; // media is crawlable now, so the pairing is satisfied

    // The original defect split itself across two files: the VideoObject was
    // built in components/VideoJsonLd.tsx while the /videos/*.webm URLs lived in
    // the registry it imported, so a same-file pairing check would have missed
    // it. Flag any reference to the directory instead, which also catches a
    // player, a poster or a preload hint added without unblocking robots.txt.
    const offenders = files.filter(
      (rel) => rel !== 'app/robots.ts' && /['"`]\/videos\//.test(read(rel)),
    );

    expect(offenders).toEqual([]);
  });

  it('no file emits VideoObject without also rendering a player', () => {
    // The rule is not "never emit VideoObject", it is "only describe a video
    // the page actually serves". Google requires the video to be present on
    // the page the markup describes.
    //
    // Two defects of this shape have been removed: components/VideoJsonLd.tsx
    // (seven hub pages, markup for robots-blocked .webm files that were never
    // embedded) and the YouTube branch on the blog route (markup whenever a
    // post carried a youtube_video_id, though nothing rendered an iframe).
    // The blog's video_url branch survives because VideoLightbox really does
    // render a <video> for it, so a blanket ban would have been wrong.
    const PLAYER = /<video[\s>]|VideoLightbox|youtube\.com\/embed|<iframe/;
    const offenders = files.filter((rel) => {
      const src = read(rel);
      return /['"`]VideoObject['"`]/.test(src) && !PLAYER.test(src);
    });

    expect(
      offenders,
      'these files emit VideoObject but render no player:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the deleted component is not reintroduced by import', () => {
    const offenders = files.filter((rel) => /from\s+['"][^'"]*VideoJsonLd['"]/.test(read(rel)));

    expect(offenders).toEqual([]);
  });

  it('no module re-imports the removed scroll-video registry', () => {
    // Matches the import specifier only, so the prose above that explains the
    // removal does not count as a reference.
    const offenders = files.filter((rel) => /from\s+['"][^'"]*\/video-seo['"]/.test(read(rel)));

    expect(offenders).toEqual([]);
  });
});
