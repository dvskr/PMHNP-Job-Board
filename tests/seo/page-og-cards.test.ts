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
 *   2. the copy of every registry card, every per-state salary card, the
 *      site-wide default card and the static share text is true and
 *      non-perishable (no digits beyond a guide's name, no coverage or
 *      freshness claims, no superlatives) and fits its card;
 *   3. the real metadata each page exports (or generates) points at its
 *      card, twitter included, and /jobs keeps static share text and card
 *      whatever the filters say;
 *   4. the root layout sets no og:url and leaves twitter title and image to
 *      Next, so no page inherits the homepage's identity;
 *   5. the image sitemap is valid XML, and every route's sitemap image is
 *      the og:image that route's page actually emits;
 *   6. the Article JSON-LD image on the resource guides is the same card;
 *   7. backstop sweep: no source under app/, components/, lib/ or config/
 *      references a stored page screenshot at all. Only the text-free clay
 *      illustrations in that folder remain in use.
 *
 * Not covered: the inline /api/og call sites outside the registry (the
 * category-city and setting-state templates build their own cards).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { prisma } from '@/lib/prisma';
import { PAGE_IMAGE_SEO } from '@/lib/image-seo';
import {
  JOBS_SHARE_TEXT,
  OG_CARD,
  PAGE_OG_CARDS,
  PAGE_OG_VERSION,
  SITE_OG_ALT,
  SITE_OG_CARD,
  SITE_OG_PATH,
  SITE_OG_URL,
  SITE_SHARE_TEXT,
  pageOgImage,
  pageOgPath,
  pageOgUrl,
  stateSalaryOgCard,
  type PageOgCard,
  type PageOgRoute,
} from '@/lib/seo/og-image';
import { getAllStateSlugs, resolveStateSlug } from '@/lib/pseo/setting-state-config';
import { sourceFilesUnder } from '../helpers/source';

// The root layout loads two Google fonts; outside Next that call has no
// loader behind it.
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter', className: 'font-inter' }),
  Lora: () => ({ variable: '--font-lora', className: 'font-lora' }),
}));
// Only the layout's metadata is under test. Its site chrome pulls in a large
// client component graph that took minutes to transform under a full
// parallel run, so it is stubbed.
const { stub } = vi.hoisted(() => ({ stub: () => null }));
vi.mock('next/dynamic', () => ({ default: () => stub }));
vi.mock('@/components/Header', () => ({ default: stub }));
vi.mock('@/components/Footer', () => ({ default: stub }));
vi.mock('@/components/BottomNav', () => ({ default: stub }));
vi.mock('@/components/ThemeProvider', () => ({ ThemeProvider: stub }));
vi.mock('@/components/LayoutShell', () => ({ default: stub }));
vi.mock('@/components/MainContent', () => ({ default: stub }));
vi.mock('@/components/MobileHideOnAppRoutes', () => ({ default: stub }));
vi.mock('@/components/GoogleAnalytics', () => ({ default: stub }));
vi.mock('@/components/ConsentGatedTelemetry', () => ({ default: stub }));
vi.mock('@/components/ScrollIndicator', () => ({ default: stub }));
vi.mock('@/components/ui/ToastProvider', () => ({ ToastProvider: stub }));
vi.mock('@/components/VisitCounter', () => ({ default: stub }));

const ROOT = path.resolve(__dirname, '../..');

const TITLE_MAX = 44;
const SUBTITLE_MAX = 60;
// The homepage branch sets its title at 66px in a 980px column and lets the
// subtitle wrap to two lines at 28px in 860px.
const SITE_TITLE_MAX = 28;
const SITE_SUBTITLE_MAX = 120;
const SITE_CHIP_MAX = 24;

// The only digits card copy may carry: a guide's own name.
const ALLOWED_DIGIT_TOKENS = [/\b1099\b/g, /\bW-2\b/g];

