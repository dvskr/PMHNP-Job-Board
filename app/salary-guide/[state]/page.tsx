import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { hasLicensePost } from '@/lib/pseo/license-posts';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import {
    DollarSign,
    MapPin,
    Briefcase,
    TrendingUp,
    Building2,
    ArrowRight,
    BarChart3,
    Stethoscope,
    BookOpen,
    BadgeDollarSign,
} from 'lucide-react';
import {
    cleanSalaryRows,
    summarizeMidpoints,
    roundDisplayDollars,
} from '@/lib/salary-report/stats';
import { getOfferMarketData } from '@/lib/salary-report/market-data';

export const revalidate = 86400; // ISR daily

// ── State mappings ──────────────────────────────────────────────────────────

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

const SLUG_TO_STATE: Record<string, string> = {};
Object.keys(STATE_CODES).forEach((name) => {
    SLUG_TO_STATE[name.toLowerCase().replace(/\s+/g, '-')] = name;
});

const ALL_STATE_SLUGS = Object.keys(SLUG_TO_STATE);

// ── Data fetching ───────────────────────────────────────────────────────────

const SETTINGS = ['Telehealth', 'Outpatient', 'Inpatient', 'Remote'] as const;

interface SettingStat {
    setting: string;
    median: number;
    n: number;
}

/**
 * One row fetch per state; every dollar figure downstream is derived from
 * these rows through lib/salary-report/stats.ts (medians, quarantine,
 * tiered n-gating). Never aggregate means in SQL for display.
 */
async function getStateData(stateName: string) {
    const [rows, totalOpen] = await Promise.all([
        prisma.job.findMany({
            where: {
                isPublished: true,
                state: stateName,
                normalizedMinSalary: { not: null },
                normalizedMaxSalary: { not: null },
                salaryIsEstimated: false,
            },
            select: {
                normalizedMinSalary: true,
                normalizedMaxSalary: true,
                salaryIsEstimated: true,
                title: true,
                jobType: true,
            },
        }),
        prisma.job.count({ where: { isPublished: true, state: stateName } }),
    ]);

    const overall = cleanSalaryRows(rows);
    const summary = summarizeMidpoints(overall.midpoints);

    // Per-setting medians from the SAME row set. A setting only renders when
    // it clears the median tier (n >= 5) on its own.
    const bySetting: SettingStat[] = [];
    for (const setting of SETTINGS) {
        const settingRows = rows.filter(
            (r) =>
                r.title.toLowerCase().includes(setting.toLowerCase()) ||
                (r.jobType || '').toLowerCase().includes(setting.toLowerCase())
        );
        const clean = cleanSalaryRows(settingRows);
        const s = summarizeMidpoints(clean.midpoints);
        if (s.tier === 'full' || s.tier === 'median') {
            bySetting.push({ setting, median: s.median, n: s.n });
        }
    }
    bySetting.sort((a, b) => b.median - a.median);

    return { summary, bySetting, totalOpen, quarantined: overall.quarantined };
}

async function getTopEmployers(stateName: string) {
    const employers = await prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true, state: stateName },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
    });
    return employers.map((e) => ({ name: e.employer, jobCount: e._count.id }));
}

