import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { config } from '@/lib/config';
import {
    Check, Sparkles, Crown, ArrowRight, Users, TrendingUp, Mail,
    Search, MessageSquare, HelpCircle, RefreshCw, BarChart3,
} from 'lucide-react';

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

/* ═══ Clay Tokens ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayIconWrap = (gradient: string): React.CSSProperties => ({
    width: '48px', height: '48px', borderRadius: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: gradient,
    boxShadow: '4px 4px 10px rgba(0,0,0,0.08), inset 1px 1px 2px rgba(255,255,255,0.2)',
});

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
        <div style={{ background: '#F5F6F8', minHeight: '100vh' }}>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Pricing', url: 'https://pmhnphiring.com/pricing' },
            ]} />

            {/* Hero */}
            <section style={{ padding: '80px 16px 48px', textAlign: 'center' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
                        Simple Pricing
                    </p>
                    <h1 style={{
                        fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
                        fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35',
                        marginBottom: '16px',
                    }}>
                        First 2 Posts Free, Then ${config.postingPrice}
                    </h1>
                    <p style={{ fontSize: '17px', color: '#6B7F8A', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                        Every post gets the full package — no downgrades, no hidden fees. Start hiring in under 5 minutes.
                    </p>
                    <div style={{ marginTop: '28px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/post-job" style={{
                            padding: '14px 36px', borderRadius: '16px', fontWeight: 700, fontSize: '16px',
                            background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                            boxShadow: '6px 6px 16px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
                            border: 'none',
                        }}>
                            Post a Job — First 2 Free <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Pricing Card */}
            <section style={{ padding: '0 16px 48px', maxWidth: '700px', margin: '0 auto' }}>
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
                            <p style={{ fontSize: '14px', color: '#8A9BA6', margin: 0, lineHeight: 1.5 }}>
                                No tiers. No downgrades. Free or paid, you get everything.
                            </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{ fontSize: '48px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${config.postingPrice}</span>
                                <span style={{ fontSize: '14px', color: '#8A9BA6' }}>/post</span>
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

                    <Link href="/post-job" style={{
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

            {/* Features Grid */}
            <section style={{ padding: '48px 16px 80px', maxWidth: '900px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                    What Every Post Includes
                </h2>
                <p style={{ fontSize: '15px', color: '#8A9BA6', textAlign: 'center', marginBottom: '32px' }}>
                    The same premium features whether it&apos;s your free post or your 10th paid one.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    {[
                        { icon: Sparkles, title: `${config.durationDays}-Day Listing`, desc: 'Your posting stays active for 60 days. Maximum exposure to qualified PMHNPs.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                        { icon: Crown, title: '"Featured" Badge', desc: 'Your listing displays a prominent Featured badge, standing out in search results.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                        { icon: TrendingUp, title: 'Top Search Placement', desc: 'Your job appears above standard listings for maximum visibility.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                        { icon: Mail, title: 'Highlighted in Job Alerts', desc: 'Your listing is prioritized in daily emails to thousands of PMHNPs.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                        { icon: Users, title: '25 Candidate Unlocks', desc: 'Preview and unlock full profiles of up to 25 candidates per posting.', gradient: 'linear-gradient(145deg, #059669, #10B981)' },
                        { icon: MessageSquare, title: '25 InMails/Posting', desc: 'Message up to 25 candidates directly on the platform.', gradient: 'linear-gradient(145deg, #F59E0B, #EAB308)' },
                        { icon: BarChart3, title: 'Full Analytics', desc: 'Track views, clicks, sources, and salary benchmarks in your dashboard.', gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
                        { icon: Search, title: 'SEO-Optimized Page', desc: 'Your listing is discoverable on Google with its own optimized URL.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                    ].map(({ icon: Ic, title, desc, gradient }) => (
                        <div key={title} style={{ ...clayCard, padding: '24px 20px' }}>
                            <div style={{ ...clayIconWrap(gradient), width: '40px', height: '40px', borderRadius: '12px', marginBottom: '14px' }}>
                                <Ic size={18} color="#fff" />
                            </div>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '6px' }}>{title}</h3>
                            <p style={{ fontSize: '13px', color: '#8A9BA6', lineHeight: 1.5, margin: 0 }}>{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* FAQ */}
            <section style={{ padding: '80px 16px' }}>
                <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textAlign: 'center', marginBottom: '32px' }}>Frequently Asked Questions</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {faqs.map(({ q, a }) => (
                            <details key={q} style={{ ...clayCard, padding: 0, overflow: 'hidden' }}>
                                <summary style={{
                                    padding: '18px 24px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    fontSize: '15px', fontWeight: 600, color: '#1A2E35', listStyle: 'none',
                                }}>
                                    <div style={{ ...clayIconWrap('linear-gradient(145deg, #0D9488, #10B981)'), width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0, boxShadow: '2px 2px 5px rgba(13,148,136,0.12)' }}>
                                        <HelpCircle size={14} color="#fff" />
                                    </div>
                                    {q}
                                </summary>
                                <div style={{ padding: '0 24px 18px 64px', fontSize: '14px', color: '#6B7F8A', lineHeight: 1.65 }}>{a}</div>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom CTA */}
            <section style={{ padding: '80px 16px', textAlign: 'center' }}>
                <div style={{ ...clayCard, maxWidth: '600px', margin: '0 auto', padding: '48px 32px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', marginBottom: '12px' }}>
                        Ready to Hire Your Next PMHNP?
                    </h2>
                    <p style={{ fontSize: '15px', color: '#8A9BA6', marginBottom: '28px', lineHeight: 1.6 }}>
                        Your first 2 posts are free. Go live in under 5 minutes and start receiving qualified candidates.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/post-job" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '14px 32px', borderRadius: '16px', fontWeight: 700, fontSize: '15px',
                            color: '#fff', background: 'linear-gradient(145deg, #0D9488, #10B981)', textDecoration: 'none',
                            boxShadow: '6px 6px 16px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                        }}>
                            Post a Job — First 2 Free <ArrowRight size={16} />
                        </Link>
                        <a href="mailto:support@pmhnphiring.com" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '14px 32px', borderRadius: '16px', fontWeight: 600, fontSize: '15px',
                            color: '#1A2E35', textDecoration: 'none',
                            ...clayCard,
                        }}>
                            Contact Sales
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}
