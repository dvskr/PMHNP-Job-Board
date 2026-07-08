'use client';

import { useEffect, useState } from 'react';
import { MessageSquareQuote, Star, ShieldCheck, ShieldOff } from 'lucide-react';

/* ─── Types ─── */
interface Testimonial {
    id: string;
    employerName: string;
    content: string;
    rating: number | null;
    consent: boolean;
    displayAs: string;
    featuredAt: string | null;
    createdAt: string;
}

/* ─── Design tokens (match existing admin claymorphism) ─── */
const clayCard: React.CSSProperties = {
    backgroundColor: '#FAFBF9',
    border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: '18px',
    boxShadow:
        '8px 8px 20px rgba(0,0,0,0.05), -6px -6px 16px rgba(255,255,255,0.9), ' +
        'inset 3px 3px 6px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.02)',
    overflow: 'hidden',
};
const sub: React.CSSProperties = { color: '#6B7F8A', fontSize: '14px' };
const muted: React.CSSProperties = { color: '#94A3B8', fontSize: '12px' };
const th: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', borderBottom: '1px solid #E8ECF0', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #E8ECF0', verticalAlign: 'top' };

function badge(text: string, color: 'green' | 'purple' | 'blue' | 'gray' | 'red' | 'orange') {
    const colors = {
        green: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E' },
        purple: { bg: 'rgba(168,85,247,0.12)', text: '#A855F7' },
        blue: { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
        gray: { bg: 'rgba(148,163,184,0.12)', text: '#94A3B8' },
        red: { bg: 'rgba(239,68,68,0.12)', text: '#EF4444' },
        orange: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
    };
    return <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: colors[color].bg, color: colors[color].text, whiteSpace: 'nowrap' }}>{text}</span>;
}

function displayAsBadge(displayAs: string) {
    if (displayAs === 'full') return badge('Full name', 'blue');
    if (displayAs === 'anonymous') return badge('Anonymous', 'gray');
    return badge('First name + initial', 'purple');
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminTestimonialsPage() {
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/admin/testimonials', { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Request failed');
                if (!cancelled) setTestimonials(json.testimonials);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const showMsg = (text: string, isError: boolean) => {
        setActionMsg({ text, isError });
        setTimeout(() => setActionMsg(null), 4000);
    };

    const toggleFeatured = async (id: string, featured: boolean) => {
        setBusyId(id);
        try {
            const res = await fetch('/api/admin/testimonials', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, featured }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                showMsg(json.error || 'Failed to update testimonial.', true);
                return;
            }
            setTestimonials((prev) => prev.map((t) => (
                t.id === id ? { ...t, featuredAt: json.testimonial.featuredAt } : t
            )));
            showMsg(featured ? 'Testimonial is now featured publicly.' : 'Testimonial removed from public display.', false);
        } catch {
            showMsg('Failed to update testimonial. Please try again.', true);
        } finally {
            setBusyId(null);
        }
    };

    const featuredCount = testimonials.filter((t) => t.featuredAt !== null).length;
    const consentedCount = testimonials.filter((t) => t.consent).length;

    if (loading) {
        return (
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
                <MessageSquareQuote className="animate-pulse" size={48} style={{ color: '#0D9488', margin: '0 auto' }} />
                <p style={{ marginTop: '16px', color: '#6B7F8A' }}>Loading employer testimonials…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
                <div style={{ ...clayCard, padding: '22px', color: '#991B1B', backgroundColor: '#FEF2F2' }}>
                    Error loading testimonials: {error}
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1A2E35', marginBottom: '4px', fontFamily: 'var(--font-lora), Georgia, serif' }}>
                    Employer Testimonials
                </h1>
                <p style={sub}>
                    {testimonials.length} submitted · {consentedCount} consented · {featuredCount} featured publicly.
                    Only testimonials with explicit consent can be featured.
                </p>
            </div>

            {/* Action feedback */}
            {actionMsg && (
                <div style={{
                    ...clayCard,
                    padding: '12px 18px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: actionMsg.isError ? '#991B1B' : '#0D9488',
                    backgroundColor: actionMsg.isError ? '#FEF2F2' : '#E6FAF8',
                }}>
                    {actionMsg.text}
                </div>
            )}

            {/* Table */}
            <div style={clayCard}>
                {testimonials.length === 0 ? (
                    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                        <MessageSquareQuote size={36} style={{ color: '#94A3B8', margin: '0 auto 12px' }} />
                        <p style={sub}>No employer testimonials have been submitted yet.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={th}>Employer</th>
                                    <th style={th}>Testimonial</th>
                                    <th style={th}>Rating</th>
                                    <th style={th}>Consent</th>
                                    <th style={th}>Display As</th>
                                    <th style={th}>Submitted</th>
                                    <th style={th}>Public Display</th>
                                </tr>
                            </thead>
                            <tbody>
                                {testimonials.map((t) => {
                                    const isFeatured = t.featuredAt !== null;
                                    const isBusy = busyId === t.id;
                                    return (
                                        <tr key={t.id}>
                                            <td style={{ ...td, fontWeight: 600, color: '#1A2E35', whiteSpace: 'nowrap' }}>{t.employerName}</td>
                                            <td style={{ ...td, minWidth: '260px', maxWidth: '420px', lineHeight: 1.55 }}>{t.content}</td>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                                {t.rating !== null ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#F59E0B', fontWeight: 600 }}>
                                                        <Star size={14} fill="#F59E0B" /> {t.rating}/5
                                                    </span>
                                                ) : (
                                                    <span style={muted}>—</span>
                                                )}
                                            </td>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                                {t.consent ? badge('Consented', 'green') : badge('No consent', 'red')}
                                            </td>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{displayAsBadge(t.displayAs)}</td>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</td>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {isFeatured ? badge('Featured', 'green') : badge('Hidden', 'gray')}
                                                    <button
                                                        onClick={() => toggleFeatured(t.id, !isFeatured)}
                                                        disabled={isBusy || (!isFeatured && !t.consent)}
                                                        title={!isFeatured && !t.consent ? 'Cannot feature without employer consent' : undefined}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                            padding: '7px 14px', borderRadius: '10px',
                                                            fontSize: '12px', fontWeight: 600,
                                                            cursor: isBusy || (!isFeatured && !t.consent) ? 'not-allowed' : 'pointer',
                                                            opacity: isBusy || (!isFeatured && !t.consent) ? 0.5 : 1,
                                                            color: isFeatured ? '#991B1B' : '#0D9488',
                                                            backgroundColor: isFeatured ? '#FEF2F2' : '#E6FAF8',
                                                            border: isFeatured ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(13,148,136,0.15)',
                                                            boxShadow: '3px 3px 8px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8)',
                                                        }}
                                                    >
                                                        {isFeatured ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                                                        {isBusy ? 'Saving…' : isFeatured ? 'Unfeature' : 'Feature'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p style={{ ...muted, marginTop: '16px' }}>
                Featured testimonials appear on the pricing page, newest first (up to three).
                Names are shown according to each employer&apos;s chosen display preference.
            </p>
        </div>
    );
}
