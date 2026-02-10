'use client';

import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';

interface StateData {
    state: string;
    count: number;
}

interface BrowseByStateProps {
    states: StateData[];
}

export default function BrowseByState({ states }: BrowseByStateProps) {
    if (states.length === 0) return null;

    return (
        <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '64px 0 72px' }}>
            <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 20px' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '28px', fontWeight: 700,
                        color: 'var(--text-primary)', margin: '0 0 8px',
                    }}>
                        Find PMHNP Jobs by State
                    </h2>
                    <p style={{
                        fontSize: '15px', color: 'var(--text-muted)', margin: 0,
                    }}>
                        Browse positions across the country
                    </p>
                </div>

                {/* Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px',
                }}>
                    {states.map((s) => (
                        <Link
                            key={s.state}
                            href={`/jobs?location=${encodeURIComponent(s.state)}`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '16px 18px',
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                textDecoration: 'none',
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.borderColor = '#2dd4bf';
                                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <MapPin size={16} style={{ color: '#2dd4bf', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '14px', fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {s.state}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)',
                                flexShrink: 0,
                            }}>
                                {s.count.toLocaleString()}
                            </span>
                        </Link>
                    ))}
                </div>

                {/* CTA */}
                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                    <Link
                        href="/jobs"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            fontSize: '14px', fontWeight: 600, color: '#2dd4bf',
                            textDecoration: 'none',
                        }}
                    >
                        View All Locations
                        <ArrowRight size={15} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
