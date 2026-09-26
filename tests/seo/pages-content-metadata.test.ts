/**
 * Crawler-facing invariants for the content pages: share cards, freshness
 * stamps, self-description, and the one listing predicate.
 *
 * Each block below is a sweep rather than a list of the files that were
 * wrong, because in every case the failure mode is the next file doing the
 * same thing. Comments are blanked first: the notes recording why these were
 * wrong necessarily quote the shapes being banned.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAllStateSlugs, resolveStateSlug, stateToSlug, STATE_CODES } from '@/lib/pseo/setting-state-config';

const ROOT = path.resolve(__dirname, '../../');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
        }
    };
    walk(path.join(ROOT, dir));
    return out;
}

/** Blank comments while preserving length, so an engineering note explaining
 *  a banned shape does not itself trip the ban. */
function blankComments(src: string): string {
    let out = '';
    let mode: 'code' | 'line' | 'block' = 'code';
    let i = 0;
    while (i < src.length) {
        const pair = src.slice(i, i + 2);
        if (mode === 'code') {
            if (pair === '//' && src[i - 1] !== ':') { mode = 'line'; out += '  '; i += 2; continue; }
            if (pair === '/*') { mode = 'block'; out += '  '; i += 2; continue; }
            out += src[i]; i += 1; continue;
        }
        if (mode === 'line') {
            if (src[i] === '\n') { mode = 'code'; out += '\n'; i += 1; continue; }
            out += ' '; i += 1; continue;
        }
        if (pair === '*/') { mode = 'code'; out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' '; i += 1;
    }
    return out;
}

// ─── Share cards ─────────────────────────────────────────────────────────────

/** Every `openGraph: { ... }` literal in a file, brace-matched. */
function openGraphBlocks(src: string): string[] {
    const blocks: string[] = [];
    let i = 0;
    while ((i = src.indexOf('openGraph: {', i)) !== -1) {
        let depth = 0;
        let j = i + 'openGraph: '.length;
        for (; j < src.length; j++) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
        }
        blocks.push(src.slice(i, j));
        i = j;
    }
    return blocks;
}

describe('a page-level openGraph object never deletes the inherited og:image', () => {
    // Next.js REPLACES the parent openGraph rather than merging it, so a page
    // that declares title/description/url with no images ships a share card
    // with no picture at all.
    it.each(sourceFiles('app').filter((f) => openGraphBlocks(read(f)).length > 0))(
        '%s declares images on every openGraph object it writes',
        (file) => {
            for (const block of openGraphBlocks(read(file))) {
                expect(/\bimages\s*:/.test(block), `openGraph in ${file} has no images`).toBe(true);
            }
        },
    );
});

// ─── Freshness ───────────────────────────────────────────────────────────────

describe('no resource guide stamps a render-time date on its copy', () => {
    it.each(sourceFiles('app/resources'))('%s dates itself from a reviewed constant', (file) => {
        const src = blankComments(read(file));
        // "Last Updated: {new Date()...}" claims the current month on copy
        // nobody has looked at, and contradicts the page's own dateModified.
        expect(src).not.toMatch(/Last\s+(?:Updated|Reviewed)[^<{]*\{\s*new Date\(\s*\)/);
    });
});

// ─── One listing predicate ───────────────────────────────────────────────────

describe('published-pay surfaces do not re-implement the listing predicate', () => {
    // publicJobsWhere() is the only public listing predicate. A bare
    // `isPublished: true` on any of these counts expired postings and the
    // MD-Psychiatrist / off-specialty rows GLOBAL_EXCLUSIONS hides, so the
    // published figure describes a job set no visitor can reach.
    const SURFACES = [
        'app/resources/page.tsx',
        'app/salary-guide/[state]/page.tsx',
        'lib/salary-report/market-data.ts',
        'app/salary-guide/page.tsx',
        'app/llms-full.txt/route.ts',
    ];

    it.each(SURFACES)('%s scopes every job query through publicJobsWhere', (file) => {
        const src = blankComments(read(file));
        expect(src).not.toMatch(/isPublished:\s*true/);
        expect(src).toMatch(/publicJobsWhere\(\)/);
    });
});

// ─── Counts come from the stats engine ───────────────────────────────────────

describe('the blog index never hardcodes a job count', () => {
    it('reads the Browse Jobs figure from lib/site-stats', () => {
        const src = blankComments(read('app/blog/page.tsx'));
        expect(src).not.toMatch(/[\d,]+\+?\s*PMHNP positions/);
        expect(src).toMatch(/getSiteStats/);
    });
});

// ─── State-route aliases ─────────────────────────────────────────────────────

describe('/salary-guide/{state} resolves the same slugs as the other state routes', () => {
    it('no longer carries a private slug table', () => {
        const src = blankComments(read('app/salary-guide/[state]/page.tsx'));
        expect(src).not.toMatch(/SLUG_TO_STATE/);
        expect(src).toMatch(/resolveStateSlug/);
    });

    it('accepts every two-letter code as an alias of the canonical slug', () => {
        for (const [name, code] of Object.entries(STATE_CODES)) {
            expect(resolveStateSlug(code.toLowerCase())).toBe(name);
            expect(resolveStateSlug(stateToSlug(name))).toBe(name);
        }
    });

    it('prerenders exactly the canonical slugs it redirects aliases onto', () => {
        const canonical = Object.keys(STATE_CODES).map(stateToSlug).sort();
        expect(getAllStateSlugs().slice().sort()).toEqual(canonical);
    });
});

// ─── Privacy pages describe themselves ───────────────────────────────────────

describe('the privacy request pages are not homepage duplicates', () => {
    it.each(['app/do-not-sell', 'app/data-request'])(
        '%s exports its own canonical and robots directive',
        (dir) => {
            const src = sourceFiles(dir).map(read).join('\n');
            expect(src).toMatch(/canonical:/);
            expect(src).toMatch(/robots:\s*\{[^}]*index:\s*false/);
            expect(src).toMatch(/export const metadata/);
        },
    );

    it('/do-not-sell reads the recorded opt-out instead of assuming none', () => {
        // The consent cookie is HttpOnly, so only the server side can see it.
        // While the page was a client leaf it reset to "not opted out" on
        // every reload and offered the button again, telling a California
        // visitor their request had not stuck when it had.
        const src = sourceFiles('app/do-not-sell').map(read).join('\n');
        expect(src).toMatch(/parseConsentCookie/);
        expect(src).not.toMatch(/const \[optedOut, setOptedOut\] = useState\(false\)/);
    });
});

// ─── Citable dataset ─────────────────────────────────────────────────────────

describe('the salary Dataset says what it measures and who published it', () => {
    const hub = read('app/salary-guide/page.tsx');

    it('declares its method and geographic scope', () => {
        expect(hub).toMatch(/"measurementTechnique"/);
        expect(hub).toMatch(/"spatialCoverage"/);
    });

    it('points at the one Organization node instead of minting a second', () => {
        const idx = hub.indexOf('"@type": "Dataset"');
        expect(idx).toBeGreaterThan(-1);
        const block = hub.slice(idx, idx + 2000);
        const creator = block.match(/"creator":[^\n]*/);
        expect(creator?.[0]).toContain('#organization');
        expect(creator?.[0]).not.toContain('"@type": "Organization"');
    });
});
