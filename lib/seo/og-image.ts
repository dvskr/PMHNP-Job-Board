/**
 * Share-image descriptors for static pages.
 *
 * Every page card is rendered by app/api/og/route.tsx (type=page branch), the
 * same branded cream/teal frame the job, city and category pages already use.
 * Before this module, 17 pages pointed og:image at stored screenshots of the
 * old site, which carried retired claims and the retired brand name into
 * every LinkedIn, Slack and X preview. Those screenshots are gone from share
 * metadata; tests/seo/page-og-cards.test.ts keeps them gone.
 *
 * History: that migration landed inside commit d3aded4, whose message only
 * describes an unrelated InMail fix. Reverting d3aded4 whole would put the
 * screenshots back; revert lib/tier-limits.ts and its tests instead.
 * Operator steps for a preview that still shows an old image live in
 * docs/runbooks/share-cards.md.
 *
 * Copy rules for every card below (the same test enforces them): true and
 * non-perishable. No digits beyond the '1099' and 'W-2' in a guide's name, so
 * no counts, figures or years. No dollar signs, no superlatives, no "free", no
 * "verified", no coverage or freshness claims ("all", "every", "nationwide",
 * "updated daily"), no audience claims. Title at most 44 characters (one large
 * line at 62px up to about 36), subtitle at most 60 (one line).
 *
 * Card text only ever comes from this static registry or a canonical state
 * name. Never build a card from request input (a /jobs location filter, a
 * search query): that would let anyone mint a branded image with arbitrary
 * text on it.
 */
import { brand } from '@/config/brand';

/** Rendered size of every /api/og card. */
export const OG_CARD = { width: 1200, height: 630 } as const;

/**
 * Cache buster for the page layout. Versioned per layout, not site-wide (see
 * tests/regressions/og-image-design.test.ts): the page branch has not
 * changed, so it stays at 3. Bump it here, once, if that layout ever moves.
 */
export const PAGE_OG_VERSION = '3';

/**
 * Text of the site-wide default card (the route's homepage branch, requested
 * with no title). The route renders these constants, so the copy test can
 * hold this card to the same rules as the registry below. The homepage branch
 * wraps, so its subtitle may run to two lines.
 */
export const SITE_OG_CARD = {
  title: 'The PMHNP Job Board',
  subtitle: 'Psychiatric nurse practitioner jobs, searchable by state, city and work mode.',
  chips: ['Remote', 'Telehealth', 'In-person'],
} as const;

/**
 * Cache buster for the homepage layout. 4 since its copy dropped the coverage
 * and freshness claims; scrapers cache images per URL, so a copy change only
 * reaches them under a new URL.
 */
export const SITE_OG_VERSION = '4';

/** The site-wide default card, metadataBase-relative (app/layout.tsx, app/page.tsx). */
export const SITE_OG_PATH = `/api/og?v=${SITE_OG_VERSION}`;

/** The site-wide default card, absolute (image sitemap, JSON-LD fallbacks). */
export const SITE_OG_URL = `${brand.baseUrl}${SITE_OG_PATH}`;

/** Alt text for the site-wide card: what the card actually says. */
export const SITE_OG_ALT = `${brand.name}: ${SITE_OG_CARD.title}. ${SITE_OG_CARD.subtitle}`;

/**
 * Share text (og:title, og:description) for the homepage and /jobs.
 *
 * Deliberately separate from the HTML <title>, which carries a live job count
 * for the SERP. A share preview is frozen into a post the moment it is
 * published, so a count there goes stale within days. /jobs also takes free
 * text filters (?location=, ?q=); keeping its share text static means nobody
 * can write their own words into a preview under our name.
 */
export const SITE_SHARE_TEXT = {
  title: `${brand.name}: The PMHNP Job Board`,
  description: 'Search remote, telehealth and in-person psychiatric nurse practitioner jobs by state, city and work mode.',
} as const;

export const JOBS_SHARE_TEXT = {
  title: 'Browse PMHNP Jobs: Remote, Telehealth and In-Person',
  description: 'Search psychiatric nurse practitioner jobs by state, city, work mode and job type.',
} as const;

export interface PageOgCard {
  readonly title: string;
  readonly subtitle?: string;
}

/**
 * One copy registry, shared by page metadata and the image sitemap
 * (lib/image-seo.ts), so the card Google Images indexes is the card a share
 * preview shows. tests/seo/page-og-cards.test.ts loads each sitemap route's
 * real metadata and checks the two match. Keys are routes; `satisfies` keeps
 * a typo from compiling.
 */
