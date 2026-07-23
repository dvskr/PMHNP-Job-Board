import { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, AlertTriangle, XCircle, BookOpen, ArrowRight, Map as MapIcon } from 'lucide-react';
import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { prisma } from '@/lib/prisma';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import PracticeAuthorityMap from '@/components/tools/PracticeAuthorityMap';
import {
    STATE_PRACTICE_AUTHORITY,
    getStatesByAuthority,
    getAuthorityColor,
    getAuthorityLabel,
    type PracticeAuthority,
} from '@/lib/state-practice-authority';

// ISR daily — the linkable-state sets below track live job data, not content.
export const revalidate = 86400;

export const metadata: Metadata = {
    title: 'PMHNP Practice Authority Map: Full, Reduced & Restricted States',
    description:
        'Free interactive map of PMHNP practice authority in all 50 states + DC. See which states grant Full Practice Authority, which require collaborative agreements, and which require physician supervision, with links to jobs and salary data per state.',
    keywords: [
        'PMHNP practice authority map',
        'nurse practitioner practice authority by state',
        'full practice authority states map',
        'reduced practice states NP',
        'restricted practice states NP',
        'PMHNP independent practice states',
    ],
    openGraph: {
        title: 'PMHNP Practice Authority Map: Full, Reduced & Restricted States',
        description:
            'Interactive state-by-state map of PMHNP practice authority. Click any state to see its classification, jobs, and salary data.',
        type: 'website',
        url: `${brand.baseUrl}/tools/practice-authority-map`,
    },
    twitter: {
        card: 'summary',
        title: 'PMHNP Practice Authority Map',
    },
    alternates: { canonical: `${brand.baseUrl}/tools/practice-authority-map` },
};

/* ═══ Clay design tokens (match app/salary-guide/page.tsx) ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const AUTHORITY_LEVELS: readonly PracticeAuthority[] = ['full', 'reduced', 'restricted'];

/** One-line summary per level for the crawlable list — derived from the level itself. */
const LEVEL_SUMMARY: Record<PracticeAuthority, string> = {
    full: 'Independent practice with no physician oversight required.',
    reduced: 'A collaborative agreement with a physician is required.',
    restricted: 'Physician supervision or a supervisory protocol is required.',
};

const LEVEL_ICON: Record<PracticeAuthority, React.ReactNode> = {
    full: <CheckCircle size={18} className="text-green-600" aria-hidden="true" />,
    reduced: <AlertTriangle size={18} className="text-yellow-600" aria-hidden="true" />,
    restricted: <XCircle size={18} className="text-orange-600" aria-hidden="true" />,
};

