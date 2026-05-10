'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle, AlertCircle, Send, Loader2 } from 'lucide-react';

interface ContactFormData {
    name: string;
    email: string;
    subject: string;
    message: string;
}

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

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
    return (
        <label htmlFor={htmlFor} style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '8px' }}>
            {children}
        </label>
    );
}

export default function ContactForm() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactFormData>();

    const onSubmit = async (data: ContactFormData) => {
        setIsSubmitting(true);
        setSubmitStatus('idle');
        setErrorMessage('');
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (response.ok && result.success) {
                setSubmitStatus('success');
                reset();
            } else {
                setSubmitStatus('error');
                setErrorMessage(result.error || 'Failed to send message. Please try again.');
            }
        } catch (error) {
            console.error('Contact form error:', error);
            setSubmitStatus('error');
            setErrorMessage('Failed to send message. Please try again or email us directly.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
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
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <input id="name" type="text" placeholder="Your full name" {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })} style={{ ...clayInput, ...(errors.name ? { borderColor: '#F87171' } : {}) }} />
                    {errors.name && <p style={{ fontSize: '12px', color: '#EF4444', margin: '6px 0 0' }}>{errors.name.message}</p>}
                </div>
                <div>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <input id="email" type="email" placeholder="your.email@example.com" {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email' } })} style={{ ...clayInput, ...(errors.email ? { borderColor: '#F87171' } : {}) }} />
                    {errors.email && <p style={{ fontSize: '12px', color: '#EF4444', margin: '6px 0 0' }}>{errors.email.message}</p>}
                </div>
                <div>
                    <FieldLabel htmlFor="subject">Subject</FieldLabel>
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
                    <FieldLabel htmlFor="message">Message</FieldLabel>
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
    );
}
