'use client';

import Link from 'next/link';
import {
    MapPin, Briefcase, FileText, Calendar, Bookmark, Lock,
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
    isSaved?: boolean;
    isViewed?: boolean;
    unlockUsage?: { used: number; limit: number | null; unlimited: boolean };
    onToggleSave?: (id: string) => void;
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
    isSaved, isViewed, unlockUsage, onToggleSave,
}: CandidateCardProps) {
    const expLabel = getExperienceLabel(yearsExperience);
    const availLabel = formatAvailableDate(availableDate);
    const modeIcon = preferredWorkMode
        ? WORK_MODE_ICONS[preferredWorkMode.toLowerCase()] || '🌐'
        : null;

    const safeStates = licenseStates || [];
    const safeCerts = certifications || [];
    const safeSpecs = specialties || [];

    const maxStates = 5;
    const visibleStates = safeStates.slice(0, maxStates);
    const extraStates = safeStates.length - maxStates;

    // Unlock credit calculations
    const remaining = unlockUsage && !unlockUsage.unlimited && unlockUsage.limit
        ? unlockUsage.limit - unlockUsage.used
        : null;
    const isExhausted = !isViewed && remaining !== null && remaining <= 0;

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
            {/* Bookmark button */}
            {onToggleSave && (
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(id); }}
                    style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        transition: 'all 0.2s',
                        color: isSaved ? '#F59E0B' : 'var(--text-tertiary)',
                    }}
                    title={isSaved ? 'Remove from saved' : 'Save candidate'}
                >
                    <Bookmark size={18} fill={isSaved ? '#F59E0B' : 'none'} />
                </button>
            )}

            {/* Header: Avatar + Name + Headline */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
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
                            <span style={{
                                fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                                borderRadius: '6px', backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF',
                            }}>
                                {expLabel}
                            </span>
                        )}
                        {hasResume && <FileText size={14} style={{ color: '#2DD4BF' }} />}
                        {isViewed && (
                            <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '2px 7px',
                                borderRadius: '6px', backgroundColor: 'rgba(16,185,129,0.1)',
                                color: '#10B981', border: '1px solid rgba(16,185,129,0.2)',
                            }}>
                                ✓ Viewed
                            </span>
                        )}
                    </div>
                    {headline && (
                        <p style={{
                            fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {headline}
                        </p>
                    )}
                </div>
            </div>

            {/* Certifications */}
            {safeCerts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {safeCerts.map(cert => (
                        <span key={cert} style={{
                            fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px',
                            backgroundColor: 'rgba(45,212,191,0.1)', color: '#2DD4BF',
                            border: '1px solid rgba(45,212,191,0.2)',
                        }}>
                            {cert}
                        </span>
                    ))}
                </div>
            )}

            {/* Specialties */}
            {safeSpecs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {safeSpecs.map(spec => (
                        <span key={spec} style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                            backgroundColor: 'rgba(139,92,246,0.1)', color: '#A78BFA',
                            border: '1px solid rgba(139,92,246,0.2)',
                        }}>
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
                        <span key={st} style={{
                            fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                        }}>
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

            {/* Footer: Work mode, availability, View/Unlock Profile */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '12px', marginTop: 'auto', paddingTop: '8px',
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {isExhausted ? (
                        <>
                            <span style={{
                                fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)',
                                padding: '8px 16px', borderRadius: '10px',
                                background: 'rgba(255,255,255,0.08)', cursor: 'not-allowed',
                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <Lock size={13} /> No Unlocks Left
                            </span>
                            <span style={{ fontSize: '10px', color: '#EF4444', whiteSpace: 'nowrap' }}>
                                Upgrade to unlock more
                            </span>
                        </>
                    ) : (
                        <>
                            <Link
                                href={`/employer/candidates/${id}`}
                                style={{
                                    fontSize: '13px', fontWeight: 600, color: '#fff',
                                    textDecoration: 'none', padding: '8px 16px', borderRadius: '10px',
                                    background: isViewed
                                        ? 'linear-gradient(135deg, #2DD4BF, #14B8A6)'
                                        : 'linear-gradient(135deg, #A855F7, #7C3AED)',
                                    transition: 'opacity 0.2s', whiteSpace: 'nowrap',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}
                            >
                                {isViewed ? 'View Profile →' : <><Lock size={13} /> Unlock Profile</>}
                            </Link>
                            {!isViewed && remaining !== null && (
                                <span style={{
                                    fontSize: '10px',
                                    color: remaining <= 2 ? '#FBBF24' : 'var(--text-tertiary)',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {remaining} of {unlockUsage!.limit} unlocks left
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