function toSlug(stateName: string): string {
    return stateName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * States whose /jobs/state/{slug} and /salary-guide/{slug} pages actually
 * resolve. Both routes notFound() on empty data, so linking all 51 blindly
 * would mint internal 404s:
 *   - /jobs/state gates on ≥1 published job in the state
 *   - /salary-guide gates on ≥1 published job WITH normalizedMinSalary
 * On a degraded DB read we fail open (link everything) — a transient 404
 * beats rendering the whole tool link-less.
 */
async function getLinkableStates(): Promise<{ jobStates: string[]; salaryStates: string[] }> {
    try {
        const [jobRows, salaryRows] = await Promise.all([
            prisma.job.groupBy({
                by: ['state'],
                where: { isPublished: true, state: { not: null } },
            }),
            prisma.job.groupBy({
                by: ['state'],
                where: { isPublished: true, state: { not: null }, normalizedMinSalary: { not: null } },
            }),
        ]);
        return {
            jobStates: jobRows.map((row) => row.state).filter((s): s is string => s !== null),
            salaryStates: salaryRows.map((row) => row.state).filter((s): s is string => s !== null),
        };
    } catch {
        const allStates = Object.keys(STATE_PRACTICE_AUTHORITY);
        return { jobStates: allStates, salaryStates: allStates };
    }
}

export default async function PracticeAuthorityMapPage() {
    const { jobStates, salaryStates } = await getLinkableStates();
    const jobStateSet = new Set(jobStates);
    const statesByLevel: Record<PracticeAuthority, string[]> = {
        full: [...getStatesByAuthority('full')].sort((a, b) => a.localeCompare(b)),
        reduced: [...getStatesByAuthority('reduced')].sort((a, b) => a.localeCompare(b)),
        restricted: [...getStatesByAuthority('restricted')].sort((a, b) => a.localeCompare(b)),
    };

    const webApplicationSchema = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'PMHNP Practice Authority Map',
        url: `${brand.baseUrl}/tools/practice-authority-map`,
        description:
            'Free interactive map of psychiatric nurse practitioner practice authority in all 50 states and Washington D.C., showing full, reduced, and restricted practice classifications with per-state job and salary links.',
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript for the interactive map; state list works without it.',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@type': 'Organization', name: brand.name, url: brand.baseUrl },
    };

    return (
        <div style={{ background: '#FDFBF7', minHeight: '100vh' }}>
            <BreadcrumbSchema
                items={[
                    { name: 'Home', url: 'https://pmhnphiring.com' },
                    { name: 'Tools', url: 'https://pmhnphiring.com/tools' },
                    { name: 'Practice Authority Map', url: 'https://pmhnphiring.com/tools/practice-authority-map' },
                ]}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLdString(webApplicationSchema) }}
            />

            {/* ═══ Hero ═══ */}
            {/* Layout's <main> already pads 64px below the header — keep hero
                top padding small so the page doesn't open on a void. */}
            <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px 20px 0' }}>
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>
                        Free Interactive Tool
                    </p>
                    <h1
                        className="font-lora"
                        style={{
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
                            color: '#1A2E35', marginBottom: '16px',
                        }}
                    >
                        PMHNP Practice Authority Map
                    </h1>
                    <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
                        Where can psychiatric nurse practitioners practice independently? Explore
                        full, reduced, and restricted practice states. Click any state for its
                        classification, open jobs, and salary data.
                    </p>
                </div>

                {/* ═══ Summary stat row ═══ */}
                <div className="pa-stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                    <div style={{ ...clayCard, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#D4F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <CheckCircle size={22} color="#065F46" aria-hidden="true" />
                        </span>
                        <div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: '#065F46', lineHeight: 1 }}>{statesByLevel.full.length}</div>
                            <div style={{ fontSize: '12.5px', color: '#5A4A42', fontWeight: 600, marginTop: '4px' }}>Full Practice Authority</div>
                        </div>
                    </div>
                    <div style={{ ...clayCard, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <AlertTriangle size={22} color="#92400E" aria-hidden="true" />
                        </span>
                        <div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: '#92400E', lineHeight: 1 }}>{statesByLevel.reduced.length}</div>
                            <div style={{ fontSize: '12.5px', color: '#5A4A42', fontWeight: 600, marginTop: '4px' }}>Reduced Practice</div>
                        </div>
                    </div>
                    <div style={{ ...clayCard, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#FFE0D3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <XCircle size={22} color="#7C2D12" aria-hidden="true" />
                        </span>
                        <div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: '#7C2D12', lineHeight: 1 }}>{statesByLevel.restricted.length}</div>
                            <div style={{ fontSize: '12.5px', color: '#5A4A42', fontWeight: 600, marginTop: '4px' }}>Restricted Practice</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ Interactive map ═══ */}
            <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 20px' }}>
                <div style={{ ...clayCard, padding: 'clamp(16px, 3vw, 32px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <MapIcon size={20} color="#0D9488" aria-hidden="true" />
                        <h2
                            className="font-lora"
                            style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: 0 }}
                        >
                            Explore the Map
                        </h2>
                    </div>
                    <PracticeAuthorityMap statesWithJobs={jobStates} statesWithSalaryData={salaryStates} />
                </div>
            </section>

            {/* ═══ FPA guide deep-dive CTA ═══ */}
            <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 20px 0' }}>
                <Link
                    href="/resources/fpa-guide"
                    className="pa-guide-cta"
                    style={{
                        ...clayCard,
                        display: 'flex', alignItems: 'center', gap: '18px',
                        padding: '24px 28px', textDecoration: 'none',
                        background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                        border: '1.5px solid rgba(13,148,136,0.15)',
                    }}
                >
                    <span style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '3px 3px 8px rgba(0,0,0,0.05)' }}>
                        <BookOpen size={24} color="#0D9488" aria-hidden="true" />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '16px', fontWeight: 800, color: '#134E4A', marginBottom: '4px' }}>
                            Read the Full Practice Authority Guide
                        </span>
                        <span style={{ display: 'block', fontSize: '13.5px', color: '#5A4A42', lineHeight: 1.5 }}>
                            State-by-state details, salary impact, telehealth licensing, and how FPA
                            affects your career, all in one deep dive.
                        </span>
                    </span>
                    <ArrowRight size={20} color="#0D9488" aria-hidden="true" style={{ flexShrink: 0 }} />
                </Link>
            </section>

            {/* ═══ Crawlable text fallback: states grouped by authority ═══ */}
            <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 20px 80px' }}>
                <h2
                    className="font-lora"
                    style={{
                        fontFamily: 'var(--font-lora), Georgia, serif',
                        fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800, color: '#1A2E35',
                        textAlign: 'center', marginBottom: '10px',
                    }}
                >
                    All 50 States + DC by Practice Authority
                </h2>
                <p style={{ fontSize: '14.5px', color: '#5A4A42', textAlign: 'center', maxWidth: '560px', margin: '0 auto 32px', lineHeight: 1.6 }}>
                    Every state&apos;s classification at a glance. Select a state to browse its open
                    PMHNP positions.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                    {AUTHORITY_LEVELS.map((level) => {
                        const colors = getAuthorityColor(level);
                        const states = statesByLevel[level];
                        return (
                            <div key={level} style={{ ...clayCard, padding: '24px 22px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    {LEVEL_ICON[level]}
                                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                                        {getAuthorityLabel(level)}
                                    </h3>
                                </div>
                                <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.55, margin: '0 0 14px' }}>
                                    {LEVEL_SUMMARY[level]}{' '}
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${colors.border} border`}>
                                        {states.length} {level === 'full' ? 'states + DC' : 'states'}
                                    </span>
                                </p>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {states.map((stateName) => (
                                        <li key={stateName}>
                                            {jobStateSet.has(stateName) ? (
                                                <Link
                                                    href={`/jobs/state/${toSlug(stateName)}`}
                                                    className="hover:underline"
                                                    style={{ fontSize: '13.5px', fontWeight: 600, color: '#0D9488', textDecoration: 'none' }}
                                                >
                                                    {stateName} PMHNP Jobs
                                                </Link>
                                            ) : (
                                                // No published jobs → the state page notFound()s.
                                                // Keep the name visible (SEO copy), just not linked.
                                                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#64748B' }}>
                                                    {stateName}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>

                <p style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center', marginTop: '28px', lineHeight: 1.6 }}>
                    Classifications follow the AANP State Practice Environment framework. Always
                    verify current requirements with the state board of nursing before making
                    licensing decisions.
                </p>
            </section>

            {/* ═══ Hover polish ═══ */}
            <style>{`
                .pa-guide-cta {
                    transition: transform 0.25s ease, box-shadow 0.25s ease;
                }
                .pa-guide-cta:hover {
                    transform: translateY(-3px);
                    box-shadow: 8px 8px 24px rgba(13,148,136,0.15), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6);
                }
            `}</style>
        </div>
    );
}
