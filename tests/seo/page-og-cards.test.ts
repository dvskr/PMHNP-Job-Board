/**
 * Share images for static pages come from the branded /api/og card.
 *
 * Seventeen pages used to point og:image and twitter:image at stored
 * screenshots of the old site (site-assets/images/pages/*.webp). Those
 * screenshots carried retired claims and the retired brand name into every
 * LinkedIn, Slack and X preview, and the image sitemap submitted them to
 * Google Images. lib/seo/og-image.ts replaced them with one card registry.
 *
 * What this pins, as behaviour rather than source shape:
 *   1. the helper builds a 1200x630 /api/og?type=page URL whose params
 *      round-trip, relative for metadata and absolute for JSON-LD/sitemaps;
 *   2. every card's copy is true and non-perishable (no counts, figures,
 *      years or superlatives) and fits the card on one line;
 *   3. the real metadata each page exports (or generates) points at its
 *      card, including /jobs with hostile filter input;
 *   4. the image sitemap is valid XML and submits only cards;
 *   5. backstop sweep: no code under app/, components/ or lib/ references
 *      a stored page screenshot at all (JSON-LD, visible fallbacks). Only
 *      the text-free clay illustrations in that folder remain in use.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { prisma } from '@/lib/prisma';
import {
  OG_CARD,
  PAGE_OG_CARDS,
  pageOgImage,
  pageOgPath,
  pageOgUrl,
  stateSalaryOgCard,
  type PageOgCard,
  type PageOgRoute,
} from '@/lib/seo/og-image';
import { getAllStateSlugs, resolveStateSlug } from '@/lib/pseo/setting-state-config';
import { readCode, sourceFilesUnder } from '../helpers/source';

const TITLE_MAX = 44;
const SUBTITLE_MAX = 60;

// Anything that can go stale or overclaim. '1099' and 'W-2' pass: no plus
// sign, no thousands separator, not a year.
const BANNED_COPY: Array<[string, RegExp]> = [
  ['en or em dash', /[–—]/],
  ['dollar figure', /\$/],
  ['percentage', /%/],
  ['plus-count', /\d[\d,]*\s*\+/],
  ['thousands-separated number', /\b\d{1,3}(,\d{3})+\b/],
  ['year', /\b20\d\d\b/],
  ['#1', /#1\b/],
  ['brand suffix', /\|/],
  ...['verified', 'free', 'best', 'top', 'leading', 'largest', 'only', 'thousands', 'guarantee', 'guaranteed']
    .map((w): [string, RegExp] => [w, new RegExp(`\\b${w}\\b`, 'i')]),
];

function stateCards(): Array<[string, PageOgCard]> {
  return getAllStateSlugs().map((slug) => {
    const name = resolveStateSlug(slug);
    if (!name) throw new Error(`unresolvable state slug ${slug}`);
    return [`/salary-guide/${slug}`, stateSalaryOgCard(name)];
  });
}

const ALL_CARDS: Array<[string, PageOgCard]> = [
  ...(Object.entries(PAGE_OG_CARDS) as Array<[string, PageOgCard]>),
  ...stateCards(),
];

describe('pageOgPath / pageOgUrl / pageOgImage', () => {
  const card: PageOgCard = { title: 'A & B: C/D?', subtitle: 'x=1&y=2 #frag' };

  it('builds a relative type=page URL whose params round-trip exactly', () => {
    const path = pageOgPath(card);
    expect(path.startsWith('/api/og?')).toBe(true);
    const params = new URL(path, 'https://example.test').searchParams;
    expect(params.get('type')).toBe('page');
    expect(params.get('v')).toBe('3');
    expect(params.get('title')).toBe(card.title);
    expect(params.get('subtitle')).toBe(card.subtitle);
    expect([...params.keys()].sort()).toEqual(['subtitle', 'title', 'type', 'v']);
  });

  it('omits subtitle when the card has none', () => {
    const params = new URL(pageOgPath({ title: 'Only a title' }), 'https://example.test').searchParams;
    expect(params.has('subtitle')).toBe(false);
  });

  it('gives JSON-LD and sitemap sinks an absolute URL on the canonical host', () => {
    expect(pageOgUrl(card)).toBe(`${brand.baseUrl}${pageOgPath(card)}`);
    expect(new URL(pageOgUrl(card)).origin).toBe(new URL(brand.baseUrl).origin);
  });

  it('describes a 1200x630 image with an alt that names the card', () => {
    const img = pageOgImage(card);
    expect(OG_CARD).toEqual({ width: 1200, height: 630 });
    expect(img).toEqual({ url: pageOgPath(card), width: 1200, height: 630, alt: `${card.title}: ${card.subtitle}` });
    expect(pageOgImage(card, 'Custom alt').alt).toBe('Custom alt');
  });
});

describe('card copy is true, non-perishable and fits the card', () => {
  it.each(ALL_CARDS)('%s', (_route, card) => {
    const texts = [card.title, card.subtitle ?? ''];
    for (const text of texts) {
      for (const [label, re] of BANNED_COPY) {
        expect(re.test(text), `"${text}" contains a ${label}`).toBe(false);
      }
    }
    expect(card.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect((card.subtitle ?? '').length).toBeLessThanOrEqual(SUBTITLE_MAX);
  });
});

// ── The metadata the pages actually export ─────────────────────────────────

type OgImage = { url: string | URL; width?: number | string; height?: number | string };

function shareImages(meta: Metadata): { og: OgImage[]; twitter: string[] | null } {
  const ogRaw = meta.openGraph?.images;
  const og = (Array.isArray(ogRaw) ? ogRaw : ogRaw ? [ogRaw] : []).map((i) =>
    typeof i === 'string' || i instanceof URL ? { url: i } : (i as OgImage),
  );
  const twRaw = meta.twitter?.images;
  const twitter = twRaw === undefined
    ? null
    : (Array.isArray(twRaw) ? twRaw : [twRaw]).map((i) =>
      typeof i === 'string' || i instanceof URL ? String(i) : String((i as { url: string | URL }).url),
    );
  return { og, twitter };
}

function expectCard(meta: Metadata, card: PageOgCard) {
  const { og, twitter } = shareImages(meta);
  expect(og).toHaveLength(1);
  expect(String(og[0].url)).toBe(pageOgPath(card));
  expect(og[0].width).toBe(1200);
  expect(og[0].height).toBe(630);
  // twitter:image may be omitted (Next fills it from og:image); if a page
  // sets it, it must be the same card.
  if (twitter !== null) expect(twitter).toEqual([pageOgPath(card)]);
}

const STATIC_PAGES: Array<[PageOgRoute, () => Promise<{ metadata: Metadata }>]> = [
  ['/pricing', () => import('@/app/pricing/page')],
  ['/for-employers', () => import('@/app/for-employers/page')],
  ['/companies', () => import('@/app/companies/page')],
  ['/about', () => import('@/app/about/page')],
  ['/for-job-seekers', () => import('@/app/for-job-seekers/page')],
  ['/blog', () => import('@/app/blog/page')],
  ['/faq', () => import('@/app/faq/page')],
  ['/privacy', () => import('@/app/privacy/page')],
  ['/terms', () => import('@/app/terms/page')],
  ['/contact', () => import('@/app/contact/page')],
  ['/resources/1099-vs-w2', () => import('@/app/resources/1099-vs-w2/page')],
  ['/resources/fpa-guide', () => import('@/app/resources/fpa-guide/page')],
  ['/resources/private-practice-guide', () => import('@/app/resources/private-practice-guide/page')],
  ['/resources/multi-state-licensure', () => import('@/app/resources/multi-state-licensure/page')],
];

describe('each page exports its branded card as og:image and twitter:image', () => {
  beforeAll(() => {
    // generateMetadata below touches these; the shared mock omits blogPost.
    vi.mocked(prisma.job.count).mockResolvedValue(42 as never);
    (prisma as unknown as Record<string, unknown>).blogPost ??= { count: vi.fn() };
    vi.mocked((prisma as unknown as { blogPost: { count: () => Promise<number> } }).blogPost.count)
      .mockResolvedValue(0);
  });

  it.each(STATIC_PAGES)('%s', async (route, load) => {
    const { metadata } = await load();
    expectCard(metadata, PAGE_OG_CARDS[route]);
  }, 30_000);

  it('/resources (generateMetadata)', async () => {
    const { generateMetadata } = await import('@/app/resources/page');
    expectCard(await generateMetadata(), PAGE_OG_CARDS['/resources']);
  }, 30_000);

  it('/salary-guide (generateMetadata)', async () => {
    const { generateMetadata } = await import('@/app/salary-guide/page');
    expectCard(await generateMetadata(), PAGE_OG_CARDS['/salary-guide']);
  }, 30_000);

  it('/salary-guide/[state] uses the state card, never the raw slug', async () => {
    const { generateMetadata } = await import('@/app/salary-guide/[state]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ state: 'dc' }) });
    expectCard(meta, stateSalaryOgCard('District of Columbia'));
  }, 30_000);

  it('/jobs keeps one static card whatever the filters say', async () => {
    const { generateMetadata } = await import('@/app/jobs/page');
    for (const searchParams of [
      {},
      { page: '3' },
      { utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'launch_p1' },
      { location: 'Arbitrary text a stranger typed', workMode: 'remote' },
    ]) {
      const meta = await generateMetadata({ searchParams: Promise.resolve(searchParams) });
      expectCard(meta, PAGE_OG_CARDS['/jobs']);
    }
  }, 30_000);
});

// ── Image sitemap ──────────────────────────────────────────────────────────

describe('image sitemap submits only branded cards, as valid XML', () => {
  it('escapes every & and lists no stored screenshot', async () => {
    const { GET } = await import('@/app/image-sitemap.xml/route');
    const xml = await GET().text();

    // A bare '&' (not the start of an entity) is a fatal XML error.
    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i);
    expect(xml).not.toContain('images/pages');

    const locs = [...xml.matchAll(/<image:loc>([^<]*)<\/image:loc>/g)].map((m) =>
      m[1].replace(/&amp;/g, '&'),
    );
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc.startsWith(`${brand.baseUrl}/api/og?`), loc).toBe(true);
    }
  });
});

// ── Backstop sweep ─────────────────────────────────────────────────────────

describe('no code references a stored page screenshot', () => {
  // Matches the folder with or without a trailing file name, so a
  // `${BASE}/file.webp` split across a constant is caught too. The clay
  // illustrations in the same folder are text-free and stay in use.
  const SCREENSHOT_REF = /images\/pages(?!\/clay_)/;

  it('app/, components/ and lib/ are clean (comments ignored)', () => {
    const offenders = sourceFilesUnder(['app', 'components', 'lib']).flatMap((file) =>
      readCode(file)
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => SCREENSHOT_REF.test(line))
        .map(({ i }) => `${file}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
