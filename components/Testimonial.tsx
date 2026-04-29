// TODO: Replace with real testimonials
'use client';

import { Star, Quote } from 'lucide-react';

const testimonials = [
    {
        quote: 'Found my telehealth role in two weeks. No more filtering out irrelevant PA and NP positions.',
        name: 'Sarah M.',
        credential: 'PMHNP-BC',
        color: '#E86C2C',
    },
    {
        quote: 'Salary transparency saved me weeks of back-and-forth. I could compare offers and negotiate confidently.',
        name: 'James R.',
        credential: 'PMHNP-BC',
        color: '#2dd4bf',
    },
    {
        quote: 'As a new grad, I filtered for entry-level roles and had three interviews within a week.',
        name: 'Priya K.',
        credential: 'PMHNP',
        color: '#8b5cf6',
    },
];

export default function Testimonial() {
    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 20px' }}>
            {/* Section heading */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h2 className="font-heading" style={{
                    fontSize: '28px', fontWeight: 700,
                    color: 'var(--text-primary)', margin: '0 0 8px',
                }}>
                    What PMHNPs Are Saying
                </h2>
                <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: 0 }}>
                    Real feedback from psychiatric nurse practitioners
                </p>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '20px',
            }}>
                {testimonials.map((t) => (
                    <div
                        key={t.name}
                        className="card-precision"
                        style={{
                            borderLeft: `3px solid ${t.color}`,
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Decorative quote mark */}
                        <Quote
                            size={48}
                            style={{
                                position: 'absolute',
                                top: '12px',
                                right: '16px',
                                color: t.color,
                                opacity: 0.08,
                            }}
                        />

                        <p className="font-heading" style={{
                            fontSize: '14px', fontStyle: 'italic', lineHeight: 1.7,
                            color: 'var(--text-secondary)', margin: '0 0 16px',
                            position: 'relative',
                        }}>
                            &ldquo;{t.quote}&rdquo;
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {/* Avatar initial */}
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: `linear-gradient(135deg, ${t.color}, ${t.color}88)`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <span style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#fff',
                                }}>
                                    {t.name.charAt(0)}
                                </span>
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ display: 'flex', gap: '1px' }}>
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} size={11} fill="#eab308" style={{ color: '#eab308' }} />
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                    <span style={{
                                        fontSize: '13px', fontWeight: 700,
                                        color: 'var(--text-primary)',
                                    }}>
                                        {t.name}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {t.credential}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
