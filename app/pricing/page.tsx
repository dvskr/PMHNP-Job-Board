import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { config } from '@/lib/config';
import { Check, ArrowRight, X, HelpCircle, RefreshCw } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Pricing — PMHNP Job Board | First 2 Posts Free, Then $199',
    description:
        'Simple, transparent pricing for PMHNP job postings. First 2 posts are free with all features. After that, $199 per post. No subscriptions, no contracts.',
    openGraph: {
        title: 'Pricing — PMHNP Job Board',
        description: 'Post PMHNP jobs — first 2 free, then $199/post. Every post gets the full package.',
        images: [{ url: '/images/pages/pmhnp-employer-hiring-solutions.webp', width: 1280, height: 900, alt: 'PMHNP job board pricing' }],
    },
    twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-employer-hiring-solutions.webp'] },
    alternates: { canonical: 'https://pmhnphiring.com/pricing' },
};

/* ═══ Clay Tokens — matched to employer page ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayIconWrap = (gradient: string): React.CSSProperties => ({
    width: '28px', height: '28px', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: gradient,
    boxShadow: '2px 2px 5px rgba(13,148,136,0.12)',
    flexShrink: 0,
});

/* ═══ Comparison Data — same as employer page ═══ */
const comparisonRows: { feature: string; us: true | false | 'partial'; indeed: true | false | 'partial'; linkedin: true | false | 'partial'; note?: string }[] = [
    { feature: '100% Psychiatric NP Audience', us: true, indeed: false, linkedin: false },
    { feature: 'No Unqualified Applicants', us: true, indeed: false, linkedin: false },
    { feature: 'First 2 Posts Free (No Card)', us: true, indeed: false, linkedin: false },
    { feature: 'Flat $199/Post — No Bidding', us: true, indeed: false, linkedin: false, note: 'Indeed is pay-per-click' },
    { feature: '60-Day Listing Duration', us: true, indeed: false, linkedin: false, note: 'Others: 30 days' },
    { feature: 'Direct Candidate Messaging', us: true, indeed: false, linkedin: 'partial', note: 'LinkedIn: paid add-on' },
    { feature: 'Candidate Profile Unlocks', us: true, indeed: false, linkedin: 'partial', note: 'LinkedIn: paid add-on' },
    { feature: 'Built-In Screening Questions', us: true, indeed: true, linkedin: false },
    { feature: 'Daily Niche Job Alerts', us: true, indeed: 'partial', linkedin: 'partial', note: 'Others: generic alerts' },
    { feature: 'Instant Apply Notifications', us: true, indeed: true, linkedin: true },
];

const faqs = [
    { q: 'How many free posts do I get?', a: `Your first ${config.freePostsPerEmail} job posts per email address are completely free — no credit card required. Every feature is included.` },
    { q: 'What happens after my free posts?', a: `Posts 3+ cost a flat $${config.postingPrice} each. Same features, same visibility. Just add payment at checkout.` },
    { q: 'How long do job postings stay active?', a: `All postings — free or paid — are active for ${config.durationDays} days. You can renew at any time from your employer dashboard.` },
    { q: 'What does renewal cost?', a: `Renewals are $${config.renewalPrice} (20% off the regular price). Your listing gets another ${config.durationDays} days and is boosted back to the top of search results.` },
    { q: 'Are free posts different from paid posts?', a: 'No. Every post gets the exact same features: Featured badge, top placement, 25 candidate unlocks, 25 InMails, and full analytics. No downgrades.' },
    { q: 'Can I edit my job posting after publishing?', a: 'Yes! You can edit your posting anytime from your dashboard — update salary, requirements, or any details. Changes go live immediately.' },
    { q: 'Do you offer bulk discounts?', a: 'Yes! Contact us at support@pmhnphiring.com for custom pricing if you need to post 5+ positions. We offer volume discounts for larger organizations.' },
];