// Anything that can go stale or overclaim. Digits are banned outright
// (counts, figures, years, "50 states"); the words cover the coverage and
// freshness claims the retired screenshots and the old homepage card made.
const BANNED_COPY: Array<[string, RegExp]> = [
  ['en or em dash', /[–—]/],
  ['digit (count, figure or year)', /\d/],
  ['dollar sign', /\$/],
  ['percentage', /%/],
  ['#1', /#\s*1|number one/i],
  ['brand suffix', /\|/],
  ['states covered', /states covered/i],
  ['updated daily', /updated daily/i],
  ...[
    'verified', 'free', 'best', 'top', 'leading', 'largest', 'only', 'thousands',
    'guarantee', 'guaranteed', 'daily', 'updated', 'every', 'all', 'nationwide',
    'transparency', 'unlimited',
  ].map((w): [string, RegExp] => [w, new RegExp(`\\b${w}\\b`, 'i')]),
];

function bannedIn(text: string): string[] {
  const stripped = ALLOWED_DIGIT_TOKENS.reduce((t, re) => t.replace(re, ''), text);
  return BANNED_COPY.filter(([, re]) => re.test(stripped)).map(([label]) => label);
}

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
    const p = pageOgPath(card);
    expect(p.startsWith('/api/og?')).toBe(true);
    const params = new URL(p, 'https://example.test').searchParams;
    expect(params.get('type')).toBe('page');
    expect(params.get('v')).toBe(PAGE_OG_VERSION);
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

  it('the site-wide card has one absolute form, on the canonical host', () => {
    expect(SITE_OG_PATH.startsWith('/api/og?')).toBe(true);
    expect(SITE_OG_URL).toBe(`${brand.baseUrl}${SITE_OG_PATH}`);
    // No title and no type=page: that is what selects the homepage branch.
    const params = new URL(SITE_OG_PATH, 'https://example.test').searchParams;
    expect([...params.keys()]).toEqual(['v']);
  });
});

describe('the copy rules catch the claims the retired images made', () => {
  it.each([
    'Jobs in all 50 states, updated daily',
    'Advertised pay, updated daily, all states',
    'Salary transparency on every listing',
    '51 States Covered',
    'The PMHNP-Only Job Board',
    'Nationwide psychiatric NP roles',
    '6600+ PMHNP Jobs',
  ])('%s', (text) => {
    expect(bannedIn(text)).not.toEqual([]);
  });

  it('lets a guide name its own subject', () => {
    expect(bannedIn('1099 vs W-2 for PMHNPs')).toEqual([]);
  });
});