async function getTopCities(stateName: string) {
    const cities = await prisma.job.groupBy({
        by: ['city'],
        where: { isPublished: true, state: stateName, city: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
    });
    const stateCode = STATE_CODES[stateName] || '';
    return cities
        .filter((c) => c.city)
        .map((c) => ({
            name: c.city!,
            jobCount: c._count.id,
            slug: `${c.city!.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stateCode.toLowerCase()}`,
        }));
}

// ── Static Params ───────────────────────────────────────────────────────────

export async function generateStaticParams() {
    return ALL_STATE_SLUGS.map((slug) => ({ state: slug }));
}

// ── Metadata ────────────────────────────────────────────────────────────────

interface PageProps {
    params: Promise<{ state: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { state: slug } = await params;
    const stateName = SLUG_TO_STATE[slug];
    if (!stateName) return { title: 'State Not Found' };

    const code = STATE_CODES[stateName];

    // Empty-state defense lives in the page handler (notFound() when the
    // clean sample is below the 3-row floor). We deliberately do NOT
    // duplicate that gate here: generateMetadata + the page handler run in
    // parallel, so an extra count() here would double per-request DB load.
    const title = `PMHNP Salary in ${stateName} (${code}): 2026 Pay & Jobs`;
    const description = `Advertised PMHNP pay in ${stateName}: median and range from live postings, by practice setting, with top employers and open positions. Updated daily.`;
    const ogImage = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-salary-guide-2026.webp';

    return {
        title,
        description,
        alternates: { canonical: `https://pmhnphiring.com/salary-guide/${slug}` },
        openGraph: {
            title: `PMHNP Salary in ${stateName} (${code}): 2026 Data`,
            description: `Median advertised PMHNP pay in ${stateName} by practice setting, top employers, and open positions.`,
            type: 'website',
            url: `https://pmhnphiring.com/salary-guide/${slug}`,
            siteName: 'PMHNP Hiring',
            images: [{ url: ogImage, width: 1280, height: 900, alt: `PMHNP Salary in ${stateName} 2026` }],
        },
        twitter: {
            card: 'summary_large_image',
            title: `PMHNP Salary in ${stateName} (${code}) 2026`,
            description,
            images: [ogImage],
        },
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtK(n: number) {
    return `$${Math.round(roundDisplayDollars(n) / 1000)}K`;
}

/* Clay design tokens, matched to /tools and /salary-guide */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow:
        '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const loraHeading: React.CSSProperties = {
    fontFamily: 'var(--font-lora), Georgia, serif',
    fontWeight: 800,
    color: '#1A2E35',
};

// ── Page ────────────────────────────────────────────────────────────────────

export default async function StateSalaryPage({ params }: PageProps) {
    const { state: slug } = await params;
    const stateName = SLUG_TO_STATE[slug];
    if (!stateName) notFound();

    const stateCode = STATE_CODES[stateName];
    const stateSlug = slug;

    const [stateData, topEmployers, topCities, market] = await Promise.all([
        getStateData(stateName),
        getTopEmployers(stateName),
        getTopCities(stateName),
        getOfferMarketData(),
    ]);
    const { summary, bySetting, totalOpen } = stateData;

    // Gate: below 3 clean salary rows the page has nothing honest to say
    // about pay. notFound() (mirrored by the sitemap's >= 3 filter) beats a
    // thin render that Google files under soft-404.
    if (summary.tier === 'none') {
        notFound();
    }

    const national = summarizeMidpoints(market.national);
    const nationalMedian =
        national.tier === 'full' || national.tier === 'median' ? national.median : null;
    const stateMedian =
        summary.tier === 'full' || summary.tier === 'median' ? summary.median : null;

    const diffPct =
        stateMedian != null && nationalMedian != null && nationalMedian > 0
            ? Math.round(((stateMedian - nationalMedian) / nationalMedian) * 100)
            : null;

    const licenseSlug = `pmhnp-license-${slug}`;
    const showLicenseGuide = hasLicensePost(slug);

    // Hero stat cards: which cards render depends on the tier, and every
    // dollar figure carries its n.
    const statCards: { icon: React.ElementType; label: string; value: string; sub: string }[] = [];
    if (stateMedian != null) {
        statCards.push({
            icon: DollarSign,
            label: 'Median Advertised Pay',
            value: fmtK(stateMedian),
            sub:
                diffPct != null
                    ? `${Math.abs(diffPct)}% ${diffPct >= 0 ? 'above' : 'below'} the national median`
                    : `from ${summary.n} postings`,
        });
    }
    if (summary.tier === 'full') {
        statCards.push({
            icon: TrendingUp,
            label: 'Advertised Range',
            value: `${fmtK(summary.p25)} to ${fmtK(summary.p75)}`,
            sub: 'middle 50% of postings (p25 to p75)',
        });
    }
    statCards.push({
        icon: Briefcase,
        label: 'Open Positions',
        value: totalOpen.toLocaleString(),
        sub: `${summary.n} disclose a usable salary range`,
    });
    if (nationalMedian != null) {
        statCards.push({
            icon: BarChart3,
            label: 'National Median',
            value: fmtK(nationalMedian),
            sub: `all states, n=${national.n.toLocaleString()}`,
        });
    }

    const maxSettingMedian = bySetting.length > 0 ? bySetting[0].median : 0;

    return (
        <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
            <BreadcrumbSchema
                items={[
                    { name: 'Home', url: 'https://pmhnphiring.com' },
                    { name: 'Salary Guide', url: 'https://pmhnphiring.com/salary-guide' },
                    { name: stateName, url: `https://pmhnphiring.com/salary-guide/${stateSlug}` },
                ]}
            />

            {/* Hero */}
            <section style={{ padding: '20px 16px 40px', textAlign: 'center' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: '#F0FDFA',
                            border: '1px solid #99F6E4',
                            borderRadius: '999px',
                            padding: '6px 16px',
                            marginBottom: '20px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#0D9488',
                        }}
                    >
                        <MapPin size={14} /> {stateCode} Advertised Pay · Updated Daily
                    </div>

                    <h1
                        style={{
                            ...loraHeading,
                            fontSize: 'clamp(1.9rem, 4.5vw, 2.9rem)',
                            lineHeight: 1.15,
                            marginBottom: '14px',
                        }}
                    >
                        PMHNP Salary in {stateName}
                    </h1>

                    <p
                        style={{
                            fontSize: '16px',
                            color: '#5A4A42',
                            maxWidth: '620px',
                            margin: '0 auto',
                            lineHeight: 1.6,
                        }}
                    >
                        What employers are advertising for psychiatric nurse practitioners in{' '}
                        {stateName}: median pay from live postings, practice settings, top employers,
                        and cities. Advertised pay is not the same as what every working PMHNP earns.
                    </p>
                </div>
            </section>

            {/* Salary Overview Cards */}
            <section style={{ padding: '0 16px 56px', maxWidth: '960px', margin: '0 auto' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '16px',
                        marginBottom: '28px',
                    }}
                >
                    {statCards.map(({ icon: Ic, label, value, sub }) => (
                        <div key={label} style={{ ...clayCard, padding: '24px 20px' }}>
                            <div
                                style={{
                                    display: 'inline-flex',
                                    padding: '10px',
                                    borderRadius: '12px',
                                    background: '#F0FDFA',
                                    marginBottom: '10px',
                                }}
                            >
                                <Ic size={20} style={{ color: '#0D9488' }} />
                            </div>
                            <p style={{ fontSize: '12px', color: '#8A7A6E', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {label}
                            </p>
                            <p style={{ ...loraHeading, fontSize: '24px', marginBottom: '4px' }}>{value}</p>
                            <p style={{ fontSize: '12px', color: '#8A7A6E' }}>{sub}</p>
                        </div>
                    ))}
                </div>

                {/* Small-sample honesty note for the median-only tier */}
                {summary.tier === 'median' && (
                    <div style={{ ...clayCard, padding: '18px 24px', marginBottom: '28px', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        <p style={{ fontSize: '13px', color: '#92400E', margin: 0, lineHeight: 1.6 }}>
                            Only {summary.n} live {stateName} postings disclose a usable salary range,
                            so we publish the median alone. Percentile ranges need at least 10 postings.
                        </p>
                    </div>
                )}
                {summary.tier === 'countOnly' && (
                    <div style={{ ...clayCard, padding: '18px 24px', marginBottom: '28px', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        <p style={{ fontSize: '13px', color: '#92400E', margin: 0, lineHeight: 1.6 }}>
                            Only {summary.n} live {stateName} postings disclose a usable salary range,
                            which is below our 5-posting minimum for publishing dollar figures. Browse
                            the open positions below or compare against the national data instead.
                        </p>
                    </div>
                )}

                {/* Salary by Setting: each row cleared its own n >= 5 gate */}
                {bySetting.length > 0 && (
                    <div style={{ ...clayCard, padding: '32px 28px', marginBottom: '28px' }}>
                        <h2
                            style={{
                                ...loraHeading,
                                fontSize: '20px',
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            <Stethoscope size={20} style={{ color: '#0D9488' }} />
                            Median Advertised Pay by Practice Setting
                        </h2>
                        <p style={{ fontSize: '12.5px', color: '#8A7A6E', marginBottom: '20px' }}>
                            Settings appear only when at least 5 postings disclose a range.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {bySetting.map((s) => {
                                const pct = maxSettingMedian > 0
                                    ? Math.min(100, Math.round((s.median / maxSettingMedian) * 100))
                                    : 50;
                                return (
                                    <div key={s.setting}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#5A4A42' }}>
                                                {s.setting}
                                            </span>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35' }}>
                                                {fmtK(s.median)}
                                                <span style={{ fontWeight: 500, color: '#8A7A6E' }}> · n={s.n}</span>
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                height: '10px',
                                                borderRadius: '6px',
                                                background: '#F1EBE4',
                                                overflow: 'hidden',
                                                boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.06)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${pct}%`,
                                                    borderRadius: '6px',
                                                    background: 'linear-gradient(90deg, #5EEAD4, #0D9488)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Offer analyzer funnel */}
                {(summary.tier === 'full' || summary.tier === 'median') && (
                    <Link href="/tools/offer-analyzer" style={{ textDecoration: 'none' }}>
                        <div
                            style={{
                                ...clayCard,
                                padding: '20px 24px',
                                marginBottom: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                background: '#F0FDFA',
                                border: '1px solid #99F6E4',
                            }}
                        >
                            <BadgeDollarSign size={24} style={{ color: '#0D9488', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '15px', fontWeight: 700, color: '#134E4A', margin: 0 }}>
                                    Have an offer in {stateName}?
                                </p>
                                <p style={{ fontSize: '13px', color: '#0F766E', margin: 0 }}>
                                    See its percentile against these postings with the free Offer Analyzer.
                                    Your number never leaves your browser.
                                </p>
                            </div>
                            <ArrowRight size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                        </div>
                    </Link>
                )}

                {/* Two-column: Top Employers + Top Cities */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '20px',
                        marginBottom: '28px',
                    }}
                >
                    {topEmployers.length > 0 && (
                        <div style={{ ...clayCard, padding: '28px 24px' }}>
                            <h2
                                style={{
                                    ...loraHeading,
                                    fontSize: '18px',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <Building2 size={18} style={{ color: '#0D9488' }} />
                                Top Employers in {stateCode}
                            </h2>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {topEmployers.map((emp, i) => (
                                    <li
                                        key={emp.name}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 14px',
                                            borderRadius: '12px',
                                            backgroundColor: i % 2 === 0 ? '#FAF6F0' : 'transparent',
                                        }}
                                    >
                                        <span style={{ fontSize: '13px', color: '#5A4A42', fontWeight: 500 }}>
                                            {emp.name}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                color: '#0D9488',
                                                backgroundColor: '#F0FDFA',
                                                padding: '2px 10px',
                                                borderRadius: '999px',
                                            }}
                                        >
                                            {emp.jobCount} {emp.jobCount === 1 ? 'job' : 'jobs'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {topCities.length > 0 && (
                        <div style={{ ...clayCard, padding: '28px 24px' }}>
                            <h2
                                style={{
                                    ...loraHeading,
                                    fontSize: '18px',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <MapPin size={18} style={{ color: '#0D9488' }} />
                                Top Cities in {stateCode}
                            </h2>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {topCities.map((city, i) => (
                                    <li key={city.name}>
                                        <Link
                                            href={`/jobs/city/${city.slug}`}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '10px 14px',
                                                borderRadius: '12px',
                                                backgroundColor: i % 2 === 0 ? '#FAF6F0' : 'transparent',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: '13px', color: '#5A4A42', fontWeight: 500 }}>
                                                {city.name}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    color: '#0D9488',
                                                    backgroundColor: '#F0FDFA',
                                                    padding: '2px 10px',
                                                    borderRadius: '999px',
                                                }}
                                            >
                                                {city.jobCount} {city.jobCount === 1 ? 'job' : 'jobs'}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Methodology, mirrors the stats-engine contract */}
                <div style={{ ...clayCard, padding: '20px 24px', marginBottom: '28px', background: 'rgba(0,0,0,0.02)' }}>
                    <p style={{ fontSize: '12px', color: '#8A7A6E', margin: 0, lineHeight: 1.6 }}>
                        <strong>Methodology:</strong> figures are medians of advertised salary
                        midpoints in live {stateName} postings on this site. Employer-estimated
                        ranges are excluded; ranges with parsing defects (implausible bounds, max
                        more than 3× min, midpoints outside $50k to $500k) are quarantined. Every
                        figure ships with its sample size. Refreshed daily.
                    </p>
                </div>

                {/* Cross-links */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '16px',
                    }}
                >
                    <Link
                        href={`/jobs/state/${stateSlug}`}
                        style={{
                            ...clayCard,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '20px 24px',
                            textDecoration: 'none',
                        }}
                    >
                        <Briefcase size={22} style={{ color: '#0D9488', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '2px' }}>
                                Browse All {stateCode} PMHNP Jobs
                            </p>
                            <p style={{ fontSize: '12px', color: '#8A7A6E' }}>
                                {totalOpen} open positions in {stateName}
                            </p>
                        </div>
                    </Link>

                    {showLicenseGuide && (
                        <Link
                            href={`/blog/${licenseSlug}`}
                            style={{
                                ...clayCard,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '20px 24px',
                                textDecoration: 'none',
                            }}
                        >
                            <BookOpen size={22} style={{ color: '#0D9488', flexShrink: 0 }} />
                            <div>
                                <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '2px' }}>
                                    {stateName} Licensure Guide
                                </p>
                                <p style={{ fontSize: '12px', color: '#8A7A6E' }}>
                                    Requirements, process, and timeline
                                </p>
                            </div>
                        </Link>
                    )}

                    <Link
                        href="/salary-guide"
                        style={{
                            ...clayCard,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '20px 24px',
                            textDecoration: 'none',
                        }}
                    >
                        <BarChart3 size={22} style={{ color: '#0D9488', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '2px' }}>
                                National Salary Guide
                            </p>
                            <p style={{ fontSize: '12px', color: '#8A7A6E' }}>
                                Compare all 50 states
                            </p>
                        </div>
                    </Link>
                </div>
            </section>

            {/* CTA */}
            <section
                style={{
                    padding: '56px 16px',
                    textAlign: 'center',
                    background: 'linear-gradient(180deg, #FDFBF7 0%, #F5F0EB 100%)',
                }}
            >
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h2 style={{ ...loraHeading, fontSize: '24px', marginBottom: '12px' }}>
                        Find PMHNP Jobs in {stateName}
                    </h2>
                    <p style={{ fontSize: '15px', color: '#5A4A42', marginBottom: '24px' }}>
                        Browse {totalOpen} active positions and get daily alerts for new openings.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link
                            href={`/jobs/state/${stateSlug}`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '14px 28px',
                                borderRadius: '14px',
                                fontWeight: 700,
                                fontSize: '15px',
                                color: '#fff',
                                background: '#0D9488',
                                textDecoration: 'none',
                                boxShadow: '0 4px 16px rgba(13,148,136,0.25)',
                            }}
                        >
                            Browse {stateCode} Jobs <ArrowRight size={16} />
                        </Link>
                        <Link
                            href="/job-alerts"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '14px 28px',
                                borderRadius: '14px',
                                fontWeight: 600,
                                fontSize: '15px',
                                color: '#1A2E35',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid rgba(0,0,0,0.08)',
                                textDecoration: 'none',
                            }}
                        >
                            Get Job Alerts
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
