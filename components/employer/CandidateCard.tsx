'use client';

import Link from 'next/link';
import {
    MapPin, Briefcase, FileText, Calendar, Clock,
} from 'lucide-react';

interface CandidateCardProps {
    id: string;
    displayName: string;
    initials: string;
    avatarUrl: string | null;
    headline: string | null;
    yearsExperience: number | null;
    certifications: string[];
    licenseStates: string[];
    specialties: string[];
    preferredWorkMode: string | null;
    availableDate: string | null;
    hasResume: boolean;
}

const EXPERIENCE_LABELS: Record<number, string> = {
    0: 'New Grad',
    1: '1-2 yrs',
    3: '3-5 yrs',
    5: '5-10 yrs',
    10: '10-15 yrs',
    15: '15-20 yrs',
    20: '20+ yrs',
};

function getExperienceLabel(years: number | null): string | null {
    if (years === null || years === undefined) return null;
    // Find the closest match
    const keys = Object.keys(EXPERIENCE_LABELS).map(Number).sort((a, b) => b - a);
    for (const k of keys) {
        if (years >= k) return EXPERIENCE_LABELS[k];
    }
    return EXPERIENCE_LABELS[0];
}

function formatAvailableDate(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    if (d <= now) return 'Immediately';
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 14) return 'Within 2 weeks';
    if (diff <= 30) return 'Within 1 month';
    if (diff <= 90) return 'Within 3 months';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const WORK_MODE_ICONS: Record<string, string> = {
    remote: '🏠',
    'on-site': '🏢',
    hybrid: '🔄',
    telehealth: '💻',
    any: '🌐',
};

export default function CandidateCard({
    id, displayName, initials, avatarUrl, headline,
    yearsExperience, certifications, licenseStates,
    specialties, preferredWorkMode, availableDate, hasResume,
}: CandidateCardProps) {
    const expLabel = getExperienceLabel(yearsExperience);
    const availLabel = formatAvailableDate(availableDate);
    const modeIcon = preferredWorkMode
        ? WORK_MODE_ICONS[preferredWorkMode.toLowerCase()] || '🌐'
        : null;

    const maxStates = 5;
    const visibleStates = licenseStates.slice(0, maxStates);
    const extraStates = licenseStates.length - maxStates;

    return (
        <div
            style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                transition: 'all 0.2s ease',
                position: 'relative',
            }}
            className="hover:shadow-lg"
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(45,212,191,0.4)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
            }}
        >
            {/* Header: Avatar + Name + Headline */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                {/* Avatar */}
                <div
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '14px',
                        background: avatarUrl
                            ? `url(${avatarUrl}) center/cover`
                            : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '16px',
                    }}
                >
                    {!avatarUrl && initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            {displayName}
                        </h3>
                        {expLabel && (
                            <span
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(45,212,191,0.12)',
                                    color: '#2DD4BF',
                                }}
                            >
                                {expLabel}
                            </span>
                        )}
                        {hasResume && (
                            <FileText size={14} style={{ color: '#2DD4BF' }} />
                        )}
                    </div>
                    {headline && (
                        <p style={{
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                            margin: '4px 0 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {headline}
                        </p>
                    )}
                </div>
            </div>

            {/* Certifications */}
            {certifications.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {certifications.map(cert => (
                        <span
                            key={cert}
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(45,212,191,0.1)',
                                color: '#2DD4BF',
                                border: '1px solid rgba(45,212,191,0.2)',
                            }}
                        >
                            {cert}
                        </span>
                    ))}
                </div>
            )}

            {/* Specialties */}
            {specialties.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {specialties.map(spec => (
                        <span
                            key={spec}
                            style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(139,92,246,0.1)',
                                color: '#A78BFA',
                                border: '1px solid rgba(139,92,246,0.2)',
                            }}
                        >
                            {spec}
                        </span>
                    ))}
                </div>
            )}

            {/* Licensed States */}
            {visibleStates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <MapPin size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    {visibleStates.map(st => (
                        <span
                            key={st}
                            style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255,255,255,0.06)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {st}
                        </span>
                    ))}
                    {extraStates > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            +{extraStates} more
                        </span>
                    )}
                </div>
            )}

            {/* Footer: Work mode, availability, View Profile */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginTop: 'auto',
                paddingTop: '8px',
                borderTop: '1px solid var(--border-color)',
            }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {preferredWorkMode && (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Briefcase size={12} />
                            {modeIcon} {preferredWorkMode}
                        </span>
                    )}
                    {availLabel && (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={12} />
                            {availLabel}
                        </span>
                    )}
                </div>
                <Link
                    href={`/employer/candidates/${id}`}
                    style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#fff',
                        textDecoration: 'none',
                        padding: '8px 16px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        transition: 'opacity 0.2s',
                        whiteSpace: 'nowrap',
                    }}
                >
                    View Profile →
                </Link>
            </div>
        </div>
    );
}
