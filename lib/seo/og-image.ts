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
 * Copy rules for every card below (the same test enforces them): true and
 * non-perishable. No counts, no dollar figures, no years, no superlatives,
 * no "free", no "verified", no audience claims. Title at most 44 characters
 * (one large line at 62px up to about 36), subtitle at most 60 (one line).
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
 * The site-wide default card (the homepage branch of the route, no title).
 * Mirrors the '/api/og?v=3' literal in app/layout.tsx and app/page.tsx.
 */
export const SITE_OG_URL = `${brand.baseUrl}/api/og?v=3`;

export interface PageOgCard {
  readonly title: string;
  readonly subtitle?: string;
}

/**
 * One copy registry, shared by page metadata and the image sitemap
 * (lib/image-seo.ts), so the card Google Images indexes is the card a share
 * preview shows. Keys are routes; `satisfies` keeps a typo from compiling.
 */
export const PAGE_OG_CARDS = {
  '/jobs': { title: 'Browse PMHNP Jobs', subtitle: 'Search by state, city, work mode and job type' },
  '/pricing': { title: 'Job Post Pricing', subtitle: 'What every PMHNP Hiring job post includes' },
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
  '/faq': { title: 'PMHNP Hiring FAQ', subtitle: 'Searching, posting, alerts and accounts' },
  '/privacy': { title: 'Privacy Policy', subtitle: 'How PMHNP Hiring handles your information' },
  '/terms': { title: 'Terms of Service', subtitle: 'The terms for using PMHNP Hiring' },
  '/contact': { title: 'Contact PMHNP Hiring', subtitle: 'Support, employer and partnership inquiries' },
  // Image-sitemap routes whose pages carry their own category cards.
  '/jobs/remote': { title: 'Remote PMHNP Jobs', subtitle: 'Work from home psychiatric NP positions' },
  '/jobs/telehealth': { title: 'Telehealth PMHNP Jobs', subtitle: 'Virtual psychiatric care positions' },
  '/jobs/travel': { title: 'Travel PMHNP Jobs', subtitle: 'Travel and contract psychiatric NP roles' },
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
 * metadataBase-relative card URL, for openGraph.images and twitter.images.
 * Same shape as the existing inline call sites, so an identical card keeps
 * its edge-cache key.
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

/** openGraph.images entry for a page card. */
export function pageOgImage(card: PageOgCard, alt?: string) {
  return {
    url: pageOgPath(card),
    width: OG_CARD.width,
    height: OG_CARD.height,
    alt: alt ?? (card.subtitle ? `${card.title}: ${card.subtitle}` : card.title),
  };
}