describe('card copy is true, non-perishable and fits the card', () => {
  it.each(ALL_CARDS)('%s', (_route, card) => {
    for (const text of [card.title, card.subtitle ?? '']) {
      expect(bannedIn(text), `"${text}"`).toEqual([]);
    }
    expect(card.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect((card.subtitle ?? '').length).toBeLessThanOrEqual(SUBTITLE_MAX);
  });

  it('the site-wide default card (homepage branch)', () => {
    for (const text of [SITE_OG_CARD.title, SITE_OG_CARD.subtitle, ...SITE_OG_CARD.chips]) {
      expect(bannedIn(text), `"${text}"`).toEqual([]);
    }
    expect(SITE_OG_CARD.title.length).toBeLessThanOrEqual(SITE_TITLE_MAX);
    expect(SITE_OG_CARD.subtitle.length).toBeLessThanOrEqual(SITE_SUBTITLE_MAX);
    for (const chip of SITE_OG_CARD.chips) expect(chip.length).toBeLessThanOrEqual(SITE_CHIP_MAX);
    // The alt says what the card says, not what the site claims to be.
    expect(SITE_OG_ALT).toContain(SITE_OG_CARD.title);
    expect(SITE_OG_ALT).toContain(SITE_OG_CARD.subtitle);
  });

  it.each([
    ['homepage share text', SITE_SHARE_TEXT],
    ['/jobs share text', JOBS_SHARE_TEXT],
  ])('%s', (_label, share) => {
    for (const text of [share.title, share.description]) {
      expect(bannedIn(text), `"${text}"`).toEqual([]);
    }
  });
});

// ── The metadata the pages actually export ─────────────────────────────────

type ImageDescriptor = { url: string; width?: number | string; height?: number | string; alt?: string };

function descriptors(raw: unknown): ImageDescriptor[] | null {
  if (raw === undefined) return null;
  return (Array.isArray(raw) ? raw : [raw]).map((i) =>
    typeof i === 'string' || i instanceof URL
      ? { url: String(i) }
      : { ...(i as ImageDescriptor), url: String((i as ImageDescriptor).url) },
  );
}

function ogImages(meta: Metadata): ImageDescriptor[] {
  return descriptors(meta.openGraph?.images) ?? [];
}

function expectCard(meta: Metadata, card: PageOgCard) {
  const og = ogImages(meta);
  expect(og).toHaveLength(1);
  expect(og[0].url).toBe(pageOgPath(card));
  expect(og[0].width).toBe(1200);
  expect(og[0].height).toBe(630);
  expect(og[0].alt, 'og:image:alt').toBeTruthy();
  // The root layout leaves twitter images to Next, which copies og:image
  // (checked below). A page that sets its own must send the same
  // descriptor, alt included, or twitter:image:alt goes missing.
  const twitter = descriptors(meta.twitter?.images);
  if (twitter !== null) expect(twitter).toEqual(og);
}

type Loader = () => Promise<Metadata>;

const fromStatic = (load: () => Promise<{ metadata: Metadata }>): Loader => async () => (await load()).metadata;
const fromGenerated = (load: () => Promise<{ generateMetadata: () => Promise<Metadata> }>): Loader =>
  async () => (await load()).generateMetadata();
const fromCategory = (
  load: () => Promise<{ generateMetadata: (p: { searchParams: Promise<{ page?: string }> }) => Promise<Metadata> }>,
): Loader => async () => (await load()).generateMetadata({ searchParams: Promise.resolve({}) });

/** Metadata for every route with a registry card, from the module Next reads. */
const ROUTE_METADATA: Record<PageOgRoute, Loader> = {
  '/jobs': async () => (await import('@/app/jobs/page')).generateMetadata({ searchParams: Promise.resolve({}) }),
  '/pricing': fromStatic(() => import('@/app/pricing/page')),
  '/for-employers': fromStatic(() => import('@/app/for-employers/page')),
  '/companies': fromStatic(() => import('@/app/companies/page')),
  '/about': fromStatic(() => import('@/app/about/page')),
  '/for-job-seekers': fromStatic(() => import('@/app/for-job-seekers/page')),
  '/salary-guide': fromGenerated(() => import('@/app/salary-guide/page')),
  '/resources': fromGenerated(() => import('@/app/resources/page')),
  '/resources/1099-vs-w2': fromStatic(() => import('@/app/resources/1099-vs-w2/page')),
  '/resources/fpa-guide': fromStatic(() => import('@/app/resources/fpa-guide/page')),
  '/resources/private-practice-guide': fromStatic(() => import('@/app/resources/private-practice-guide/page')),
  '/resources/multi-state-licensure': fromStatic(() => import('@/app/resources/multi-state-licensure/page')),
  '/blog': fromStatic(() => import('@/app/blog/page')),
  '/faq': fromStatic(() => import('@/app/faq/page')),
  '/privacy': fromStatic(() => import('@/app/privacy/page')),
  '/terms': fromStatic(() => import('@/app/terms/page')),
  '/contact': fromStatic(() => import('@/app/contact/page')),
  '/jobs/remote': fromCategory(() => import('@/app/jobs/remote/page')),
  '/jobs/telehealth': fromCategory(() => import('@/app/jobs/telehealth/page')),
  '/jobs/travel': fromCategory(() => import('@/app/jobs/travel/page')),
  '/jobs/per-diem': fromCategory(() => import('@/app/jobs/per-diem/page')),
  '/jobs/new-grad': fromCategory(() => import('@/app/jobs/new-grad/page')),
  '/jobs/locations': fromStatic(() => import('@/app/jobs/locations/page')),
  // The page is a client component; its metadata lives on the layout.
  '/post-job': fromStatic(() => import('@/app/post-job/layout')),
};

const ALL_ROUTE_METADATA: Record<string, Loader> = {
  ...ROUTE_METADATA,
  '/': fromGenerated(() => import('@/app/page')),
};

function mockPrisma() {
  // generateMetadata below touches these; the shared mock resets call
  // history between tests but keeps these implementations.
  const p = prisma as unknown as Record<string, Record<string, unknown>>;
  vi.mocked(prisma.job.count).mockResolvedValue(42 as never);
  vi.mocked(prisma.job.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.job.groupBy).mockResolvedValue([] as never);
  p.blogPost ??= {};
  p.blogPost.count = vi.fn().mockResolvedValue(0);
  p.siteStat.findFirst = vi.fn().mockResolvedValue({ totalJobs: 1234, totalCompanies: 7, totalSubscribers: 7 });
}

describe('each page emits its branded card as og:image (and twitter:image)', () => {
  beforeAll(mockPrisma);

  it.each(Object.keys(ROUTE_METADATA) as PageOgRoute[])('%s', async (route) => {
    expectCard(await ROUTE_METADATA[route](), PAGE_OG_CARDS[route]);
  }, 30_000);

  it('/salary-guide/[state] uses the state card, never the raw slug', async () => {
    const { generateMetadata } = await import('@/app/salary-guide/[state]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ state: 'dc' }) });
    expectCard(meta, stateSalaryOgCard('District of Columbia'));
  }, 30_000);
});

describe('/jobs keeps static share text and one card whatever the filters say', () => {
  beforeAll(mockPrisma);

  // Every key parseFiltersFromParams (lib/filters.ts) reads, each carrying
  // text a stranger chose. None of it may reach the preview.
  const HOSTILE = 'Arbitrary text a stranger typed';
  const EVERY_FILTER = Object.fromEntries(
    ['q', 'workMode', 'jobType', 'specialty', 'experienceLevel', 'newGrad', 'minYears', 'easyApply',
      'salaryMin', 'postedWithin', 'location', 'cityExact', 'stateCode', 'employer', 'category']
      .map((k) => [k, HOSTILE]),
  );

  it.each([
    ['no filters', {}],
    ['paginated', { page: '3' }],
    ['sorted', { sort: 'newest' }],
    // Middleware 301s any utm_* URL to the clean path before a page renders,
    // so LinkedIn actually scrapes bare /jobs. Kept so the preview holds even
    // if that redirect is ever narrowed.
    ['utm-tagged', { utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'launch_p1' }],
    ['location and work mode', { location: HOSTILE, workMode: 'remote' }],
    ['every filter parameter', EVERY_FILTER],
  ])('%s', async (_label, searchParams) => {
    const { generateMetadata } = await import('@/app/jobs/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve(searchParams as Record<string, string>) });

    expectCard(meta, PAGE_OG_CARDS['/jobs']);
    expect(meta.openGraph?.title).toBe(JOBS_SHARE_TEXT.title);
    expect(meta.openGraph?.description).toBe(JOBS_SHARE_TEXT.description);
    expect((meta.twitter as { title?: unknown } | undefined)?.title).toBe(JOBS_SHARE_TEXT.title);
    expect(JSON.stringify([meta.openGraph, meta.twitter])).not.toContain(HOSTILE);
  }, 30_000);

  it('the SERP title may carry the live count; the share title never does', async () => {
    const { generateMetadata } = await import('@/app/jobs/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(String(meta.title)).toMatch(/\d/);
    expect(String(meta.openGraph?.title)).not.toMatch(/\d/);
  }, 30_000);
});

describe('the homepage and the root layout', () => {
  beforeAll(mockPrisma);

  it('homepage: its own og:url, the site card and count-free share text', async () => {
    const meta = await ALL_ROUTE_METADATA['/']();
    expect(meta.openGraph).toMatchObject({
      url: brand.baseUrl,
      title: SITE_SHARE_TEXT.title,
      description: SITE_SHARE_TEXT.description,
    });
    expect(ogImages(meta)).toEqual([{ url: SITE_OG_PATH, width: 1200, height: 630, alt: SITE_OG_ALT }]);
    expect(String(meta.title)).toMatch(/\d/);
  }, 30_000);

  it('root layout: the site card, no og:url, and a twitter block Next can fill per page', async () => {
    const { metadata } = await import('@/app/layout');
    expect(ogImages(metadata)).toEqual([{ url: SITE_OG_PATH, width: 1200, height: 630, alt: SITE_OG_ALT }]);
    // Next replaces openGraph wholesale per segment, so any og:url here is
    // inherited by every page without its own openGraph, and scrapers then
    // file that page under the homepage.
    expect(metadata.openGraph).not.toHaveProperty('url');
    // Next only copies a page's og title and image into twitter when twitter
    // has none. Set here, they would be inherited instead, and every page
    // with an openGraph block but no twitter block would show the homepage
    // title and card on X.
    const twitter = (metadata.twitter ?? {}) as Record<string, unknown>;
    expect(twitter.card).toBe('summary_large_image');
    expect(twitter).not.toHaveProperty('images');
    expect(twitter).not.toHaveProperty('title');
    expect(twitter).not.toHaveProperty('description');
  }, 60_000);
});

// ── Image sitemap ──────────────────────────────────────────────────────────

describe('image sitemap submits only branded cards, as valid XML', () => {
  beforeAll(mockPrisma);

  it('escapes every & and lists no stored screenshot', async () => {
    const { GET } = await import('@/app/image-sitemap.xml/route');
    const xml = await GET().text();

    // A bare '&' (not the start of an entity) is a fatal XML error.
    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i);
    expect(xml).not.toContain('images/pages');

    const locs = [...xml.matchAll(/<image:loc>([^<]*)<\/image:loc>/g)].map((m) =>
      m[1].replace(/&amp;/g, '&'),
    );
    expect(locs).toHaveLength(Object.keys(PAGE_IMAGE_SEO).length);
    for (const loc of locs) {
      expect(loc.startsWith(`${brand.baseUrl}/api/og?`), loc).toBe(true);
    }
  });

  it('knows how to load every sitemap route', () => {
    const missing = Object.keys(PAGE_IMAGE_SEO).filter((route) => !(route in ALL_ROUTE_METADATA));
    expect(missing).toEqual([]);
  });

  // What Google Images indexes for a route must be what a share of that
  // route shows; an image no page references is an orphan.
  it.each(Object.keys(PAGE_IMAGE_SEO))('%s: sitemap image is the page og:image', async (route) => {
    const og = ogImages(await ALL_ROUTE_METADATA[route]());
    expect(og).toHaveLength(1);
    const url = og[0].url.startsWith('http') ? og[0].url : `${brand.baseUrl}${og[0].url}`;
    expect(url).toBe(PAGE_IMAGE_SEO[route].image);
  }, 30_000);
});

// ── JSON-LD ────────────────────────────────────────────────────────────────

type Element = { type: unknown; props: Record<string, unknown> };

/** Every JSON-LD block a server component renders directly, parsed. */
function jsonLdBlocks(node: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const child of node) jsonLdBlocks(child, out);
  } else if (node && typeof node === 'object' && 'props' in node) {
    const el = node as Element;
    const html = (el.props.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html;
    if (el.type === 'script' && el.props.type === 'application/ld+json' && html) {
      out.push(JSON.parse(html));
    }
    jsonLdBlocks(el.props.children, out);
  }
  return out;
}

describe('Article JSON-LD image is the page card', () => {
  const GUIDES: Array<[PageOgRoute, () => Promise<{ default: () => unknown }>]> = [
    ['/resources/1099-vs-w2', () => import('@/app/resources/1099-vs-w2/page')],
    ['/resources/fpa-guide', () => import('@/app/resources/fpa-guide/page')],
    ['/resources/private-practice-guide', () => import('@/app/resources/private-practice-guide/page')],
    ['/resources/multi-state-licensure', () => import('@/app/resources/multi-state-licensure/page')],
  ];

  it.each(GUIDES)('%s', async (route, load) => {
    const Page = (await load()).default;
    const articles = jsonLdBlocks(Page()).filter((b) => b['@type'] === 'Article');
    expect(articles).toHaveLength(1);
    expect(articles[0].image).toBe(pageOgUrl(PAGE_OG_CARDS[route]));
  }, 30_000);

  describe('salary guides', () => {
    beforeAll(() => {
      mockPrisma();
      // Enough advertised ranges to clear the state page's publish gate,
      // which notFound()s a state with fewer than three.
      const row = (i: number) => ({
        id: String(i),
        title: 'PMHNP',
        employer: 'Example Health',
        city: 'Washington',
        state: 'District of Columbia',
        stateCode: 'DC',
        normalizedMinSalary: 140_000 + i * 5_000,
        normalizedMaxSalary: 170_000 + i * 5_000,
        salaryIsEstimated: false,
        salaryPeriod: 'annual',
        setting: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        originalPostedAt: new Date('2026-01-01'),
      });
      vi.mocked(prisma.job.findMany).mockResolvedValue(Array.from({ length: 8 }, (_, i) => row(i)) as never);
      vi.mocked(prisma.job.aggregate).mockResolvedValue({ _max: {}, _min: {}, _avg: {}, _count: 0 } as never);
    });

    it('/salary-guide', async () => {
      const Page = (await import('@/app/salary-guide/page')).default;
      const articles = jsonLdBlocks(await Page()).filter((b) => b['@type'] === 'Article');
      expect(articles).toHaveLength(1);
      expect(articles[0].image).toBe(pageOgUrl(PAGE_OG_CARDS['/salary-guide']));
    }, 30_000);

    it('/salary-guide/[state]', async () => {
      const Page = (await import('@/app/salary-guide/[state]/page')).default;
      const tree = await Page({ params: Promise.resolve({ state: 'district-of-columbia' }) });
      const articles = jsonLdBlocks(tree).filter((b) => b['@type'] === 'Article');
      expect(articles).toHaveLength(1);
      expect(articles[0].image).toBe(pageOgUrl(stateSalaryOgCard('District of Columbia')));
    }, 30_000);
  });
});

// ── Backstop sweep ─────────────────────────────────────────────────────────

describe('no source references a stored page screenshot', () => {
  // Matches the folder with or without a trailing file name, so a
  // `${BASE}/file.webp` split across a constant is caught too. The clay
  // illustrations in the same folder are text-free and stay in use.
  const SCREENSHOT_REF = /images\/pages(?!\/clay_)/;

  // Raw source, comments included. Comment stripping without string
  // tracking blanks live code after an `image/*` literal, and an absence
  // check must not have blind spots. No comment needs to name the path.
  it('app/, components/, lib/ and config/ are clean', () => {
    const offenders = sourceFilesUnder(['app', 'components', 'lib', 'config']).flatMap((file) =>
      fs.readFileSync(path.join(ROOT, file), 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => SCREENSHOT_REF.test(line))
        .map(({ i }) => `${file}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
