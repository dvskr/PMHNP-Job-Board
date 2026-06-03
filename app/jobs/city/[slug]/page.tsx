import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, TrendingUp, Building2, Bell, MapPinned, ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { JOB_LISTING_OMIT } from '@/lib/pseo/job-listing-omit';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Job } from '@/lib/types';
import { getMetroCity } from '@/lib/metro-data';
import CategoryHero from '@/components/CategoryHero';
import CategoryFAQ from '@/components/CategoryFAQ';
import { getCityBySlug } from '@/lib/pseo/city-data/cities';
import { buildCityFacts, buildCityNarrative } from '@/lib/pseo/city-narrative';

// Force dynamic rendering - don't try to statically generate during build
// force-dynamic removed: it overrides revalidate and defeats ISR caching
export const revalidate = 3600; // Revalidate every hour

// ─── State mappings ──────────────────────────────────────────────────────────

const STATE_CODES: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
    .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

// ─── Slug utilities ──────────────────────────────────────────────────────────

/**
 * Parse a city slug like "new-york-ny" into { cityName, stateName, stateCode }
 * The last segment (after the final hyphen) is the 2-letter state code.
 */
function parseCitySlug(slug: string): { cityName: string; stateName: string; stateCode: string } | null {
    const normalized = slug.toLowerCase().trim();

    // Extract the last 2-char segment as the state code
    const match = normalized.match(/^(.+)-([a-z]{2})$/);
    if (!match) return null;

    const [, citySlugPart, stateCodeRaw] = match;
    const stateCode = stateCodeRaw.toUpperCase();
    const stateName = CODE_TO_STATE[stateCode];

    if (!stateName) return null;

    // Convert city slug back to proper name (e.g. "new-york" → "New York")
    const cityName = citySlugPart
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return { cityName, stateName, stateCode };
}

/**
 * Build a city slug from city name and state code
 */
function buildCitySlug(cityName: string, stateCode: string): string {
    const sanitizedCity = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!sanitizedCity) return '';
    return `${sanitizedCity}-${stateCode.toLowerCase()}`;
}

/**
 * When a slug has no state code suffix (e.g. "virginia-beach" instead of "virginia-beach-va"),
 * look up the DB for any city that matches and return the canonical slug.
 */
async function resolveAmbiguousSlug(slug: string): Promise<string | null> {
    const normalized = slug.toLowerCase().trim();
    const cityName = normalized
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    // Find the first published job in a city matching this name
    const match = await prisma.job.findFirst({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            stateCode: { not: null },
        },
        select: { city: true, stateCode: true },
        orderBy: { createdAt: 'desc' },
    });

    if (match?.city && match?.stateCode) {
        return buildCitySlug(match.city, match.stateCode);
    }

    return null;
}

// ─── Data fetching ──────────────────────────────────────────────────────────

interface EmployerGroupResult {
    employer: string;
    _count: { employer: number };
}

interface ProcessedEmployer {
    name: string;
    count: number;
}

async function getCityJobs(cityName: string, stateName: string, stateCode: string) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        omit: JOB_LISTING_OMIT, // Perf1: cards don't use the full description body
        orderBy: [
            { isFeatured: 'desc' },
            { qualityScore: 'desc' },
            { originalPostedAt: 'desc' },
            { createdAt: 'desc' },
        ],
        take: 10,
    });

    return jobs;
}

async function getCityStats(cityName: string, stateName: string, stateCode: string) {
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
    });

    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
            normalizedMinSalary: { not: null },
            normalizedMaxSalary: { not: null },
        },
        _avg: {
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
        },
        _min: {
            normalizedMinSalary: true,
        },
        _max: {
            normalizedMaxSalary: true,
        },
    });

    const avgMinSalary = salaryData._avg.normalizedMinSalary || 0;
    const avgMaxSalary = salaryData._avg.normalizedMaxSalary || 0;
    const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000);
    const minSalary = salaryData._min.normalizedMinSalary
        ? Math.round(salaryData._min.normalizedMinSalary / 1000)
        : 0;
    const maxSalary = salaryData._max.normalizedMaxSalary
        ? Math.round(salaryData._max.normalizedMaxSalary / 1000)
        : 0;

    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        _count: {
            employer: true,
        },
        orderBy: {
            _count: {
                employer: 'desc',
            },
        },
        take: 5,
    });

    const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
        name: e.employer,
        count: e._count.employer,
    }));

    // True unique employer count (not limited by take:5)
    const uniqueEmployerRows = await prisma.job.findMany({
        where: {
            isPublished: true,
            city: { equals: cityName, mode: 'insensitive' },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        distinct: ['employer'],
        select: { employer: true },
    });

    return {
        totalJobs,
        avgSalary,
        minSalary,
        maxSalary,
        topEmployers: processedEmployers,
        uniqueEmployerCount: uniqueEmployerRows.length,
    };
}

