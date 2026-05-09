'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import Image from 'next/image';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Mail, Clock, HelpCircle, CheckCircle, AlertCircle, ChevronDown, Send, Loader2, ArrowRight } from 'lucide-react';

interface ContactFormData { name: string; email: string; subject: string; message: string; }

/* ═══ Clay Tokens ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayInput: React.CSSProperties = {
    // 16px prevents iOS Safari from auto-zooming the viewport on input focus.
    width: '100%', padding: '12px 16px', fontSize: '16px',
    borderRadius: '14px', border: '1px solid rgba(0,0,0,0.08)',
    background: '#F5F6F8', color: '#1A2E35',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
    outline: 'none', fontFamily: 'inherit', transition: 'all 0.2s ease',
    boxSizing: 'border-box' as const,
};

const clayIconWrap = (gradient: string): React.CSSProperties => ({
    width: '40px', height: '40px', borderRadius: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: gradient,
    boxShadow: '3px 3px 8px rgba(0,0,0,0.06), inset 1px 1px 2px rgba(255,255,255,0.2)',
    flexShrink: 0,
});

export default function ContactPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const FAQ_ITEMS = [
        { q: 'Is PMHNP Hiring free for job seekers?', a: 'Yes! Browsing jobs, setting up alerts, and applying are completely free. We never charge job seekers.' },
        { q: 'How often are jobs updated?', a: 'Our pipeline runs twice daily, pulling from 3,000+ companies across major job boards and direct career pages.' },
        { q: 'How do I post a job as an employer?', a: 'Create a free employer account and post your job listing. Featured listings are available for enhanced visibility.' },
        { q: 'Can I get daily job alerts?', a: 'Absolutely! Sign up for free and set your preferences (location, job type, salary range). We\'ll email you matching jobs daily.' },
        { q: 'How do I delete my account?', a: 'Go to Settings > Account and click "Delete Account", or email us at support@pmhnphiring.com and we\'ll handle it within 24 hours.' },
        { q: 'Why did a job listing disappear?', a: 'Jobs are automatically removed when they expire, get filled, or are reported by multiple users as invalid. Check the employer\'s site for the latest openings.' },
    ];

    const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactFormData>();

    const onSubmit = async (data: ContactFormData) => {
        setIsSubmitting(true); setSubmitStatus('idle'); setErrorMessage('');
        try {
            const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (response.ok && result.success) { setSubmitStatus('success'); reset(); }
            else { setSubmitStatus('error'); setErrorMessage(result.error || 'Failed to send message. Please try again.'); }
        } catch (error) {
            console.error('Contact form error:', error);
            setSubmitStatus('error'); setErrorMessage('Failed to send message. Please try again or email us directly.');
        } finally { setIsSubmitting(false); }
    };

    const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor} style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '8px' }}>{children}</label>
    );

    return (
        <div style={{ background: '#F5F6F8', minHeight: '100vh' }}>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Contact', url: 'https://pmhnphiring.com/contact' },
            ]} />

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {FAQ_ITEMS.map((item, i) => (
                        <div key={i} style={{ ...clayCard, overflow: 'hidden', padding: 0 }}>
                            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                            }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', paddingRight: '16px' }}>{item.q}</span>
                                <ChevronDown size={16} style={{ color: '#B0BEC5', flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                            </button>
                            {openFaq === i && (
                                <div style={{ padding: '0 20px 16px', fontSize: '13px', color: '#6B7F8A', lineHeight: 1.6 }}>{item.a}</div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Main Content — Two Column */}
            <section style={{ maxWidth: '960px', margin: '0 auto', padding: '0 16px 80px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>

                    {/* Left: Form */}
                    <div style={{ ...clayCard, padding: '32px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', marginBottom: '24px' }}>Send Us a Message</h2>

                        {submitStatus === 'success' && (
                            <div style={{ ...clayCard, padding: '16px 20px', marginBottom: '20px', background: '#F0FDFA', border: '1px solid #99F6E4', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <CheckCircle size={18} color="#059669" />
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#059669', margin: 0 }}>Message sent!</p>
                                    <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '2px 0 0' }}>We&apos;ll respond within 24-48 hours.</p>
                                </div>
                            </div>
                        )}
                        {submitStatus === 'error' && (
                            <div style={{ ...clayCard, padding: '16px 20px', marginBottom: '20px', background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <AlertCircle size={18} color="#DC2626" />
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#DC2626', margin: 0 }}>Error</p>
                                    <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '2px 0 0' }}>{errorMessage}</p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div>
                                <Label htmlFor="name">Name</Label>
                                <input id="name" type="text" placeholder="Your full name" {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })} style={{ ...clayInput, ...(errors.name ? { borderColor: '#F87171' } : {}) }} />
                                {errors.name && <p style={{ fontSize: '12px', color: '#EF4444', margin: '6px 0 0' }}>{errors.name.message}</p>}
                            </div>
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <input id="email" type="email" placeholder="your.email@example.com" {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email' } })} style={{ ...clayInput, ...(errors.email ? { borderColor: '#F87171' } : {}) }} />
                                {errors.email && <p style={{ fontSize: '12px', color: '#EF4444', margin: '6px 0 0' }}>{errors.email.message}</p>}
                            </div>
                            <div>
                                <Label htmlFor="subject">Subject</Label>
                                <select id="subject" {...register('subject', { required: 'Please select a subject' })} style={{ ...clayInput, ...(errors.subject ? { borderColor: '#F87171' } : {}) }}>
                                    <option value="">Select a subject...</option>
                                    <option value="General Inquiry">General Inquiry</option>
                                    <option value="Job Seeker Support">Job Seeker Support</option>
                                    <option value="Employer Support">Employer Support</option>
                                    <option value="Report a Bug">Report a Bug</option>
                                    <option value="Partnership Inquiry">Partnership Inquiry</option>
                                    <option value="Technical Issue">Technical Issue</option>
                                    <option value="Feedback">Feedback</option>
                                    <option value="Other">Other</option>
                                </select>
                                {errors.subject && <p style={{ fontSize: '12px', color: '#EF4444', margin: '6px 0 0' }}>{errors.subject.message}</p>}
                            </div>
                            <div>
                                <Label htmlFor="message">Message</Label>
                                <textarea id="message" rows={5} placeholder="Tell us how we can help..." {...register('message', { required: 'Message is required', minLength: { value: 10, message: 'Message must be at least 10 characters' } })} style={{ ...clayInput, resize: 'vertical', minHeight: '120px', ...(errors.message ? { borderColor: '#F87171' } : {}) }} />
                                {errors.message && <p style={{ fontSize: '12px', color: '#EF4444', margin: '6px 0 0' }}>{errors.message.message}</p>}
                            </div>
                            <button type="submit" disabled={isSubmitting} style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                padding: '14px 24px', borderRadius: '14px', fontWeight: 700, fontSize: '15px',
                                background: isSubmitting ? 'rgba(13,148,136,0.3)' : 'linear-gradient(145deg, #0D9488, #10B981)',
                                color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                boxShadow: '6px 6px 16px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                                transition: 'all 0.2s ease', width: '100%',
                            }}>
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {isSubmitting ? 'Sending...' : 'Send Message'}
                            </button>
                        </form>
                    </div>

                    {/* Right: Info */}
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
