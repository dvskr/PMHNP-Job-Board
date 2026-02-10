'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight, Clock, Sparkles } from 'lucide-react';

interface FeaturedJob {
    id: string;
    slug: string | null;
    title: string;
    employer: string;
    location: string;
    jobType: string | null;
    displaySalary: string | null;
    createdAt: string;
}

interface FeaturedJobsProps {
    jobs: FeaturedJob[];
}

function relativeTime(s: string): string {
    const ms = Date.now() - new Date(s).getTime();
    const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), d = Math.floor(ms / 86400000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

function isNew(s: string): boolean {
    return Date.now() - new Date(s).getTime() < 48 * 3600000;
}

function avatarGradient(name: string): string {
    const gs = [
        'linear-gradient(135deg, #06b6d4, #3b82f6)',
        'linear-gradient(135deg, #8b5cf6, #ec4899)',
        'linear-gradient(135deg, #f59e0b, #ef4444)',
        'linear-gradient(135deg, #10b981, #14b8a6)',
        'linear-gradient(135deg, #6366f1, #8b5cf6)',
        'linear-gradient(135deg, #ec4899, #f43f5e)',
        'linear-gradient(135deg, #14b8a6, #06b6d4)',
        'linear-gradient(135deg, #3b82f6, #6366f1)',
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return gs[Math.abs(h) % gs.length];
}

function initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const TC: Record<string, { bg: string; fg: string }> = {
    'Full-Time': { bg: 'rgba(34,197,94,0.1)', fg: '#22c55e' },
    'Part-Time': { bg: 'rgba(59,130,246,0.1)', fg: '#3b82f6' },
    'Contract': { bg: 'rgba(234,179,8,0.1)', fg: '#eab308' },
    'PRN': { bg: 'rgba(168,85,247,0.1)', fg: '#a855f7' },
    'Per Diem': { bg: 'rgba(168,85,247,0.1)', fg: '#a855f7' },
};

export default function FeaturedJobs({ jobs }: FeaturedJobsProps) {
    useEffect(() => {
        const id = 'fj-styles';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
      .fj-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px 24px;
        text-decoration: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .fj-row::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 12px;
        opacity: 0;
        background: linear-gradient(90deg,
          rgba(45, 212, 191, 0.03),
          rgba(45, 212, 191, 0.07),
          rgba(45, 212, 191, 0.03)
        );
        transition: opacity 0.25s;
        pointer-events: none;
      }
      .fj-row:hover::before { opacity: 1; }
      .fj-row:hover { transform: translateX(4px); }
      .fj-row .fj-arrow {
        opacity: 0;
        transform: translateX(-8px);
        transition: all 0.25s;
      }
      .fj-row:hover .fj-arrow {
        opacity: 1;
        transform: translateX(0);
      }
      .fj-row:hover .fj-title {
        color: #2dd4bf !important;
      }
    `;
        document.head.appendChild(s);
    }, []);

    if (jobs.length === 0) return null;

    return (
        <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '64px 0 80px' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 16px' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '4px 12px', borderRadius: '999px', fontSize: '11px',
                        fontWeight: 600, letterSpacing: '0.15em',
                        backgroundColor: 'rgba(45,212,191,0.08)', color: '#2dd4bf',
                        marginBottom: '12px',
                    }}>
                        <Sparkles size={12} />
                        UPDATED DAILY
                    </span>
                    <h2 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', margin: '12px 0 6px' }}>
                        Latest PMHNP Opportunities
                    </h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: 0 }}>
                        Fresh positions added daily from top employers
                    </p>
                </div>

                {/* List container */}
                <div style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                }}>
                    {jobs.map((job, idx) => {
                        const href = job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`;
                        const tc = TC[job.jobType ?? ''];
                        const fresh = isNew(job.createdAt);

                        return (
                            <Link
                                key={job.id}
                                href={href}
                                className="fj-row"
                                style={{
                                    borderBottom: idx < jobs.length - 1 ? '1px solid var(--border-color)' : 'none',
                                }}
                            >
                                {/* Avatar */}
                                <div style={{
                                    width: '44px', height: '44px', borderRadius: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0,
                                    background: avatarGradient(job.employer),
                                }}>
                                    {initials(job.employer)}
                                </div>

                                {/* Main content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Company + badges */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '11px', fontWeight: 600,
                                            textTransform: 'uppercase', letterSpacing: '0.12em',
                                            color: 'var(--text-muted)',
                                        }}>
                                            {job.employer}
                                        </span>
                                        {tc && (
                                            <span style={{
                                                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                                                borderRadius: '999px', backgroundColor: tc.bg, color: tc.fg,
                                            }}>
                                                {job.jobType}
                                            </span>
                                        )}
                                        {fresh && (
                                            <span style={{
                                                fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                                                borderRadius: '999px',
                                                backgroundColor: 'rgba(45,212,191,0.1)', color: '#2dd4bf',
                                            }}>
                                                NEW
                                            </span>
                                        )}
                                    </div>

                                    {/* Title */}
                                    <div className="fj-title" style={{
                                        fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        marginBottom: '6px',
                                    }}>
                                        {job.title}
                                    </div>

                                    {/* Meta row */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            <MapPin size={13} style={{ color: '#2dd4bf' }} />
                                            {job.location}
                                        </span>
                                        {job.displaySalary && (
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#22c55e' }}>
                                                {job.displaySalary}
                                            </span>
                                        )}
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            <Clock size={11} />
                                            {relativeTime(job.createdAt)}
                                        </span>
                                    </div>
                                </div>

                                {/* Arrow */}
                                <div className="fj-arrow" style={{ flexShrink: 0 }}>
                                    <ArrowRight size={18} style={{ color: '#2dd4bf' }} />
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* CTA */}
                <div style={{ textAlign: 'center', marginTop: '48px' }}>
                    <Link
                        href="/jobs"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '14px 32px', borderRadius: '999px',
                            fontSize: '14px', fontWeight: 600, color: '#2dd4bf',
                            border: '1px solid rgba(45,212,191,0.3)',
                            backgroundColor: 'rgba(45,212,191,0.05)',
                            textDecoration: 'none',
                            transition: 'all 0.3s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(45,212,191,0.12)';
                            e.currentTarget.style.transform = 'scale(1.03)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(45,212,191,0.05)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        Browse All Jobs
                        <ArrowRight size={16} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
