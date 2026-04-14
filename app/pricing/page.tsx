import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { config } from '@/lib/config';
import {
    Check, Sparkles, Crown, Zap, ArrowRight, Users, TrendingUp, Mail,
    Share2, Search, MessageSquare, HelpCircle,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'Pricing — PMHNP Job Board | Post Psychiatry NP Jobs',
    description:
        'Simple, transparent pricing for PMHNP job postings. Standard, Featured, and Pro plans. First post free — no credit card required.',
    openGraph: {
        title: 'Pricing — PMHNP Job Board',
        description: 'Post PMHNP jobs starting free. Three plans to fit every hiring need.',
        images: [{ url: '/images/pages/pmhnp-employer-hiring-solutions.webp', width: 1280, height: 900, alt: 'PMHNP job board pricing plans' }],
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

const plans = [
    {
        name: 'Starter', price: 199, period: 'per posting',
        tagline: 'Everything you need to get started', cta: 'Get Started', ctaHref: '/employer/signup',
        icon: Zap, gradient: 'linear-gradient(145deg, #94A3B8, #64748B)', accent: '#64748B',
        popular: false, duration: '30 days',
        features: [
            '30-day job listing', 'Included in daily job alerts', 'Full job description page',
            'Basic analytics (views)', '5 candidate unlocks/posting', '5 InMails/posting',
        ],
    },
    {
        name: 'Growth', price: 299, period: 'per posting',
        tagline: 'Maximum visibility for your listing', cta: 'Get Growth', ctaHref: '/employer/signup',
        icon: Sparkles, gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)', accent: '#E86C2C',
        popular: true, duration: '60 days',
        features: [
            '60-day listing (2× longer)', '"Featured" badge on listing', 'Top placement in search results',
            'Highlighted in email digests', '25 candidate unlocks/posting', '25 InMails/posting',
            'Advanced analytics (views, clicks, sources)',
        ],
    },
    {
        name: 'Premium', price: 399, period: 'per posting',
        tagline: 'Full-service recruitment power', cta: 'Go Premium', ctaHref: '/employer/signup',
        icon: Crown, gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)', accent: '#A855F7',
        popular: false, duration: '90 days',
        features: [
            '90-day listing (3× longer)', 'Everything in Growth', 'Unlimited candidate unlocks',
            'Unlimited InMails', 'Social media promotion', 'Dedicated account support',
        ],
    },
];

