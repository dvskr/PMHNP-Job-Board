// TODO: Replace with real testimonials
'use client';

import { Star } from 'lucide-react';

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
        <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '48px 0' }}>
            <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 20px' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '16px',
                }}>
                    {testimonials.map((t) => (
                        <div
                            key={t.name}
                            style={{
                                borderLeft: `3px solid ${t.color}`,
                                paddingLeft: '16px',
                            }}
                        >
                            <p style={{
                                fontSize: '13.5px', fontStyle: 'italic', lineHeight: 1.65,
                                color: 'var(--text-secondary)', margin: '0 0 10px',
                            }}>
                                &ldquo;{t.quote}&rdquo;
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ display: 'flex', gap: '1px' }}>
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={11} fill="#eab308" style={{ color: '#eab308' }} />
                                    ))}
                                </div>
                                <span style={{
                                    fontSize: '12px', fontWeight: 700,
                                    color: 'var(--text-primary)',
                                }}>
                                    {t.name}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {t.credential}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
