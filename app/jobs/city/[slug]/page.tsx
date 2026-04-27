import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { MapPin, TrendingUp, Building2, Bell, MapPinned } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Job } from '@/lib/types';
import { getMetroCity } from '@/lib/metro-data';
import CategoryHero from '@/components/CategoryHero';

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
        orderBy: [
            { isFeatured: 'desc' },
            { createdAt: 'desc' },
        ],
        take: 50,
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

    return {
        totalJobs,
        avgSalary,
        minSalary,
        maxSalary,
        topEmployers: processedEmployers,
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

        // Metro pages have their own metadata — skip if metro exists
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

        const salaryStr = stats.avgSalary > 0 ? ` | $${stats.avgSalary}k Avg` : '';
        const title = `PMHNP Jobs in ${cityName}, ${stateCode} | ${stats.totalJobs} Open Positions${salaryStr}`;
        const description = `Find ${stats.totalJobs} PMHNP jobs in ${cityName}, ${stateName}. Psychiatric NP positions with salary transparency. Remote, telehealth, and in-person roles updated daily.`;

        return {
            title,
            description,
            openGraph: {
                title: `${stats.totalJobs} PMHNP Jobs in ${cityName}, ${stateCode}${salaryStr}`,
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

    let parsed = parseCitySlug(slug);

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

    // SEO Fix: Return real 404 for cities with 0 jobs.
    // Previously rendered 200 + "No jobs right now" → Google flagged as soft 404.
    // Clean 404 stops crawl budget waste and eliminates soft 404 GSC errors.
    if (stats.totalJobs === 0) {
        notFound();
    }

    const stateSlug = stateName.toLowerCase().replace(/\s+/g, '-');

    const breadcrumbItems = [
        { label: 'Home', href: '/' },
        { label: 'Jobs', href: '/jobs' },
        { label: stateName, href: `/jobs/state/${stateSlug}` },
        { label: cityName },
    ];

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

            {/* ═══ HERO ═══ */}
            <CategoryHero
                bgColor="#7eb8c9"
                heroImage="/images/categories/hero_wc_states.png"
                heroAlt={`PMHNP jobs in ${cityName}, ${stateCode}`}
                badgeText={`${stats.totalJobs} live roles · updated today`}
                breadcrumbs={['Careers', stateName, cityName]}
                headlineLine1={cityName}
                headlineLine2="PMHNP"
                headlineSub={`jobs in ${stateCode}, find your fit.`}
                stats={[
                    { value: `${stats.totalJobs}`, label: 'positions' },
                    { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+', label: 'avg salary' },
                    { value: `${stats.topEmployers.length}+`, label: 'employers' },
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
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                            {jobs.map((job: Job) => (
                                <JobCard key={job.id} job={job} />
                            ))}
                        </div>
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
        </div>
    );
}