export default function PricingPage() {
    return (
        <>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Pricing', url: 'https://pmhnphiring.com/pricing' },
            ]} />

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 1: HERO + PRICING CARD
                ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 40%, #FFF5EE 100%)',
                paddingBottom: '64px',
            }}>
                <section style={{ padding: '80px 16px 48px', textAlign: 'center' }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
                            Simple Pricing
                        </p>
                        <h1 className="font-lora" style={{
                            fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
                            color: '#1A2E35', marginBottom: '16px',
                        }}>
                            First 2 Posts Free, Then ${config.postingPrice}
                        </h1>
                        <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                            Every post gets the full package — no downgrades, no hidden fees. Start hiring in under 5 minutes.
                        </p>
                    </div>
                </section>

                {/* Pricing Card */}
                <section style={{ padding: '0 16px', maxWidth: '700px', margin: '0 auto' }}>
                    <div style={{ ...clayCard, padding: '40px 36px', position: 'relative', border: '2px solid rgba(13,148,136,0.2)' }}>
                        <div style={{
                            position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                            background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                            fontSize: '11px', fontWeight: 700, padding: '6px 20px', borderRadius: '999px',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            boxShadow: '3px 3px 8px rgba(13,148,136,0.2)',
                        }}>One Simple Plan</div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'center', marginBottom: '28px' }}>
                            <div>
                                <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1A2E35', marginBottom: '6px' }}>Full Package — Every Post</h2>
                                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.5 }}>
                                    No tiers. No downgrades. Free or paid, you get everything.
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                    <span style={{ fontSize: '48px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${config.postingPrice}</span>
                                    <span style={{ fontSize: '14px', color: '#5A4A42' }}>/post</span>
                                </div>
                                <p style={{ fontSize: '13px', color: '#0D9488', fontWeight: 600, marginTop: '4px' }}>First 2 posts FREE</p>
                            </div>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {[
                                `${config.durationDays}-day listing`,
                                '★ Featured badge',
                                'Top search placement',
                                'Highlighted in job alerts',
                                '25 candidate unlocks',
                                '25 InMails',
                                'Full analytics dashboard',
                                'Up to 5 screening questions',
                            ].map(feat => (
                                <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#1A2E35' }}>
                                    <Check size={16} style={{ color: '#0D9488', flexShrink: 0 }} /> {feat}
                                </li>
                            ))}
                        </ul>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: '#F0FDFA', borderRadius: '12px', border: '1px solid #99F6E4', marginBottom: '24px' }}>
                            <RefreshCw size={16} style={{ color: '#0D9488', flexShrink: 0 }} />
                            <p style={{ fontSize: '13px', color: '#134E4A', margin: 0 }}>
                                <strong>Renewals: ${config.renewalPrice}</strong> (20% off) — extend your listing for another {config.durationDays} days
                            </p>
                        </div>

                        <Link href="/post-job" className="emp-cta-primary" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            padding: '16px 28px', borderRadius: '14px', fontWeight: 700, fontSize: '16px',
                            background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                            textDecoration: 'none',
                            boxShadow: '6px 6px 16px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
                        }}>
                            Start Posting — First 2 Free <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════════════
                    SECTION 2: BENTO GRID — What Every Post Includes
                    ═══════════════════════════════════════════════════════════════ */}
                <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 20px 0' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        What&apos;s Included
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                        Every Post Gets the Full Package
                    </h2>
                    <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '440px', margin: '0 auto 36px', lineHeight: 1.6 }}>
                        The same premium features whether it&apos;s your free post or your 10th paid one.
                    </p>

                    {/* ─── Bento Grid ─── */}
                    <div className="bento-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(12, 1fr)',
                        gridTemplateRows: 'auto',
                        gap: '14px',
                    }}>

                        {/* ROW 1: 60-Day Listing (8 cols) + Featured Badge (4 cols) */}
                        <div className="bento-hero-1 emp-bento-card" style={{
                            ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden',
                            display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center',
                        }}>
                            <div style={{ padding: '32px 28px' }}>
                                <Image src="/images/employers/clay-calendar.png" alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '16px' }} />
                                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>60-Day Listing</h3>
                                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                                    Double the industry standard. Your job stays visible for 2 full months — no daily budget, no bidding.
                                </p>
                            </div>
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                                <Image src="/images/employers/bento-60day.png" alt="60-day job listing calendar" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                            </div>
                        </div>

                        <div className="bento-hero-2 emp-bento-card" style={{
                            ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Image src="/images/employers/bento-featured.png" alt="Featured badge on job listing" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
                            </div>
                            <div style={{ padding: '24px 22px', flex: 1 }}>
                                <Image src="/images/employers/clay-star.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '12px' }} />
                                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Featured Badge</h3>
                                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                                    Stand out with a prominent Featured tag on your listing and in search results.
                                </p>
                            </div>
                        </div>

                        {/* ROW 2: 4 compact cards (3 cols each) — CENTERED */}
                        <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
                            <Image src="/images/employers/clay-trending.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Top Search Placement</h3>
                            <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Featured listings rank higher — more visibility, more clicks.</p>
                        </div>

                        <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
                            <Image src="/images/employers/clay-envelope.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Daily Job Alerts</h3>
                            <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Highlighted in daily email digests to opted-in PMHNPs.</p>
                        </div>

                        <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
                            <Image src="/images/employers/clay-people.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>25 Candidate Unlocks</h3>
                            <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>View full profiles — contact info, resume, LinkedIn.</p>
                        </div>

                        <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
                            <Image src="/images/employers/clay-briefcase.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>25 InMails</h3>
                            <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Message candidates directly — no guessing emails.</p>
                        </div>

                        {/* ROW 3: Analytics (8 cols) + Renewal (4 cols) */}
                        <div className="bento-hero-3 emp-bento-card" style={{
                            ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden',
                            display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center',
                        }}>
                            <div style={{ padding: '32px 28px' }}>
                                <Image src="/images/employers/clay-chart.png" alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '16px' }} />
                                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Live Analytics</h3>
                                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                                    Track views, clicks, and applications in real time. See exactly where your candidates come from.
                                </p>
                            </div>
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                                <Image src="/images/employers/bento-analytics.png" alt="Analytics dashboard with charts" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                            </div>
                        </div>

                        <div className="bento-pricing emp-bento-card" style={{
                            ...clayCard, gridColumn: 'span 4',
                            padding: '28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                            background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                            border: '2px solid rgba(13,148,136,0.15)',
                        }}>
                            <Image src="/images/employers/clay-dollar.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '14px' }} />
                            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Easy Renewals</h3>
                            <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                                Just ${config.renewalPrice} to renew (20% off).<br />
                                Boosted back to the top of search.
                            </p>
                            <Link href="/post-job" className="emp-cta-primary" style={{
                                padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                                background: '#0D9488', color: '#fff', textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                                boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                            }}>
                                Post a Job <ArrowRight size={14} />
                            </Link>
                        </div>

                    </div>
                </section>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 3: COMPARISON + CTA (split screen, same as employer)
                ═══════════════════════════════════════════════════════════════ */}
            <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)', padding: '80px 20px' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Why Switch
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                        How We Compare
                    </h2>
                    <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '440px', margin: '0 auto 44px', lineHeight: 1.6 }}>
                        An honest look at what you get — no cherry-picking.
                    </p>

                    {/* Split: Table (left) + CTA Card (right) */}
                    <div className="emp-compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>

                        {/* LEFT — Comparison Table */}
                        <div className="emp-compare-table" style={{ ...clayCard, padding: '0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.08), rgba(13,148,136,0.02))' }}>
                                        <th style={{ width: '40%', padding: '16px 24px', textAlign: 'left', fontWeight: 600, color: '#64748B', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature</th>
                                        <th style={{ width: '20%', padding: '16px 16px', textAlign: 'center', fontWeight: 800, color: '#0D9488', borderBottom: '2px solid rgba(13,148,136,0.2)', fontSize: '12px' }}>PMHNP Hiring</th>
                                        <th style={{ width: '20%', padding: '16px 16px', textAlign: 'center', fontWeight: 600, color: '#94A3B8', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '12px' }}>Indeed</th>
                                        <th style={{ width: '20%', padding: '16px 16px', textAlign: 'center', fontWeight: 600, color: '#94A3B8', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '12px' }}>LinkedIn</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonRows.map((row, i) => {
                                        const renderCell = (val: true | false | 'partial', isUs: boolean) => {
                                            if (val === true) return <Check size={16} style={{ color: isUs ? '#0D9488' : '#94A3B8', display: 'block', margin: '0 auto' }} />;
                                            if (val === 'partial') return <span style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 600 }}>Partial</span>;
                                            return <X size={16} style={{ color: '#D1D5DB', display: 'block', margin: '0 auto' }} />;
                                        };
                                        return (
                                            <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                                                <td style={{ padding: '12px 24px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                    <span style={{ color: '#1A2E35', fontWeight: 500 }}>{row.feature}</span>
                                                    {row.note && <span style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{row.note}</span>}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)', background: 'rgba(13,148,136,0.03)' }}>
                                                    {renderCell(row.us, true)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                    {renderCell(row.indeed, false)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                    {renderCell(row.linkedin, false)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* RIGHT — Vertical CTA Card (image top, content bottom) */}
                        <div style={{
                            ...clayCard, padding: '0', overflow: 'hidden',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            <div style={{
                                background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                                padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Image
                                    src="/images/employers/cta-illustration.png"
                                    alt="Successful PMHNP hiring celebration"
                                    width={280} height={220}
                                    style={{ width: '100%', maxWidth: '260px', height: 'auto', borderRadius: '14px' }}
                                />
                            </div>
                            <div style={{ padding: '28px 24px' }}>
                                <h3 className="font-lora" style={{
                                    fontSize: '20px', fontWeight: 700,
                                    color: '#1A2E35', margin: '0 0 10px',
                                }}>
                                    Ready to Hire Your{' '}
                                    <span style={{ color: '#0D9488' }}>Next PMHNP</span>?
                                </h3>
                                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 20px' }}>
                                    First 2 posts free — all features included. Then just ${config.postingPrice}/post.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <Link href="/post-job" className="emp-cta-primary" style={{
                                        padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                                        background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        boxShadow: '4px 4px 12px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                                    }}>
                                        Post a Job — First 2 Free <ArrowRight size={15} />
                                    </Link>
                                    <Link href="/contact" className="emp-cta-secondary" style={{
                                        padding: '12px 24px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
                                        background: '#fff', color: '#1A2E35', textDecoration: 'none',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                        boxShadow: '2px 2px 6px rgba(0,0,0,0.04)',
                                    }}>
                                        Contact Sales
                                    </Link>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 4: FAQ
                ═══════════════════════════════════════════════════════════════ */}
            <section style={{ padding: '80px 16px', background: '#FFF' }}>
                <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Common Questions
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '32px' }}>Frequently Asked Questions</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {faqs.map(({ q, a }) => (
                            <details key={q} style={{ ...clayCard, padding: 0, overflow: 'hidden' }}>
                                <summary style={{
                                    padding: '18px 24px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    fontSize: '15px', fontWeight: 600, color: '#1A2E35', listStyle: 'none',
                                }}>
                                    <div style={{ ...clayIconWrap('linear-gradient(145deg, #0D9488, #10B981)') }}>
                                        <HelpCircle size={14} color="#fff" />
                                    </div>
                                    {q}
                                </summary>
                                <div style={{ padding: '0 24px 18px 64px', fontSize: '14px', color: '#5A4A42', lineHeight: 1.65 }}>{a}</div>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ Responsive + Hover ═══ */}
            <style>{`
                .emp-cta-primary {
                    transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease;
                }
                .emp-cta-primary:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 32px rgba(13,148,136,0.35), inset 1px 1px 2px rgba(255,255,255,0.2) !important;
                    filter: brightness(1.05);
                }
                .emp-cta-secondary {
                    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
                }
                .emp-cta-secondary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important;
                    border-color: rgba(13,148,136,0.3) !important;
                }
                .emp-bento-card {
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                .emp-bento-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
                }
                .emp-compare-table tr {
                    transition: background 0.2s ease;
                }
                .emp-compare-table tbody tr:hover {
                    background: rgba(13,148,136,0.04) !important;
                }

                @media (max-width: 768px) {
                    .emp-compare-grid { grid-template-columns: 1fr !important; }
                    .bento-grid { grid-template-columns: 1fr !important; }
                    .bento-hero-1, .bento-hero-2, .bento-hero-3, .bento-pricing {
                        grid-column: span 1 !important;
                    }
                    .bento-hero-1, .bento-hero-3 {
                        grid-template-columns: 1fr !important;
                    }
                    .bento-grid > div { grid-column: span 1 !important; }
                }
                @media (min-width: 769px) and (max-width: 1024px) {
                    .bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
                    .bento-hero-1, .bento-hero-3 { grid-column: span 6 !important; }
                    .bento-hero-2, .bento-pricing { grid-column: span 6 !important; }
                    .bento-grid > div:not(.bento-hero-1):not(.bento-hero-2):not(.bento-hero-3):not(.bento-pricing) {
                        grid-column: span 3 !important;
                    }
                }
            `}</style>
        </>
    );
}
