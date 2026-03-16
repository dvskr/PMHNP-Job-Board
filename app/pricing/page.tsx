import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { config } from '@/lib/config';
import {
    Check,
    Sparkles,
    Crown,
    Zap,
    ArrowRight,
    Users,
    TrendingUp,
    Mail,
    Share2,
    Search,
    MessageSquare,
    HelpCircle,
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

const plans = [
    {
        name: 'Starter',
        price: 199,
        period: 'per posting',
        tagline: 'Everything you need to get started',
        cta: 'Get Started',
        ctaHref: '/employer/signup',
        icon: Zap,
        color: '#2DD4BF',
        popular: false,
        duration: '30 days',
        features: [
            '30-day job listing',
            'Included in daily job alerts',
            'Full job description page',
            'Basic analytics (views)',
            '5 candidate unlocks/posting',
            '5 InMails/posting',
        ],
    },
    {
        name: 'Growth',
        price: 299,
        period: 'per posting',
        tagline: 'Maximum visibility for your listing',
        cta: 'Get Growth',
        ctaHref: '/employer/signup',
        icon: Sparkles,
        color: '#E86C2C',
        popular: true,
        duration: '60 days',
        features: [
            '60-day listing (2× longer)',
            '"Featured" badge on listing',
            'Top placement in search results',
            'Highlighted in email digests',
            '25 candidate unlocks/posting',
            '25 InMails/posting',
            'Advanced analytics (views, clicks, sources)',
        ],
    },
    {
        name: 'Premium',
        price: 399,
        period: 'per posting',
        tagline: 'Full-service recruitment power',
        cta: 'Go Premium',
        ctaHref: '/employer/signup',
        icon: Crown,
        color: '#A855F7',
        popular: false,
        duration: '90 days',
        features: [
            '90-day listing (3× longer)',
            'Everything in Growth',
            'Unlimited candidate unlocks',
            'Unlimited InMails',
            'Social media promotion',
            'Dedicated account support',
        ],
    },
];

const faqs = [
    {
        q: 'Is the first post really free?',
        a: 'Yes! Your first job posting is completely free with a Starter listing — no credit card required. We want you to experience the quality of our PMHNP candidate pool before committing.',
    },
    {
        q: 'How long do job postings stay active?',
        a: 'Starter posts are active for 30 days, Growth for 60 days, and Premium for 90 days. You can renew at any time from your employer dashboard.',
    },
    {
        q: 'Can I upgrade my plan after posting?',
        a: 'Absolutely! You can upgrade from Starter to Growth or Premium anytime. You\'ll only pay the difference between the plans.',
    },
    {
        q: 'What is candidate database access?',
        a: 'Starter employers can preview candidate profiles (specialties, experience, location). Growth and Premium employers get full access including contact details, resumes, LinkedIn profiles, and direct messaging — with higher unlock and InMail limits on Premium.',
    },
    {
        q: 'Do you offer bulk discounts?',
        a: 'Yes! Contact us for custom pricing if you need to post 5+ positions. We offer volume discounts and annual plans for larger organizations.',
    },
    {
        q: 'Can I edit my job posting after publishing?',
        a: 'Yes, all plans include unlimited edits. Update salary, requirements, or any details from your dashboard — changes go live immediately.',
    },
];

export default function PricingPage() {
    return (
        <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
            <BreadcrumbSchema
                items={[
                    { name: 'Home', url: 'https://pmhnphiring.com' },
                    { name: 'Pricing', url: 'https://pmhnphiring.com/pricing' },
                ]}
            />

            {/* Hero */}
            <section style={{ padding: '80px 16px 48px', textAlign: 'center' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <h1
                        style={{
                            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            marginBottom: '16px',
                            lineHeight: 1.15,
                        }}
                    >
                        {config.isPaidPostingEnabled ? 'Simple, Transparent Pricing' : 'Post PMHNP Jobs for Free'}
                    </h1>
                    <p
                        style={{
                            fontSize: '18px',
                            color: 'var(--text-secondary)',
                            maxWidth: '600px',
                            margin: '0 auto',
                            lineHeight: 1.6,
                        }}
                    >
                        {config.isPaidPostingEnabled
                            ? 'Choose the plan that fits your hiring needs. No subscriptions, no contracts \u2014 just results.'
                            : 'Reach 6,000+ psychiatric nurse practitioners actively searching. No credit card required. Go live in under 5 minutes.'}
                    </p>
                    {!config.isPaidPostingEnabled && (
                        <div style={{ marginTop: '28px' }}>
                            <Link href="/post-job" style={{
                                padding: '14px 36px', borderRadius: '14px', fontWeight: 700, fontSize: '16px',
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)', color: '#fff',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 4px 20px rgba(45,212,191,0.3)',
                            }}>
                                Post a Job \u2014 Free <ArrowRight size={18} />
                            </Link>
                        </div>
                    )}
                </div>
            </section>

            {/* What You Get — shown during free launch */}
            {!config.isPaidPostingEnabled && (
                <section style={{ padding: '0 16px 80px', maxWidth: '900px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
                        What You Get
                    </h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
                        Every job posting includes all of this — completely free.
                    </p>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px',
                    }}>
                        {[
                            { icon: Zap, title: '30-Day Job Listing', desc: 'Your posting stays active for a full 30 days, visible to all PMHNPs.', color: '#2DD4BF' },
                            { icon: Mail, title: 'Daily Job Alert Emails', desc: 'Your listing is emailed directly to thousands of opted-in PMHNP candidates.', color: '#E86C2C' },
                            { icon: Search, title: 'Full Job Description Page', desc: 'A dedicated, SEO-optimized page with all the details candidates need to apply.', color: '#A855F7' },
                            { icon: TrendingUp, title: 'Basic Analytics (Views)', desc: 'Track how many job seekers view your listing from your employer dashboard.', color: '#3B82F6' },
                            { icon: Users, title: '5 Candidate Unlocks/mo', desc: 'Preview candidate profiles and unlock up to 5 per month.', color: '#10B981' },
                            { icon: MessageSquare, title: '5 InMails/mo', desc: 'Message up to 5 candidates directly on the platform each month.', color: '#F59E0B' },
                        ].map(({ icon: Ic, title, desc, color }) => (
                            <div key={title} style={{
                                padding: '24px 20px', borderRadius: '14px',
                                backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                            }}>
                                <Ic size={24} style={{ color, marginBottom: '12px' }} />
                                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>{title}</h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{desc}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {config.isPaidPostingEnabled && (
                <section style={{ padding: '0 16px 80px', maxWidth: '1100px', margin: '0 auto' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                            gap: '24px',
                        }}
                    >
                        {plans.map((plan) => {
                            const Icon = plan.icon;
                            return (
                                <div
                                    key={plan.name}
                                    style={{
                                        position: 'relative',
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: plan.popular
                                            ? `2px solid ${plan.color}`
                                            : '1px solid var(--border-color)',
                                        borderRadius: '20px',
                                        padding: '40px 32px 36px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'transform 0.3s, box-shadow 0.3s',
                                        boxShadow: plan.popular
                                            ? `0 8px 40px rgba(232,108,44,0.15)`
                                            : '0 2px 12px rgba(0,0,0,0.05)',
                                    }}
                                >
                                    {plan.popular && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '-14px',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                background: `linear-gradient(135deg, ${plan.color}, #F59E0B)`,
                                                color: '#fff',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                padding: '6px 20px',
                                                borderRadius: '999px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                            }}
                                        >
                                            Most Popular
                                        </div>
                                    )}

                                    {/* Plan header */}
                                    <div style={{ marginBottom: '24px' }}>
                                        <div
                                            style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '14px',
                                                background: `linear-gradient(135deg, ${plan.color}22, ${plan.color}11)`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginBottom: '16px',
                                            }}
                                        >
                                            <Icon size={24} style={{ color: plan.color }} />
                                        </div>
                                        <h2
                                            style={{
                                                fontSize: '22px',
                                                fontWeight: 700,
                                                color: 'var(--text-primary)',
                                                marginBottom: '4px',
                                            }}
                                        >
                                            {plan.name}
                                        </h2>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                            {plan.tagline}
                                        </p>
                                    </div>

                                    {/* Price */}
                                    <div style={{ marginBottom: '28px' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                            <span
                                                style={{
                                                    fontSize: '48px',
                                                    fontWeight: 800,
                                                    color: 'var(--text-primary)',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                ${plan.price}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '14px',
                                                    color: 'var(--text-muted)',
                                                    marginLeft: '4px',
                                                }}
                                            >
                                                {plan.period}
                                            </span>
                                        </div>
                                        <p
                                            style={{
                                                fontSize: '13px',
                                                color: plan.color,
                                                fontWeight: 600,
                                                marginTop: '6px',
                                            }}
                                        >
                                            {plan.duration} listing
                                        </p>
                                    </div>

                                    {/* Features */}
                                    <ul
                                        style={{
                                            listStyle: 'none',
                                            padding: 0,
                                            margin: '0 0 32px',
                                            flex: 1,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '14px',
                                        }}
                                    >
                                        {plan.features.map((feat) => (
                                            <li
                                                key={feat}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '10px',
                                                    fontSize: '14px',
                                                    color: 'var(--text-secondary)',
                                                    lineHeight: 1.45,
                                                }}
                                            >
                                                <Check
                                                    size={16}
                                                    style={{
                                                        color: plan.color,
                                                        flexShrink: 0,
                                                        marginTop: '2px',
                                                    }}
                                                />
                                                {feat}
                                            </li>
                                        ))}
                                    </ul>

                                    {/* CTA Button */}
                                    <Link
                                        href={plan.ctaHref}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            padding: '14px 24px',
                                            borderRadius: '14px',
                                            fontWeight: 700,
                                            fontSize: '15px',
                                            textDecoration: 'none',
                                            transition: 'all 0.3s',
                                            ...(plan.popular
                                                ? {
                                                    background: `linear-gradient(135deg, ${plan.color}, #F59E0B)`,
                                                    color: '#fff',
                                                    boxShadow: `0 4px 16px ${plan.color}40`,
                                                }
                                                : {
                                                    backgroundColor: 'var(--bg-tertiary)',
                                                    color: 'var(--text-primary)',
                                                    border: '1px solid var(--border-color)',
                                                }),
                                        }}
                                    >
                                        {plan.cta} <ArrowRight size={16} />
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {config.isPaidPostingEnabled && (
                <section
                    style={{
                        padding: '80px 16px',
                        backgroundColor: 'var(--bg-secondary)',
                    }}
                >
                    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                        <h2
                            style={{
                                fontSize: '28px',
                                fontWeight: 800,
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                                marginBottom: '48px',
                            }}
                        >
                            Compare Plans
                        </h2>

                        <div style={{ overflowX: 'auto' }}>
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '14px',
                                }}
                            >
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th
                                            style={{
                                                textAlign: 'left',
                                                padding: '14px 16px',
                                                color: 'var(--text-muted)',
                                                fontWeight: 600,
                                                fontSize: '13px',
                                            }}
                                        >
                                            Feature
                                        </th>
                                        {plans.map((p) => (
                                            <th
                                                key={p.name}
                                                style={{
                                                    textAlign: 'center',
                                                    padding: '14px 16px',
                                                    color: p.color,
                                                    fontWeight: 700,
                                                    fontSize: '15px',
                                                }}
                                            >
                                                {p.name}
                                            </th>
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
                                        <tr
                                            key={row.feature}
                                            style={{
                                                borderBottom: '1px solid var(--border-color)',
                                                backgroundColor:
                                                    i % 2 === 0
                                                        ? 'transparent'
                                                        : 'rgba(255,255,255,0.02)',
                                            }}
                                        >
                                            <td
                                                style={{
                                                    padding: '14px 16px',
                                                    color: 'var(--text-secondary)',
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {row.feature}
                                            </td>
                                            {row.values.map((val, j) => (
                                                <td
                                                    key={j}
                                                    style={{
                                                        padding: '14px 16px',
                                                        textAlign: 'center',
                                                        color:
                                                            val === '—'
                                                                ? 'var(--text-muted)'
                                                                : 'var(--text-primary)',
                                                        fontWeight: val === '—' ? 400 : 600,
                                                    }}
                                                >
                                                    {val}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            {/* Why Employers Choose Us */}
            <section style={{ padding: '80px 16px' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <h2
                        style={{
                            fontSize: '28px',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            marginBottom: '48px',
                        }}
                    >
                        Why Employers Choose Us
                    </h2>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '24px',
                        }}
                    >
                        {[
                            { icon: Users, title: '6,300+ Active PMHNPs', desc: 'The largest niche job board for psychiatric nurse practitioners.' },
                            { icon: TrendingUp, title: '3× Higher Engagement', desc: 'Our job seekers are specifically looking for PMHNP roles.' },
                            { icon: Mail, title: 'Daily Job Alerts', desc: 'Your listing sent directly to thousands of opted-in candidates.' },
                            { icon: Search, title: 'SEO-Optimized Pages', desc: 'Every listing is discoverable on Google for maximum reach.' },
                            { icon: Share2, title: 'Social Promotion', desc: 'Pro listings are shared across our social media channels.' },
                            { icon: MessageSquare, title: 'Direct Messaging', desc: 'Pro employers can message candidates directly on the platform.' },
                        ].map(({ icon: Ic, title, desc }) => (
                            <div
                                key={title}
                                style={{
                                    padding: '28px 24px',
                                    borderRadius: '16px',
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                }}
                            >
                                <Ic
                                    size={28}
                                    style={{ color: '#2DD4BF', marginBottom: '12px' }}
                                />
                                <h3
                                    style={{
                                        fontSize: '16px',
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        marginBottom: '6px',
                                    }}
                                >
                                    {title}
                                </h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    {desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section
                style={{
                    padding: '80px 16px',
                    backgroundColor: 'var(--bg-secondary)',
                }}
            >
                <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                    <h2
                        style={{
                            fontSize: '28px',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            marginBottom: '48px',
                        }}
                    >
                        Frequently Asked Questions
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {faqs.map(({ q, a }) => (
                            <details
                                key={q}
                                style={{
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '14px',
                                    padding: '0',
                                    overflow: 'hidden',
                                }}
                            >
                                <summary
                                    style={{
                                        padding: '18px 20px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        listStyle: 'none',
                                    }}
                                >
                                    <HelpCircle
                                        size={18}
                                        style={{ color: '#2DD4BF', flexShrink: 0 }}
                                    />
                                    {q}
                                </summary>
                                <div
                                    style={{
                                        padding: '0 20px 18px 50px',
                                        fontSize: '14px',
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.65,
                                    }}
                                >
                                    {a}
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom CTA */}
            <section style={{ padding: '80px 16px', textAlign: 'center' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h2
                        style={{
                            fontSize: '28px',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            marginBottom: '12px',
                        }}
                    >
                        Ready to Hire Your Next PMHNP?
                    </h2>
                    <p
                        style={{
                            fontSize: '16px',
                            color: 'var(--text-secondary)',
                            marginBottom: '28px',
                        }}
                    >
                        Post your first job for free and start receiving applications from qualified psychiatric nurse practitioners.
                    </p>
                    <div
                        style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                        }}
                    >
                        <Link
                            href="/employer/signup"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '14px 32px',
                                borderRadius: '14px',
                                fontWeight: 700,
                                fontSize: '15px',
                                color: '#fff',
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                textDecoration: 'none',
                                boxShadow: '0 4px 16px rgba(45,212,191,0.25)',
                            }}
                        >
                            Post a Job — Free <ArrowRight size={16} />
                        </Link>
                        <a
                            href="mailto:support@pmhnphiring.com"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '14px 32px',
                                borderRadius: '14px',
                                fontWeight: 600,
                                fontSize: '15px',
                                color: 'var(--text-primary)',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                textDecoration: 'none',
                            }}
                        >
                            Contact Sales
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}