const faqs = [
    { q: 'Is the first post really free?', a: 'Yes! Your first job posting is completely free with a Starter listing — no credit card required. We want you to experience the quality of our PMHNP candidate pool before committing.' },
    { q: 'How long do job postings stay active?', a: 'Starter posts are active for 30 days, Growth for 60 days, and Premium for 90 days. You can renew at any time from your employer dashboard.' },
    { q: 'Can I upgrade my plan after posting?', a: 'Absolutely! You can upgrade from Starter to Growth or Premium anytime. You\'ll only pay the difference between the plans.' },
    { q: 'What is candidate database access?', a: 'Starter employers can preview candidate profiles (specialties, experience, location). Growth and Premium employers get full access including contact details, resumes, LinkedIn profiles, and direct messaging — with higher unlock and InMail limits on Premium.' },
    { q: 'Do you offer bulk discounts?', a: 'Yes! Contact us for custom pricing if you need to post 5+ positions. We offer volume discounts and annual plans for larger organizations.' },
    { q: 'Can I edit my job posting after publishing?', a: 'Yes, all plans include unlimited edits. Update salary, requirements, or any details from your dashboard — changes go live immediately.' },
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
                    <h1 style={{
                        fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
                        fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35',
                        marginBottom: '16px',
                    }}>
                        {config.isPaidPostingEnabled ? 'Simple, Transparent Pricing' : 'Post PMHNP Jobs for Free'}
                    </h1>
                    <p style={{ fontSize: '17px', color: '#6B7F8A', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                        {config.isPaidPostingEnabled
                            ? 'Choose the plan that fits your hiring needs. No subscriptions, no contracts — just results.'
                            : 'Reach thousands of psychiatric nurse practitioners actively searching. No credit card required. Go live in under 5 minutes.'}
                    </p>
                    {!config.isPaidPostingEnabled && (
                        <div style={{ marginTop: '28px' }}>
                            <Link href="/post-job" style={{
                                padding: '14px 36px', borderRadius: '16px', fontWeight: 700, fontSize: '16px',
                                background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                                boxShadow: '6px 6px 16px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
                                border: 'none',
                            }}>
                                Post a Job — Free <ArrowRight size={18} />
                            </Link>
                        </div>
                    )}
                </div>
            </section>

            {/* What You Get — shown during free launch */}
            {!config.isPaidPostingEnabled && (
                <section style={{ padding: '0 16px 80px', maxWidth: '900px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                        What You Get — Growth Package
                    </h2>
                    <p style={{ fontSize: '15px', color: '#8A9BA6', textAlign: 'center', marginBottom: '32px' }}>
                        Every job posting includes our $299 Growth package — completely free during launch.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        {[
                            { icon: Sparkles, title: '60-Day Job Listing', desc: 'Your posting stays active for 60 days — 2× longer than standard. Maximum exposure.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                            { icon: Crown, title: '"Featured" Badge', desc: 'Your listing displays a prominent Featured badge, standing out from all other postings.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                            { icon: TrendingUp, title: 'Top Search Placement', desc: 'Your job appears at the top of search results, ahead of standard listings.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                            { icon: Mail, title: 'Highlighted in Job Alerts', desc: 'Your listing is prioritized and highlighted in daily emails to thousands of PMHNPs.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                            { icon: Users, title: '25 Candidate Unlocks', desc: 'Preview and unlock up to 25 candidate profiles per posting.', gradient: 'linear-gradient(145deg, #059669, #10B981)' },
                            { icon: MessageSquare, title: '25 InMails/Posting', desc: 'Message up to 25 candidates directly on the platform.', gradient: 'linear-gradient(145deg, #F59E0B, #EAB308)' },
                            { icon: Search, title: 'Advanced Analytics', desc: 'Track views, clicks, and sources. Know exactly how your posting performs.', gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
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
            )}

            {/* Plan Cards — shown when paid posting enabled */}
            {config.isPaidPostingEnabled && (
                <section style={{ padding: '0 16px 80px', maxWidth: '1100px', margin: '0 auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                        {plans.map((plan) => {
                            const Icon = plan.icon;
                            return (
                                <div key={plan.name} style={{
                                    ...clayCard, position: 'relative',
                                    padding: '40px 32px 36px',
                                    display: 'flex', flexDirection: 'column',
                                    transition: 'transform 0.3s, box-shadow 0.3s',
                                    ...(plan.popular ? {
                                        border: `2px solid ${plan.accent}40`,
                                        boxShadow: `8px 8px 24px ${plan.accent}15, -4px -4px 12px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)`,
                                    } : {}),
                                }}>
                                    {plan.popular && (
                                        <div style={{
                                            position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                                            background: plan.gradient, color: '#fff',
                                            fontSize: '11px', fontWeight: 700, padding: '6px 20px', borderRadius: '999px',
                                            textTransform: 'uppercase', letterSpacing: '0.06em',
                                            boxShadow: '3px 3px 8px rgba(232,108,44,0.2)',
                                        }}>Most Popular</div>
                                    )}

                                    <div style={{ marginBottom: '24px' }}>
                                        <div style={{ ...clayIconWrap(plan.gradient), marginBottom: '16px' }}>
                                            <Icon size={22} color="#fff" />
                                        </div>
                                        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1A2E35', marginBottom: '4px' }}>{plan.name}</h2>
                                        <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>{plan.tagline}</p>
                                    </div>

                                    <div style={{ marginBottom: '28px' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                            <span style={{ fontSize: '44px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${plan.price}</span>
                                            <span style={{ fontSize: '14px', color: '#8A9BA6', marginLeft: '4px' }}>{plan.period}</span>
                                        </div>
                                        <p style={{ fontSize: '13px', color: plan.accent, fontWeight: 600, marginTop: '6px' }}>{plan.duration} listing</p>
                                    </div>

                                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {plan.features.map((feat) => (
                                            <li key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: '#6B7F8A', lineHeight: 1.45 }}>
                                                <Check size={16} style={{ color: plan.accent, flexShrink: 0, marginTop: '2px' }} />
                                                {feat}
                                            </li>
                                        ))}
                                    </ul>

                                    <Link href={plan.ctaHref} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        padding: '14px 24px', borderRadius: '14px', fontWeight: 700, fontSize: '15px',
                                        textDecoration: 'none', transition: 'all 0.3s',
                                        ...(plan.popular ? {
                                            background: plan.gradient, color: '#fff',
                                            boxShadow: `4px 4px 14px ${plan.accent}30, inset 1px 1px 2px rgba(255,255,255,0.15)`,
                                        } : {
                                            ...clayCard, background: '#FFFFFF', color: '#1A2E35',
                                            padding: '14px 24px',
                                        }),
                                    }}>
                                        {plan.cta} <ArrowRight size={16} />
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Compare Plans Table */}
            {config.isPaidPostingEnabled && (
                <section style={{ padding: '80px 16px' }}>
                    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textAlign: 'center', marginBottom: '32px' }}>Compare Plans</h2>
                        <div style={{ ...clayCard, padding: '8px', overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '16px', color: '#8A9BA6', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature</th>
                                            {plans.map((p) => (
                                                <th key={p.name} style={{ textAlign: 'center', padding: '16px', fontWeight: 700, fontSize: '15px', background: p.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{p.name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { feature: 'Listing Duration', values: ['30 days', '60 days', '90 days'] },
                                            { feature: 'Job Alert Inclusion', values: ['✓', '✓ Priority', '✓ Priority'] },
                                            { feature: 'Featured Badge', values: ['—', '✓', '✓'] },
                                            { feature: 'Top Search Placement', values: ['—', '✓', '✓'] },
                                            { feature: 'Email Digest Highlight', values: ['—', '✓', '✓'] },
                                            { feature: 'Candidate Unlocks', values: ['5/posting', '25/posting', 'Unlimited'] },
                                            { feature: 'InMails', values: ['5/posting', '25/posting', 'Unlimited'] },
                                            { feature: 'Social Media Promo', values: ['—', '—', '✓'] },
                                            { feature: 'Analytics Dashboard', values: ['Basic', 'Advanced', 'Advanced + Reports'] },
                                            { feature: 'Account Support', values: ['Email', 'Email', 'Dedicated'] },
                                        ].map((row, i) => (
                                            <tr key={row.feature} style={{ borderTop: '1px solid rgba(0,0,0,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                                                <td style={{ padding: '14px 16px', color: '#6B7F8A', fontWeight: 500 }}>{row.feature}</td>
                                                {row.values.map((val, j) => (
                                                    <td key={j} style={{ padding: '14px 16px', textAlign: 'center', color: val === '—' ? '#B0BEC5' : '#1A2E35', fontWeight: val === '—' ? 400 : 600 }}>{val}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Why Employers Choose Us */}
            <section style={{ padding: '80px 16px' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textAlign: 'center', marginBottom: '36px' }}>Why Employers Choose Us</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        {[
                            { icon: Users, title: 'Thousands of Active PMHNPs', desc: 'The largest niche job board for psychiatric nurse practitioners.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                            { icon: TrendingUp, title: '3× Higher Engagement', desc: 'Our job seekers are specifically looking for PMHNP roles.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                            { icon: Mail, title: 'Daily Job Alerts', desc: 'Your listing sent directly to thousands of opted-in candidates.', gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
                            { icon: Search, title: 'SEO-Optimized Pages', desc: 'Every listing is discoverable on Google for maximum reach.', gradient: 'linear-gradient(145deg, #059669, #10B981)' },
                            { icon: Share2, title: 'Social Promotion', desc: 'Pro listings are shared across our social media channels.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                            { icon: MessageSquare, title: 'Direct Messaging', desc: 'Pro employers can message candidates directly on the platform.', gradient: 'linear-gradient(145deg, #F59E0B, #EAB308)' },
                        ].map(({ icon: Ic, title, desc, gradient }) => (
                            <div key={title} style={{ ...clayCard, padding: '28px 24px' }}>
                                <div style={{ ...clayIconWrap(gradient), width: '40px', height: '40px', borderRadius: '12px', marginBottom: '14px' }}>
                                    <Ic size={18} color="#fff" />
                                </div>
                                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '6px' }}>{title}</h3>
                                <p style={{ fontSize: '13px', color: '#8A9BA6', lineHeight: 1.5, margin: 0 }}>{desc}</p>
                            </div>
                        ))}
                    </div>
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
                        Post your first job for free and start receiving applications from qualified psychiatric nurse practitioners.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/employer/signup" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '14px 32px', borderRadius: '16px', fontWeight: 700, fontSize: '15px',
                            color: '#fff', background: 'linear-gradient(145deg, #0D9488, #10B981)', textDecoration: 'none',
                            boxShadow: '6px 6px 16px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                        }}>
                            Post a Job — Free <ArrowRight size={16} />
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