/**
 * Fetch other cities in the same state for related links
 */
async function getRelatedCities(
    stateName: string,
    stateCode: string,
    currentCity: string
): Promise<{ name: string; count: number; slug: string }[]> {
    const cityData = await prisma.job.groupBy({
        by: ['city'],
        where: {
            isPublished: true,
            city: { not: null },
            OR: [
                { state: stateName },
                { stateCode: stateCode },
            ],
        },
        _count: {
            city: true,
        },
        orderBy: {
            _count: {
                city: 'desc',
            },
        },
        take: 12,
    });

    return cityData
        .filter(c => c.city && c.city.trim().length > 0 && c.city.toLowerCase() !== currentCity.toLowerCase())
        .slice(0, 8)
        .map(c => ({
            name: c.city as string,
            count: c._count.city,
            slug: buildCitySlug(c.city as string, stateCode),
        }));
}

// ─── Props & Metadata ────────────────────────────────────────────────────────

interface CityPageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
    try {
        const { slug } = await params;

        // Metro pages have their own metadata — skip if metro exists.
        // Audit 19 M-4 priority rule (now documented): when a slug resolves
        // to BOTH a metro and a city — e.g. "new-york-ny" matches the
        // New York metro AND the city "New York, NY" — the metro page
        // wins. Metros aggregate multiple cities under one geographic
        // brand (NY metro covers NYC + Yonkers + …) and have richer
        // editorial content than per-city pages. The redirect from
        // /jobs/city/* to /jobs/metro/* lives in app/jobs/city/[slug]/
        // page.tsx:354-358 (priority resolution path).
        const metroMatch = getMetroCity(slug);
        if (metroMatch) return { title: `PMHNP Jobs in ${metroMatch.city}` };

        let parsed = parseCitySlug(slug);

        if (!parsed) {
            // Try resolving slug without state code
            const canonical = await resolveAmbiguousSlug(slug);
            if (canonical) parsed = parseCitySlug(canonical);
            if (!parsed) return { title: 'City Not Found' };
        }

        const { cityName, stateName, stateCode } = parsed;
        const stats = await getCityStats(cityName, stateName, stateCode);

        // Title prioritizes count + city so SERP truncation lands in the salary
        // suffix rather than the city name (long names like "Colorado Springs"
        // were pushing the title past 60 chars and cutting "Avg" mid-phrase).
        // Salary appended only if there's room.
        const baseTitle = `${stats.totalJobs} PMHNP Jobs in ${cityName}, ${stateCode}`;
        const salarySuffix = stats.avgSalary > 0 ? ` — $${stats.avgSalary}k Avg` : '';
        const title = (baseTitle + salarySuffix).length <= 60
            ? baseTitle + salarySuffix
            : baseTitle;
        const description = `Find ${stats.totalJobs} PMHNP jobs in ${cityName}, ${stateName}. Psychiatric NP positions with salary transparency. Remote, telehealth, and in-person roles updated daily.`;

        return {
            title,
            description,
            openGraph: {
                title: `${stats.totalJobs} PMHNP Jobs in ${cityName}, ${stateCode}${salarySuffix}`,
                description,
                type: 'website',
                images: [{
                    url: `/api/og?type=page&title=${encodeURIComponent(`PMHNP Jobs in ${cityName}, ${stateCode}`)}&subtitle=${encodeURIComponent(`${stats.totalJobs} psychiatric NP positions`)}`,
                    width: 1200,
                    height: 630,
                    alt: `PMHNP Jobs in ${cityName}, ${stateCode}`,
                }],
            },
            alternates: {
                canonical: `https://pmhnphiring.com/jobs/city/${slug}`,
            },
            // Noindex for empty city pages with zero jobs
            ...(stats.totalJobs === 0 && {
                robots: {
                    index: false,
                    follow: true,
                },
            }),
        };
    } catch (error) {
        console.error('Error generating city metadata:', error);
        return {
            title: 'PMHNP Jobs by City',
            description: 'Find psychiatric mental health nurse practitioner jobs by city.',
        };
    }
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default async function CityJobsPage({ params }: CityPageProps) {
    const { slug } = await params;

    // ─── Metro redirect: curated metro pages take priority over generic city pages
    const metroMatch = getMetroCity(slug);
    if (metroMatch) redirect(`/jobs/metro/${slug}`);

    const parsed = parseCitySlug(slug);

    if (!parsed) {
        // Try resolving slug without state code → redirect to canonical URL
        const canonical = await resolveAmbiguousSlug(slug);
        if (canonical) {
            redirect(`/jobs/city/${canonical}`);
        }
        notFound();
    }

    const { cityName, stateName, stateCode } = parsed;

    // Fetch all data in parallel
    const [jobs, stats, relatedCities] = await Promise.all([
        getCityJobs(cityName, stateName, stateCode),
        getCityStats(cityName, stateName, stateCode),
        getRelatedCities(stateName, stateCode, cityName),
    ]);

    // SEO Fix: 404 thin city pages.
    // Aligns with sitemap gate (`_count.city >= 3` in app/sitemap.ts:230)
    // and the category×city template's MIN_JOBS_FOR_INDEX = 3 — pages
    // with 1-2 jobs were rendering with stub content and getting flagged
    // as soft 404 / thin content in GSC. The threshold matches the saved
    // pSEO policy (MIN_JOBS = 3, see memory seo_threshold_decision.md).
    const MIN_JOBS = 3;
    if (stats.totalJobs < MIN_JOBS) {
        notFound();
    }

    const stateSlug = stateName.toLowerCase().replace(/\s+/g, '-');

    const breadcrumbItems = [
        { label: 'Home', href: '/' },
        { label: 'Jobs', href: '/jobs' },
        { label: stateName, href: `/jobs/state/${stateSlug}` },
        { label: cityName },
    ];

    // P3.4 — Layer 2 → Layer 1: prefer LLM-generated DB override; fall back
    // to deterministic narrative built from structured city facts. Each
    // (city, totalJobs) tuple produces measurably different output, defeating
    // Google's "Crawled — currently not indexed" thin-content flag.
    const cityData = getCityBySlug(slug);
    let narrative: string | null = null;
    if (cityData) {
        const dbOverride = await prisma.citySnippet.findUnique({
            where: { citySlug: slug },
            select: { body: true, approvedAt: true },
        });
        if (dbOverride && dbOverride.approvedAt) {
            narrative = dbOverride.body;
        } else {
            narrative = buildCityNarrative(buildCityFacts(cityData), stats.totalJobs);
        }
    }

    const salaryRange = stats.minSalary > 0 && stats.maxSalary > 0
        ? `$${stats.minSalary}k–$${stats.maxSalary}k`
        : null;

    return (
        <div className="min-h-screen" style={{ background: '#FDFBF7' }}>
            {/* Breadcrumb Schema */}
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: stateName, url: `https://pmhnphiring.com/jobs/state/${stateSlug}` },
                { name: cityName, url: `https://pmhnphiring.com/jobs/city/${slug}` }
            ]} />

            {/* ItemList — recovers Google Jobs eligibility on the generic city
                surface (~4,135 URLs that previously emitted only Breadcrumb).
                Mirrors the schema block in lib/pseo/category-city-template.tsx. */}
            {jobs.length > 0 && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'ItemList',
                            name: `PMHNP Jobs in ${cityName}, ${stateCode}`,
                            numberOfItems: stats.totalJobs,
                            itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({
                                '@type': 'ListItem',
                                position: idx + 1,
                                name: job.title,
                                url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
                            })),
                        }),
                    }}
                />
            )}

            {/* Place schema — strengthens the geographic relevance signal. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'Place',
                        name: `${cityName}, ${stateCode}`,
                        address: {
                            '@type': 'PostalAddress',
                            addressLocality: cityName,
                            addressRegion: stateCode,
                            addressCountry: 'US',
                        },
                    }),
                }}
            />

            {/* ═══ HERO ═══ */}
            <CategoryHero
                bgColor="#7eb8c9"
                heroImage="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_states.webp"
                heroAlt={`PMHNP jobs in ${cityName}, ${stateCode}`}
                badgeText={`${stats.totalJobs} live roles · updated today`}
                breadcrumbs={['Careers', stateName, cityName]}
                headlineLine1={cityName}
                headlineLine2="PMHNP"
                headlineSub={`jobs in ${stateCode}, find your fit.`}
                stats={[
                    { value: `${stats.totalJobs}`, label: 'positions' },
                    { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+', label: 'avg salary' },
                    { value: `${stats.uniqueEmployerCount}+`, label: 'employers' },
                ]}
                description={`Browse ${stats.totalJobs} PMHNP positions in ${cityName}, ${stateName}. ${salaryRange ? `Salary range: ${salaryRange}/yr.` : ''} Remote, telehealth, inpatient, and outpatient roles updated daily.`}
                ctaLabel={`View All ${cityName} Jobs`}
                ctaHref={`/jobs?location=${encodeURIComponent(cityName)}`}
                secondaryCtaLabel="Set Alert"
                secondaryCtaHref={`/job-alerts?location=${encodeURIComponent(cityName + ', ' + stateCode)}`}
            />

            {/* ═══ JOB LISTINGS ═══ */}
            <div id="jobs" style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
                <div className="grid lg:grid-cols-4 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-3">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                                {cityName} Positions ({stats.totalJobs})
                            </h2>
                            <Link href={`/jobs/state/${stateSlug}`} style={{ fontSize: '14px', fontWeight: 600, color: '#0D9488', textDecoration: 'none' }}>
                                All {stateName} Jobs →
                            </Link>
                        </div>
                        {jobs.length === 0 ? (
                            <div className="text-center py-12 rounded-xl" style={{ background: '#FFF', borderRadius: '18px', padding: '48px 24px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                                <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: '#A09080' }} />
                                <h3 className="text-lg font-semibold mb-2" style={{ color: '#1A2E35' }}>No positions at this time</h3>
                                <p className="mb-6" style={{ color: '#5A4A42' }}>New {cityName} PMHNP openings are added daily.</p>
                                <Link href="/jobs" style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-block' }}>Browse All Jobs</Link>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                                    {jobs.map((job: Job) => (
                                        <JobCard key={job.id} job={job} />
                                    ))}
                                </div>

                                {/* Browse All CTA */}
                                {stats.totalJobs > 10 && (
                                    <div style={{ textAlign: 'center', marginTop: '32px' }}>
                                        <Link href={`/jobs?location=${encodeURIComponent(cityName)}`} className="city-card" style={{
                                            padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px',
                                            background: '#0D9488', color: '#fff', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                                            boxShadow: '4px 4px 12px rgba(13,148,136,0.2)',
                                        }}>
                                            View All {stats.totalJobs} Jobs in {cityName} <ArrowRight size={16} />
                                        </Link>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Job Alert CTA */}
                        <div style={{ background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', borderRadius: '18px', padding: '24px', border: '2px solid rgba(13,148,136,0.15)', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8)' }}>
                            <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                            <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>Get {cityName} Alerts</h3>
                            <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New listings delivered to your inbox daily.</p>
                            <Link href={`/job-alerts?location=${encodeURIComponent(cityName + ', ' + stateCode)}`} style={{ display: 'block', width: '100%', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none' }}>Create Alert</Link>
                        </div>

                        {/* Top Employers */}
                        {stats.topEmployers.length > 0 && (
                            <div style={{ background: '#FFF', borderRadius: '18px', padding: '24px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                    <Building2 size={20} style={{ color: '#0D9488' }} />
                                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Top Employers</h3>
                                </div>
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                    {stats.topEmployers.map((employer: ProcessedEmployer, i: number) => (
                                        <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                                            <span style={{ fontSize: '13px', color: '#5A4A42', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{employer.name}</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Salary */}
                        {stats.avgSalary > 0 && (
                            <div style={{ background: '#FFF', borderRadius: '18px', padding: '24px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                                <TrendingUp size={20} style={{ color: '#34D399', marginBottom: '12px' }} />
                                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35' }}>${stats.avgSalary}k</div>
                                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
                                {salaryRange && <div style={{ fontSize: '15px', fontWeight: 700, color: '#5A4A42', marginTop: '12px' }}>{salaryRange} range</div>}
                            </div>
                        )}

                        {/* Related Cities */}
                        {relatedCities.length > 0 && (
                            <div style={{ background: '#FFF', borderRadius: '18px', padding: '24px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: '0 0 16px' }}>More in {stateName}</h3>
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                    {relatedCities.map(city => (
                                        <li key={city.slug} style={{ padding: '6px 0' }}>
                                            <Link href={`/jobs/city/${city.slug}`} style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none', fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{city.name}</span>
                                                <span style={{ color: '#7A6A62', fontWeight: 700 }}>{city.count}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Quick Links */}
                        <div style={{ background: '#FFF', borderRadius: '18px', padding: '24px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: '0 0 16px' }}>Explore More</h3>
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {[
                                    { href: `/jobs/state/${stateSlug}`, label: `📍 All ${stateName} Jobs` },
                                    { href: `/salary-guide/${stateSlug}`, label: `💰 ${stateName} Salary Guide` },
                                    { href: '/jobs/remote', label: '🏠 Remote PMHNP Jobs' },
                                    { href: '/salary-guide', label: '📊 2026 Salary Guide' },
                                ].map(link => (
                                    <li key={link.href} style={{ padding: '6px 0' }}>
                                        <Link href={link.href} style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none', fontWeight: 500 }}>{link.label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ BENTO GRID — Why Choose This City ═══ */}
            <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
                <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 40px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Why This Market
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                        Why PMHNPs Choose {cityName}
                    </h2>
                    <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
                        {stats.totalJobs} open positions · {stats.uniqueEmployerCount}+ employers · {salaryRange ? `${salaryRange}/yr` : 'Competitive pay'}
                    </p>

                    <div className="city-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
                        {/* ROW 1: Job Market (8) + Employers (4) */}
                        <div className="city-bento-hero-1" style={{ gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', background: '#FFF', borderRadius: '18px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                            <div style={{ padding: '32px 28px' }}>
                                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Growing PMHNP Market</h3>
                                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                                    {cityName}, {stateName} has {stats.totalJobs} active PMHNP positions across {stats.uniqueEmployerCount}+ employers, with roles in outpatient, inpatient, and telehealth settings.
                                </p>
                            </div>
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_practice.webp" alt={`${cityName} PMHNP market`} width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                            </div>
                        </div>

                        <div className="city-bento-hero-2" style={{ gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#FFF', borderRadius: '18px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                            <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_growth.webp" alt="Career growth" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
                            </div>
                            <div style={{ padding: '24px 22px', flex: 1 }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Top Employers</h3>
                                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                                    {stats.topEmployers.slice(0, 3).map(e => e.name).join(', ')}{stats.topEmployers.length > 3 ? ` + ${stats.topEmployers.length - 3} more` : ''}.
                                </p>
                            </div>
                        </div>

                        {/* ROW 2: 4 compact cards */}
                        {[
                            { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp', text: `Average salary ${stats.avgSalary > 0 ? `$${stats.avgSalary}k/yr` : '$130K+'} for PMHNPs in ${cityName}.` },
                            { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_hospital.webp', text: `${stats.uniqueEmployerCount}+ healthcare employers actively hiring in ${cityName}.` },
                            { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_community.webp', text: `Inpatient, outpatient, community health, and private practice settings available.` },
                            { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp', text: `Telehealth and remote opportunities expanding in ${stateName}.` },
                        ].map((card, i) => (
                            <div key={i} style={{ gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center', background: '#FFF', borderRadius: '18px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                                <Image src={card.icon} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                                <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{card.text}</p>
                            </div>
                        ))}

                        {/* ROW 3: Salary (8) + Alert CTA (4) */}
                        <div className="city-bento-hero-3" style={{ gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', background: '#FFF', borderRadius: '18px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                            <div style={{ padding: '32px 28px' }}>
                                <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Salary Outlook</h3>
                                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                                    {cityName} PMHNPs earn {stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K–$200K'} annually. {salaryRange ? `Range: ${salaryRange}/yr.` : 'Competitive compensation with benefits.'}
                                </p>
                            </div>
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_salary.webp" alt={`${cityName} PMHNP salary`} width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                            </div>
                        </div>

                        <div className="city-bento-cta" style={{
                            gridColumn: 'span 4', padding: '28px 22px',
                            display: 'flex', flexDirection: 'column', justifyContent: 'center',
                            background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)',
                            borderRadius: '18px', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                        }}>
                            <Bell size={28} style={{ color: '#0D9488', marginBottom: '14px' }} />
                            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Job Alerts</h3>
                            <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                                New {cityName} listings delivered to your inbox — be first to apply.
                            </p>
                            <Link href={`/job-alerts?location=${encodeURIComponent(cityName + ', ' + stateCode)}`} style={{
                                padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                                background: '#0D9488', color: '#fff', textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                                boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                            }}>
                                Create Alert <ArrowRight size={14} />
                            </Link>
                        </div>
                    </div>
                </section>
            </div>

            {/* ═══ GETTING STARTED ═══ */}
            <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FFFA 50%, #F0FDFA 100%)' }}>
                <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Before You Apply
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
                        Getting Started in {cityName}
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                        {[
                            { step: '01', title: 'Check Licensure', text: `Verify your ${stateName} PMHNP licensure requirements. Each state has different scope-of-practice regulations.` },
                            { step: '02', title: 'Research Salary', text: `${cityName} PMHNPs earn ${stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+'} on average. Check our salary guide for ${stateName}.` },
                            { step: '03', title: 'Explore Settings', text: `Popular settings in ${cityName} include outpatient clinics, hospitals, telehealth, and community health centers.` },
                            { step: '04', title: 'Apply', text: `Browse ${stats.totalJobs}+ positions in ${cityName} and set up job alerts to be the first to apply.` },
                        ].map(r => (
                            <div key={r.step} style={{ background: '#FFF', borderRadius: '18px', padding: '28px 24px', borderTop: '3px solid #0D9488', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>{r.step}</span>
                                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>{r.title}</h3>
                                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{r.text}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* ═══ EXPLORE MORE ═══ */}
            <div style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF3E8 50%, #FFF8F0 100%)' }}>
                <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Keep Exploring
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
                        More Ways to Find Your Next Role
                    </h2>
                    <div className="city-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                        {[
                            { href: `/jobs/state/${stateSlug}`, label: `${stateName} Jobs`, sub: `All ${stateCode} positions`, icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' },
                            { href: '/jobs/remote', label: 'Remote', sub: 'Work from anywhere', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' },
                            { href: '/jobs/new-grad', label: 'New Grad', sub: 'Entry-level roles', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_newgrad.webp' },
                            { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual patient care', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' },
                            { href: `/salary-guide/${stateSlug}`, label: 'Salary Guide', sub: `${stateName} comp data`, icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp' },
                            { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' },
                        ].map(c => (
                            <Link key={c.href} href={c.href} className="city-card" style={{ background: '#FFF', borderRadius: '18px', padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center', boxShadow: '6px 6px 20px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)', transition: 'transform 0.3s ease, box-shadow 0.3s ease' }}>
                                <Image src={c.icon} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
                                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>

            {/* ═══ INTERNAL LINKING MESH ═══ */}
            <div style={{ background: '#FDFBF7' }}>
                <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Nearby Markets
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
                        PMHNP Jobs Near {cityName}
                    </h2>

                    {/* Related Cities in Same State */}
                    {relatedCities.length > 0 && (
                        <div style={{ marginBottom: '40px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px' }}>
                                More {stateName} Cities
                            </h3>
                            <div className="city-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                {relatedCities.map(city => (
                                    <Link key={city.slug} href={`/jobs/city/${city.slug}`} className="city-card" style={{
                                        background: '#FFF', borderRadius: '14px', padding: '16px 18px', textDecoration: 'none',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        boxShadow: '4px 4px 14px rgba(0,0,0,0.05), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', display: 'block' }}>{city.name}</span>
                                            <span style={{ fontSize: '12px', color: '#7A6A62' }}>{city.count} jobs</span>
                                        </div>
                                        <ArrowRight size={14} style={{ color: '#0D9488' }} />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* State & Resource Links */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                        {[
                            { href: `/jobs/state/${stateSlug}`, label: `All ${stateName} PMHNP Jobs`, desc: `Browse every open position in ${stateCode}`, icon: '📍' },
                            { href: `/salary-guide/${stateSlug}`, label: `${stateName} Salary Guide`, desc: `Compensation data and trends`, icon: '💰' },
                            { href: '/jobs/locations', label: 'All Locations', desc: 'PMHNP jobs in all 50 states', icon: '🗺️' },
                            { href: '/jobs/remote', label: 'Remote PMHNP Jobs', desc: 'Work from anywhere positions', icon: '🏠' },
                            { href: '/jobs/telehealth', label: 'Telehealth Positions', desc: 'Virtual care opportunities', icon: '💻' },
                        ].map(link => (
                            <Link key={link.href} href={link.href} className="city-card" style={{
                                background: '#FFF', borderRadius: '16px', padding: '20px', textDecoration: 'none',
                                display: 'flex', alignItems: 'flex-start', gap: '14px',
                                boxShadow: '4px 4px 14px rgba(0,0,0,0.05), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                            }}>
                                <span style={{ fontSize: '24px', flexShrink: 0 }}>{link.icon}</span>
                                <div>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '2px' }}>{link.label}</span>
                                    <span style={{ fontSize: '12px', color: '#7A6A62', lineHeight: 1.4 }}>{link.desc}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>

            {/* ═══ MARKET CONTEXT — unique-per-city narrative (P3.4) ═══ */}
            {/* Placed below jobs so candidates see listings first; Google still
                indexes the HTML regardless of viewport position. */}
            {narrative && (
                <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '8px 24px 40px' }}>
                    <div
                        id="market-context"
                        data-speakable="true"
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '20px',
                            border: '1px solid rgba(0,0,0,0.06)',
                            padding: '24px 28px',
                            boxShadow: '6px 6px 16px rgba(0,0,0,0.05), -3px -3px 10px rgba(255,255,255,0.8)',
                        }}
                    >
                        <h2
                            className="font-lora"
                            style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', marginBottom: '10px' }}
                        >
                            {cityName}, {stateCode} — PMHNP Market Context
                        </h2>
                        <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#5A4A42', margin: 0 }}>
                            {narrative}
                        </p>
                    </div>
                </section>
            )}

            {/* ═══ FAQ ═══ */}
            <CategoryFAQ category="remote" totalJobs={stats.totalJobs} avgSalary={stats.avgSalary} customFaqs={[
                { question: `How many PMHNP jobs are in ${cityName}?`, answer: `There are currently ${stats.totalJobs} active PMHNP positions in ${cityName}, ${stateName}. New roles are added daily across outpatient, inpatient, telehealth, and community health settings.` },
                { question: `What is the average PMHNP salary in ${cityName}?`, answer: stats.avgSalary > 0 ? `PMHNPs in ${cityName} earn an average salary of $${stats.avgSalary}k per year.${salaryRange ? ` The range is ${salaryRange}/yr depending on experience, setting, and whether the position is W-2 or 1099.` : ''}` : `PMHNP salaries in ${cityName} typically range from $130,000 to $200,000+ per year, depending on experience, practice setting, and employment type.` },
                { question: `What types of PMHNP jobs are available in ${cityName}?`, answer: `${cityName} offers a variety of PMHNP positions including outpatient clinics, inpatient psychiatric units, community health centers, private practices, telehealth roles, and substance abuse treatment facilities. Both full-time and part-time options are available.` },
                { question: `Who are the top PMHNP employers in ${cityName}?`, answer: `Top employers hiring PMHNPs in ${cityName} include ${stats.topEmployers.slice(0, 5).map(e => e.name).join(', ')}. These organizations offer competitive salaries, benefits, and growth opportunities.` },
                { question: `Do I need a ${stateName} license to work as a PMHNP in ${cityName}?`, answer: `Yes, you need an active ${stateName} nursing license and PMHNP certification to practice in ${cityName}. Requirements vary by state — check our ${stateName} licensure guide for specific details on scope of practice, prescriptive authority, and continuing education requirements.` },
            ]} />

            {/* ═══ Hover + Responsive CSS ═══ */}
            <style>{`
                .city-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
                .city-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
                @media (max-width: 768px) {
                    .city-bento-grid { grid-template-columns: 1fr !important; }
                    .city-bento-hero-1, .city-bento-hero-2, .city-bento-hero-3, .city-bento-cta { grid-column: span 1 !important; }
                    .city-bento-hero-1, .city-bento-hero-3 { grid-template-columns: 1fr !important; }
                    .city-bento-grid > div { grid-column: span 1 !important; }
                    .city-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
                }
                @media (min-width: 769px) and (max-width: 1024px) {
                    .city-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
                    .city-bento-hero-1, .city-bento-hero-3 { grid-column: span 6 !important; }
                    .city-bento-hero-2, .city-bento-cta { grid-column: span 6 !important; }
                    .city-bento-grid > div:not(.city-bento-hero-1):not(.city-bento-hero-2):not(.city-bento-hero-3):not(.city-bento-cta) { grid-column: span 3 !important; }
                }
            `}</style>
        </div>
    );
}

