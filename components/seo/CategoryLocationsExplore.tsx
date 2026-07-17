/**
 * CategoryLocationsExplore — pseoStats-gated state + city link grid.
 *
 * Why this exists: category landing pages (e.g. /jobs/full-time) used to
 * link only to sibling categories, leaving thousands of taxonomy×state and
 * taxonomy×city URLs orphaned in Google's "Discovered — currently not
 * indexed" bucket. Adding internal links from a category landing into its
 * own populated state/city pages is the strongest signal we can send that
 * those pSEO pages matter — Google needs internal-link votes, not just
 * sitemap entries, before promoting a page from "discovered" to "indexed".
 *
 * Gating rule (GSC Fix, 2026-07 audit): every link rendered here is
 * filtered through `pseoStats` with `totalJobs >= MIN_JOBS_FOR_CATEGORY_CITY`
 * and the 36h freshness window — the linked category-city pages hard-404
 * below the render gate and setting-state pages noindex below it, so the
 * previous ≥1 gate steadily fed Googlebot doomed URLs. City links are only
 * emitted for categories still in the city sitemaps (retired categories
 * render noindex). Queries are guarded — a pseoStats hiccup renders nothing
 * rather than 500ing the category landing page.
 *
 * Server component — runs in the RSC pass, no client JS shipped.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getCityBySlug } from '@/lib/pseo/city-data/cities';
import { CODE_TO_STATE } from '@/lib/pseo/setting-state-config';
import { MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate';
import { CITY_SITEMAP_CATEGORIES } from '@/lib/pseo/jobs-segments-edge';

const CITY_SITEMAP_CATEGORY_SET = new Set<string>(CITY_SITEMAP_CATEGORIES);
// Mirrors PSEO_STALENESS_HOURS in the sitemap routes — stale aggregator rows
// must not keep links alive for pages whose jobs already expired.
const PSEO_STALENESS_HOURS = 36;

interface CategoryLocationsExploreProps {
    /** The category slug, matching pseoStats.categorySlug (e.g. 'full-time'). */
    categorySlug: string;
    /** Display label shown in headings (e.g. 'Full-Time'). */
    categoryLabel: string;
    /** Max state links to render. Default 12. */
    stateLimit?: number;
    /** Max city links to render. Default 18. */
    cityLimit?: number;
}

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '14px',
    border: '1px solid rgba(0,0,0,0.05)',
    boxShadow: '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 8px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.5)',
};

function slugToStateName(slug: string): string {
    // Try the slug→full-name map; if not found, title-case the slug
    // (defensive — every populated state slug should be in CODE_TO_STATE).
    const lookup = Object.entries(CODE_TO_STATE).find(
        ([, name]) => name.toLowerCase().replace(/\s+/g, '-') === slug,
    );
    if (lookup) return lookup[1];
    return slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

export default async function CategoryLocationsExplore({
    categorySlug,
    categoryLabel,
    stateLimit = 12,
    cityLimit = 18,
}: CategoryLocationsExploreProps) {
    // Two parallel pseoStats queries — both indexed on (type, locationSlug)
    // and (categorySlug). Gate at the render threshold so we never link a
    // page that 404s (category-city below 3) or noindexes (setting-state
    // below 3). Retired categories get no city links at all — their city
    // pages render noindex (P2.3).
    const freshnessThreshold = new Date(Date.now() - PSEO_STALENESS_HOURS * 60 * 60 * 1000);
    let stateRows: Array<{ locationSlug: string; totalJobs: number }> = [];
    let cityRows: Array<{ locationSlug: string; totalJobs: number }> = [];
    try {
        [stateRows, cityRows] = await Promise.all([
            prisma.pseoStats.findMany({
                where: {
                    type: 'setting-state',
                    categorySlug,
                    totalJobs: { gte: MIN_JOBS_FOR_CATEGORY_CITY },
                    updatedAt: { gte: freshnessThreshold },
                },
                select: { locationSlug: true, totalJobs: true },
                orderBy: { totalJobs: 'desc' },
                take: stateLimit,
            }),
            CITY_SITEMAP_CATEGORY_SET.has(categorySlug)
                ? prisma.pseoStats.findMany({
                    where: {
                        type: 'category-city',
                        categorySlug,
                        totalJobs: { gte: MIN_JOBS_FOR_CATEGORY_CITY },
                        updatedAt: { gte: freshnessThreshold },
                    },
                    select: { locationSlug: true, totalJobs: true },
                    orderBy: { totalJobs: 'desc' },
                    take: cityLimit,
                })
                : Promise.resolve([]),
        ]);
    } catch (err) {
        console.error('[CategoryLocationsExplore] pseoStats lookup failed; rendering nothing:', err);
    }

    // Resolve city display names; drop any whose slug isn't in CITIES (stale row).
    const cityLinks = cityRows
        .map((row) => {
            const city = getCityBySlug(row.locationSlug);
            if (!city) return null;
            return {
                href: `/jobs/${categorySlug}/city/${row.locationSlug}`,
                label: `${city.name}, ${city.stateCode}`,
                count: row.totalJobs,
            };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

    const stateLinks = stateRows.map((row) => ({
        href: `/jobs/${categorySlug}/${row.locationSlug}`,
        label: slugToStateName(row.locationSlug),
        count: row.totalJobs,
    }));

    // If both sections are empty (new category with no aggregated stats yet),
    // render nothing rather than an empty section title.
    if (stateLinks.length === 0 && cityLinks.length === 0) return null;

    return (
        <section
            style={{
                background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)',
            }}
        >
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
                <p
                    style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#0D9488',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                        textAlign: 'center',
                        marginBottom: '8px',
                    }}
                >
                    By Location
                </p>
                <h2
                    className="font-lora"
                    style={{
                        fontSize: 'clamp(24px, 3.2vw, 34px)',
                        fontWeight: 700,
                        color: '#1A2E35',
                        textAlign: 'center',
                        marginBottom: '40px',
                    }}
                >
                    {categoryLabel} PMHNP Jobs by Location
                </h2>

                {stateLinks.length > 0 && (
                    <div style={{ marginBottom: cityLinks.length > 0 ? '40px' : 0 }}>
                        <h3
                            style={{
                                fontSize: '15px',
                                fontWeight: 700,
                                color: '#1A2E35',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginBottom: '16px',
                                textAlign: 'center',
                            }}
                        >
                            Top States
                        </h3>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '10px',
                            }}
                        >
                            {stateLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    style={{
                                        ...clayCard,
                                        padding: '14px 18px',
                                        textDecoration: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: '#1A2E35',
                                        }}
                                    >
                                        {link.label}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: '#0D9488',
                                        }}
                                    >
                                        {link.count}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {cityLinks.length > 0 && (
                    <div>
                        <h3
                            style={{
                                fontSize: '15px',
                                fontWeight: 700,
                                color: '#1A2E35',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginBottom: '16px',
                                textAlign: 'center',
                            }}
                        >
                            Top Cities
                        </h3>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '10px',
                            }}
                        >
                            {cityLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    style={{
                                        ...clayCard,
                                        padding: '14px 18px',
                                        textDecoration: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: '#1A2E35',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {link.label}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: '#0D9488',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {link.count}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                    <Link
                        href="/jobs/locations"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 24px',
                            borderRadius: '12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            background: '#fff',
                            color: '#0D9488',
                            border: '1px solid rgba(13,148,136,0.2)',
                            textDecoration: 'none',
                        }}
                    >
                        Browse all locations <ArrowRight size={14} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
