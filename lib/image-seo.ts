/**
 * Image SEO Configuration
 *
 * Maps indexable site routes to the share card submitted for them in the
 * image sitemap (app/image-sitemap.xml/route.ts).
 *
 * Each image is the route's branded /api/og card from lib/seo/og-image.ts,
 * the same card the page's og:image shows: tests/seo/page-og-cards.test.ts
 * loads every route's real metadata and fails if the two differ. This
 * registry used to submit stored screenshots of the old site, which carried
 * retired claims and the retired brand name into Google Images.
 */
import { PAGE_OG_CARDS, SITE_OG_CARD, SITE_OG_URL, pageOgUrl, type PageOgRoute } from '@/lib/seo/og-image';

export interface PageImageSEO {
    /** Absolute image URL. Contains '&', so sinks must XML-escape it. */
    image: string;
    /** Descriptive alt text */
    alt: string;
    /** Short caption for image sitemap */
    caption: string;
    /** Title for image sitemap */
    title: string;
}

/**
 * Build an entry from the route's card so the sitemap copy can never drift
 * from the image. The card copy rules (no counts, figures or years) apply
 * here too: tests/seo/page-og-cards.test.ts checks the registry.
 */
function cardEntry(route: PageOgRoute): PageImageSEO {
    const card = PAGE_OG_CARDS[route];
    const summary = `${card.title}: ${card.subtitle}`;
    return {
        image: pageOgUrl(card),
        alt: `PMHNP Hiring share card. ${summary}`,
        caption: summary,
        title: card.title,
    };
}

export const PAGE_IMAGE_SEO: Record<string, PageImageSEO> = {
    // Audit 2026-08 C6: captions/alt in this registry must stay number-free.
    // Hardcoded stats in a static file can only drift from reality. Live
    // counts belong to DB-derived props.
    // The site-wide card; alt and caption repeat the text it shows.
    '/': {
        image: SITE_OG_URL,
        alt: `PMHNP Hiring share card. ${SITE_OG_CARD.title}: ${SITE_OG_CARD.subtitle}`,
        caption: `${SITE_OG_CARD.title}: ${SITE_OG_CARD.subtitle}`,
        title: 'PMHNP Hiring',
    },
    '/about': cardEntry('/about'),
    '/for-employers': cardEntry('/for-employers'),
    '/for-job-seekers': cardEntry('/for-job-seekers'),
    '/faq': cardEntry('/faq'),
    '/contact': cardEntry('/contact'),
    '/privacy': cardEntry('/privacy'),
    '/terms': cardEntry('/terms'),
    '/resources': cardEntry('/resources'),
    '/salary-guide': cardEntry('/salary-guide'),
    '/blog': cardEntry('/blog'),
    '/jobs': cardEntry('/jobs'),
    '/jobs/remote': cardEntry('/jobs/remote'),
    '/jobs/telehealth': cardEntry('/jobs/telehealth'),
    '/jobs/travel': cardEntry('/jobs/travel'),
    '/jobs/per-diem': cardEntry('/jobs/per-diem'),
    '/jobs/new-grad': cardEntry('/jobs/new-grad'),
    '/jobs/locations': cardEntry('/jobs/locations'),
    '/post-job': cardEntry('/post-job'),
    // '/job-alerts' removed (GSC Fix 2026-07 audit P3): the page is
    // permanently noindexed (app/job-alerts/layout.tsx) and was deliberately
    // dropped from the primary sitemap. Advertising it here reintroduced
    // the "submitted URL marked noindex" contradiction through the image
    // sitemap side door. Every entry in this registry must also be an
    // indexable page in the primary sitemap.
};

/**
 * Get all page image entries for building the image sitemap.
 */
export function getAllPageImages(): Array<{ url: string } & PageImageSEO> {
    return Object.entries(PAGE_IMAGE_SEO).map(([url, seo]) => ({ url, ...seo }));
}
