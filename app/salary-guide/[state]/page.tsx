import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
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
} from 'lucide-react';

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

async function getStateSalaryData(stateName: string) {
    const stats = await prisma.job.aggregate({
        where: {
            isPublished: true,
            state: stateName,
            normalizedMinSalary: { not: null },
        },
        _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
        _min: { normalizedMinSalary: true },
        _max: { normalizedMaxSalary: true },
        _count: { id: true },
    });

    const avgMin = stats._avg.normalizedMinSalary || 0;
    const avgMax = stats._avg.normalizedMaxSalary || 0;

    return {
        avgSalary: Math.round((avgMin + avgMax) / 2),
        minSalary: Math.round(stats._min.normalizedMinSalary || 0),
        maxSalary: Math.round(stats._max.normalizedMaxSalary || 0),
        jobCount: stats._count.id,
    };
}

async function getStateSalaryBySetting(stateName: string) {
    const settings = ['Telehealth', 'Outpatient', 'Inpatient', 'Remote'];
    const results = await Promise.all(
        settings.map(async (setting) => {
            const jobs = await prisma.job.aggregate({
                where: {
                    isPublished: true,
                    state: stateName,
                    normalizedMinSalary: { not: null },
                    OR: [
                        { title: { contains: setting, mode: 'insensitive' } },
                        { jobType: { contains: setting, mode: 'insensitive' } },
                    ],
                },
                _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
                _count: { id: true },
            });
            const aMin = jobs._avg.normalizedMinSalary || 0;
            const aMax = jobs._avg.normalizedMaxSalary || 0;
            return {
                setting,
                avgSalary: Math.round((aMin + aMax) / 2),
                jobCount: jobs._count.id,
            };
        })
    );
    return results.filter((r) => r.jobCount > 0);
}

async function getTopEmployers(stateName: string) {
    const employers = await prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true, state: stateName },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
    });
    return employers.map((e) => ({
        name: e.employer,
        jobCount: e._count.id,
    }));
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