export const PAGE_OG_CARDS = {
  '/jobs': { title: 'Browse PMHNP Jobs', subtitle: 'Search by state, city, work mode and job type' },
  '/pricing': { title: 'Job Post Pricing', subtitle: 'What a PMHNP Hiring job post includes' },
  '/for-employers': { title: 'Hire Psychiatric Nurse Practitioners', subtitle: 'Post your PMHNP openings on PMHNP Hiring' },
  '/companies': { title: 'Companies Hiring PMHNPs', subtitle: 'Browse employers with open psychiatric NP roles' },
  '/about': { title: 'About PMHNP Hiring', subtitle: 'A job board for psychiatric nurse practitioners' },
  '/for-job-seekers': { title: 'Find Your Next PMHNP Role', subtitle: 'Remote, telehealth and in-person psychiatric NP jobs' },
  '/salary-guide': { title: 'PMHNP Salary Guide', subtitle: 'Advertised pay from live postings, by state' },
  '/resources': { title: 'PMHNP Career Resources', subtitle: 'Licensure, pay, practice authority and career guides' },
  '/resources/1099-vs-w2': { title: '1099 vs W-2 for PMHNPs', subtitle: 'How contractor and employee pay compare' },
  '/resources/fpa-guide': { title: 'Full Practice Authority for PMHNPs', subtitle: 'Full, reduced and restricted practice by state' },
  '/resources/private-practice-guide': { title: 'Starting a PMHNP Private Practice', subtitle: 'Entity setup, credentialing, EHR and billing' },
  '/resources/multi-state-licensure': { title: 'Multi-State Licensure for PMHNPs', subtitle: 'What the NLC covers and what it does not' },
  '/blog': { title: 'PMHNP Career Blog', subtitle: 'Career guides for psychiatric nurse practitioners' },
  '/faq': { title: 'PMHNP Hiring FAQ', subtitle: 'Job search, posting, alerts and careers' },
  '/privacy': { title: 'Privacy Policy', subtitle: 'How PMHNP Hiring handles your information' },
  '/terms': { title: 'Terms of Service', subtitle: 'The terms for using PMHNP Hiring' },
  '/contact': { title: 'Contact PMHNP Hiring', subtitle: 'Support, employer and partnership inquiries' },
  '/jobs/remote': { title: 'Remote PMHNP Jobs', subtitle: 'Work from home psychiatric NP positions' },
  '/jobs/telehealth': { title: 'Telehealth PMHNP Jobs', subtitle: 'Virtual psychiatric care positions' },
  '/jobs/travel': { title: 'Travel PMHNP Jobs', subtitle: 'Travel assignment psychiatric NP roles' },
  '/jobs/per-diem': { title: 'Per Diem PMHNP Jobs', subtitle: 'Flexible, as-needed psychiatric NP shifts' },
  '/jobs/new-grad': { title: 'New Grad PMHNP Jobs', subtitle: 'Roles marked as open to new graduates' },
  '/jobs/locations': { title: 'PMHNP Jobs by Location', subtitle: 'Browse positions by state and city' },
  '/post-job': { title: 'Post a PMHNP Job', subtitle: 'Create a job post on PMHNP Hiring' },
} as const satisfies Record<string, PageOgCard>;

export type PageOgRoute = keyof typeof PAGE_OG_CARDS;

/**
 * Card for /salary-guide/[state]. `stateName` must be the canonical name from
 * resolveStateSlug, never the raw slug. No median on the card: the figure
 * moves daily and lives in the title and body, where it is recomputed.
 */
export function stateSalaryOgCard(stateName: string): PageOgCard {
  return { title: `PMHNP Salary in ${stateName}`, subtitle: 'Advertised pay from live postings' };
}

/**
 * metadataBase-relative card URL. Same shape as the existing inline call
 * sites, so an identical card keeps its edge-cache key.
 */
export function pageOgPath(card: PageOgCard): string {
  const params = [
    'type=page',
    `v=${PAGE_OG_VERSION}`,
    `title=${encodeURIComponent(card.title)}`,
  ];
  if (card.subtitle) params.push(`subtitle=${encodeURIComponent(card.subtitle)}`);
  return `/api/og?${params.join('&')}`;
}

/**
 * Absolute card URL, for sinks that get no metadataBase: JSON-LD and the
 * image sitemap.
 */
export function pageOgUrl(card: PageOgCard): string {
  return `${brand.baseUrl}${pageOgPath(card)}`;
}

export interface PageOgImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/**
 * Image descriptor for a page card, for openGraph.images and twitter.images.
 * Pass the same descriptor to both: a bare path in twitter.images drops the
 * alt, so no twitter:image:alt is emitted.
 */
export function pageOgImage(card: PageOgCard, alt?: string): PageOgImage {
  return {
    url: pageOgPath(card),
    width: OG_CARD.width,
    height: OG_CARD.height,
    alt: alt ?? (card.subtitle ? `${card.title}: ${card.subtitle}` : card.title),
  };
}
