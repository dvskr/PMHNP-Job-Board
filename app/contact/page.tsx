import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Clock, HelpCircle, ArrowRight } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { brand } from '@/config/brand';
import ContactForm from './ContactForm';
import ContactFAQ from './ContactFAQ';

// Single source of truth for FAQ content. Both the FAQPage JSON-LD (server-
// rendered into <head>-adjacent script) and the visible accordion (client-
// rendered for the toggle UX) consume this list — they cannot diverge.
const FAQ_ITEMS = [
    { q: 'Is PMHNP Hiring free for job seekers?', a: 'Yes! Browsing jobs, setting up alerts, and applying are completely free. We never charge job seekers.' },
    { q: 'How often are jobs updated?', a: 'Our pipeline runs twice daily, pulling from 3,000+ companies across major job boards and direct career pages.' },
    { q: 'How do I post a job as an employer?', a: 'Create a free employer account and post your job listing. Featured listings are available for enhanced visibility.' },
    { q: 'Can I get daily job alerts?', a: 'Absolutely! Sign up for free and set your preferences (location, job type, salary range). We\'ll email you matching jobs daily.' },
    { q: 'How do I delete my account?', a: 'Go to Settings > Account and click "Delete Account", or email us at support@pmhnphiring.com and we\'ll handle it within 24 hours.' },
    { q: 'Why did a job listing disappear?', a: 'Jobs are automatically removed when they expire, get filled, or are reported by multiple users as invalid. Check the employer\'s site for the latest openings.' },
];

export const metadata: Metadata = {
    // `absolute` opts out of the layout title template so we don't
    // double-suffix " | PMHNP Hiring".
    title: { absolute: 'Contact PMHNP Hiring — Support, Employer & Partnership Inquiries' },
    description: 'Reach the PMHNP Hiring team for job-seeker support, employer questions, partnerships, or feedback. We respond within 24-48 hours.',
    alternates: { canonical: `${brand.baseUrl}/contact` },
    openGraph: {
        title: 'Contact PMHNP Hiring',
        description: 'Get in touch with the team behind the #1 PMHNP job board — support, employer, and partnership inquiries.',
        type: 'website',
        url: `${brand.baseUrl}/contact`,
        siteName: 'PMHNP Hiring',
    },
    twitter: { card: 'summary_large_image', title: 'Contact PMHNP Hiring', description: 'Get in touch with the team — support, employer, and partnership inquiries.' },
};

const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayIconWrap = (gradient: string): React.CSSProperties => ({
    width: '40px', height: '40px', borderRadius: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: gradient,
    boxShadow: '3px 3px 8px rgba(0,0,0,0.06), inset 1px 1px 2px rgba(255,255,255,0.2)',
    flexShrink: 0,
});

export default function ContactPage() {
    const contactPageSchema = {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        '@id': `${brand.baseUrl}/contact#contactpage`,
        url: `${brand.baseUrl}/contact`,
        name: 'Contact PMHNP Hiring',
        description: 'Reach the PMHNP Hiring team for support, employer, and partnership inquiries.',
        mainEntity: {
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            url: brand.baseUrl,
            contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                email: 'support@pmhnphiring.com',
                availableLanguage: 'English',
                areaServed: 'US',
            },
        },
    };

    const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
    };

    return (
        <div style={{ background: '#F5F6F8', minHeight: '100vh' }}>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Contact', url: 'https://pmhnphiring.com/contact' },
            ]} />

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />

            {/* Hero */}
            <section style={{ padding: '80px 16px 64px', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '32px', alignItems: 'center' }} className="contact-hero-grid">
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#E6F4F1', color: '#0D9488', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '24px' }}>
                            <Mail size={14} /> Contact Us
                        </div>
                        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 3.5rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', marginBottom: '16px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                            We&apos;d love to <span style={{ color: '#0D9488' }}>hear from you</span>
                        </h1>
                        <p style={{ fontSize: '20px', color: '#6B7F8A', lineHeight: 1.6, margin: 0, maxWidth: '500px' }}>
                            Whether you represent a clinic seeking your next top-tier PMHNP, or you&apos;re a candidate looking for the perfect match, our team is standing by.
                        </p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/clay_hero_contact.webp" alt="Contact PMHNP Jobs" width={280} height={280} style={{ objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.15))' }} priority />
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section style={{ maxWidth: '700px', margin: '0 auto', padding: '0 16px 40px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textAlign: 'center', marginBottom: '20px' }}>
                    Quick Answers
                </h2>
                <ContactFAQ items={FAQ_ITEMS} />
            </section>

            {/* Main Content — Two Column */}
            <section style={{ maxWidth: '960px', margin: '0 auto', padding: '0 16px 80px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>

                    {/* Left: Form (interactive — extracted as a client child) */}
                    <ContactForm />

                    {/* Right: Info (static — server-rendered) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ ...clayCard, padding: '24px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', marginBottom: '18px' }}>Contact Info</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ ...clayIconWrap('linear-gradient(145deg, #0D9488, #10B981)'), width: '36px', height: '36px', borderRadius: '10px' }}>
                                        <Mail size={16} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: '0 0 2px' }}>Email</p>
                                        <a href="mailto:support@pmhnphiring.com" style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none' }}>support@pmhnphiring.com</a>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ ...clayIconWrap('linear-gradient(145deg, #3B82F6, #60A5FA)'), width: '36px', height: '36px', borderRadius: '10px' }}>
                                        <Clock size={16} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: '0 0 2px' }}>Response Time</p>
                                        <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>We respond within 24-48 hours</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ ...clayIconWrap('linear-gradient(145deg, #8B5CF6, #A855F7)'), width: '36px', height: '36px', borderRadius: '10px' }}>
                                        <HelpCircle size={16} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: '0 0 2px' }}>Quick Answers</p>
                                        <Link href="/faq" style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Visit FAQ <ArrowRight size={12} /></Link>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ ...clayCard, padding: '24px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', marginBottom: '14px' }}>Quick Links</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {[
                                    { label: 'FAQ', href: '/faq' },
                                    { label: 'About PMHNP Jobs', href: '/about' },
                                    { label: 'Terms of Service', href: '/terms' },
                                    { label: 'Privacy Policy', href: '/privacy' },
                                ].map(link => (
                                    <Link key={link.href} href={link.href} style={{
                                        fontSize: '13px', color: '#0D9488', textDecoration: 'none',
                                        padding: '8px 12px', borderRadius: '10px', background: '#F5F6F8',
                                        boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.03)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        {link.label} <ArrowRight size={12} />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <style>{`
                @media (max-width: 768px) {
                    section > div[style*="grid-template-columns: 2fr 1fr"] {
                        grid-template-columns: 1fr !important;
                    }
                    .contact-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
                    .contact-hero-grid > div:last-child { order: -1; }
                    .contact-hero-grid > div:first-child p { margin-left: auto; margin-right: auto; }
                }
            `}</style>
        </div>
    );
}