async function getNationalAvg() {
    const stats = await prisma.job.aggregate({
        where: { isPublished: true, normalizedMinSalary: { not: null } },
        _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    });
    const aMin = stats._avg.normalizedMinSalary || 120000;
    const aMax = stats._avg.normalizedMaxSalary || 150000;
    return Math.round((aMin + aMax) / 2);
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
    return {
        title: `PMHNP Salary in ${stateName} (${code}) 2026 — Average Pay, Jobs & Cost of Living`,
        description: `Explore PMHNP salary data for ${stateName}. See average pay by setting, top employers, and open positions. Updated daily.`,
        alternates: { canonical: `https://pmhnphiring.com/salary-guide/${slug}` },
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatSalary(n: number) {
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${n.toLocaleString()}`;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function StateSalaryPage({ params }: PageProps) {
    const { state: slug } = await params;
    const stateName = SLUG_TO_STATE[slug];
    if (!stateName) notFound();

    const stateCode = STATE_CODES[stateName];
    const stateSlug = slug;

    const [salaryData, bySetting, topEmployers, topCities, nationalAvg] = await Promise.all([
        getStateSalaryData(stateName),
        getStateSalaryBySetting(stateName),
        getTopEmployers(stateName),
        getTopCities(stateName),
        getNationalAvg(),
    ]);

    const diff = salaryData.avgSalary - nationalAvg;
    const diffPct = nationalAvg > 0 ? Math.round((diff / nationalAvg) * 100) : 0;
    const aboveBelow = diff >= 0 ? 'above' : 'below';

    // Find the licensure blog post slug
    const licenseSlug = `pmhnp-license-${slug}`;

    return (
        <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
            <BreadcrumbSchema
                items={[
                    { name: 'Home', url: 'https://pmhnphiring.com' },
                    { name: 'Salary Guide', url: 'https://pmhnphiring.com/salary-guide' },
                    { name: stateName, url: `https://pmhnphiring.com/salary-guide/${stateSlug}` },
                ]}
            />

            {/* Hero */}
            <section style={{ padding: '72px 16px 48px', textAlign: 'center' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(45,212,191,0.1)',
                            border: '1px solid rgba(45,212,191,0.2)',
                            borderRadius: '999px',
                            padding: '6px 16px',
                            marginBottom: '20px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#2DD4BF',
                        }}
                    >
                        <MapPin size={14} /> {stateCode} Salary Data · Updated Daily
                    </div>

                    <h1
                        style={{
                            fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            lineHeight: 1.15,
                            marginBottom: '14px',
                        }}
                    >
                        PMHNP Salary in {stateName}
                    </h1>

                    <p
                        style={{
                            fontSize: '16px',
                            color: 'var(--text-secondary)',
                            maxWidth: '600px',
                            margin: '0 auto',
                            lineHeight: 1.6,
                        }}
                    >
                        Average psychiatric nurse practitioner compensation in {stateName}, broken down by
                        practice setting, top employers, and cities.
                    </p>
                </div>
            </section>

            {/* Salary Overview Cards */}
            <section style={{ padding: '0 16px 64px', maxWidth: '900px', margin: '0 auto' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '16px',
                        marginBottom: '32px',
                    }}
                >
                    {[
                        {
                            icon: DollarSign,
                            label: 'Average Salary',
                            value: formatSalary(salaryData.avgSalary),
                            sub: `${Math.abs(diffPct)}% ${aboveBelow} national avg`,
                            color: '#2DD4BF',
                        },
                        {
                            icon: TrendingUp,
                            label: 'Salary Range',
                            value: `${formatSalary(salaryData.minSalary)} – ${formatSalary(salaryData.maxSalary)}`,
                            sub: 'Min – Max reported',
                            color: '#E86C2C',
                        },
                        {
                            icon: Briefcase,
                            label: 'Open Positions',
                            value: salaryData.jobCount.toLocaleString(),
                            sub: `Active jobs in ${stateCode}`,
                            color: '#A855F7',
                        },
                        {
                            icon: BarChart3,
                            label: 'National Average',
                            value: formatSalary(nationalAvg),
                            sub: 'All 50 states',
                            color: '#3B82F6',
                        },
                    ].map(({ icon: Ic, label, value, sub, color }) => (
                        <div
                            key={label}
                            style={{
                                padding: '24px 20px',
                                borderRadius: '16px',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <Ic size={22} style={{ color, marginBottom: '10px' }} />
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {label}
                            </p>
                            <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {value}
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sub}</p>
                        </div>
                    ))}
                </div>

                {/* Salary by Setting */}
                {bySetting.length > 0 && (
                    <div
                        style={{
                            padding: '32px 28px',
                            borderRadius: '18px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            marginBottom: '32px',
                        }}
                    >
                        <h2
                            style={{
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            <Stethoscope size={20} style={{ color: '#2DD4BF' }} />
                            Salary by Practice Setting
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {bySetting.sort((a, b) => b.avgSalary - a.avgSalary).map((s) => {
                                const pct = salaryData.maxSalary > 0
                                    ? Math.min(100, Math.round((s.avgSalary / salaryData.maxSalary) * 100))
                                    : 50;
                                return (
                                    <div key={s.setting}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {s.setting}
                                            </span>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {formatSalary(s.avgSalary)}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                height: '8px',
                                                borderRadius: '4px',
                                                backgroundColor: 'var(--bg-tertiary)',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${pct}%`,
                                                    borderRadius: '4px',
                                                    background: 'linear-gradient(90deg, #2DD4BF, #0D9488)',
                                                    transition: 'width 0.5s',
                                                }}
                                            />
                                        </div>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {s.jobCount} {s.jobCount === 1 ? 'position' : 'positions'}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Two-column: Top Employers + Top Cities */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '24px',
                        marginBottom: '32px',
                    }}
                >
                    {/* Top Employers */}
                    {topEmployers.length > 0 && (
                        <div
                            style={{
                                padding: '28px 24px',
                                borderRadius: '18px',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <h2
                                style={{
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <Building2 size={18} style={{ color: '#E86C2C' }} />
                                Top Employers in {stateCode}
                            </h2>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {topEmployers.map((emp, i) => (
                                    <li
                                        key={emp.name}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            backgroundColor: i % 2 === 0 ? 'var(--bg-tertiary)' : 'transparent',
                                        }}
                                    >
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            {emp.name}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                color: '#E86C2C',
                                                backgroundColor: 'rgba(232,108,44,0.1)',
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

                    {/* Top Cities */}
                    {topCities.length > 0 && (
                        <div
                            style={{
                                padding: '28px 24px',
                                borderRadius: '18px',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <h2
                                style={{
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <MapPin size={18} style={{ color: '#A855F7' }} />
                                Top Cities in {stateCode}
                            </h2>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {topCities.map((city, i) => (
                                    <li key={city.name}>
                                        <Link
                                            href={`/jobs/city/${city.slug}`}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '10px 14px',
                                                borderRadius: '10px',
                                                backgroundColor: i % 2 === 0 ? 'var(--bg-tertiary)' : 'transparent',
                                                textDecoration: 'none',
                                                transition: 'background 0.2s',
                                            }}
                                        >
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                {city.name}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    color: '#A855F7',
                                                    backgroundColor: 'rgba(168,85,247,0.1)',
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

                {/* Cross-links (C17 + C18) */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '16px',
                    }}
                >
                    {/* C17: Link to state jobs page */}
                    <Link
                        href={`/jobs/state/${stateSlug}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '20px 24px',
                            borderRadius: '14px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            textDecoration: 'none',
                            transition: 'border-color 0.3s',
                        }}
                    >
                        <Briefcase size={22} style={{ color: '#2DD4BF', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                                Browse All {stateCode} PMHNP Jobs →
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {salaryData.jobCount} open positions in {stateName}
                            </p>
                        </div>
                    </Link>

                    {/* Link to licensure guide */}
                    <Link
                        href={`/blog/${licenseSlug}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '20px 24px',
                            borderRadius: '14px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            textDecoration: 'none',
                            transition: 'border-color 0.3s',
                        }}
                    >
                        <BookOpen size={22} style={{ color: '#E86C2C', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                                {stateName} Licensure Guide →
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Requirements, process & timeline
                            </p>
                        </div>
                    </Link>

                    {/* Link to national salary guide */}
                    <Link
                        href="/salary-guide"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '20px 24px',
                            borderRadius: '14px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            textDecoration: 'none',
                            transition: 'border-color 0.3s',
                        }}
                    >
                        <BarChart3 size={22} style={{ color: '#3B82F6', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                                National Salary Guide →
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Compare all 50 states
                            </p>
                        </div>
                    </Link>
                </div>
            </section>

            {/* CTA */}
            <section
                style={{
                    padding: '64px 16px',
                    textAlign: 'center',
                    backgroundColor: 'var(--bg-secondary)',
                }}
            >
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h2
                        style={{
                            fontSize: '24px',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            marginBottom: '12px',
                        }}
                    >
                        Find PMHNP Jobs in {stateName}
                    </h2>
                    <p
                        style={{
                            fontSize: '15px',
                            color: 'var(--text-secondary)',
                            marginBottom: '24px',
                        }}
                    >
                        Browse {salaryData.jobCount} active positions and get daily alerts for new openings.
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
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                textDecoration: 'none',
                                boxShadow: '0 4px 16px rgba(45,212,191,0.25)',
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
                                color: 'var(--text-primary)',
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
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
