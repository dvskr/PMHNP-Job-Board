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

/* ═══ CLAY TOKENS ═══ */
const cardBase: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '8px 8px 20px rgba(0,0,0,0.06), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
};

const recessedPill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.05)',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.03), inset -1px -1px 2px rgba(255,255,255,0.4)',
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
            className="clay-candidate-card"
            style={{
                ...cardBase,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s ease',
                position: 'relative',
            }}
        >
            {/* Bookmark button */}
            {onToggleSave && (
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(id); }}
                    style={{
                        position: 'absolute', top: '14px', right: '14px',
                        width: '30px', height: '30px', borderRadius: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isSaved ? '#FEF3C7' : '#F5F6F8',
                        border: `1px solid ${isSaved ? '#FDE68A' : 'rgba(255,255,255,0.5)'}`,
                        boxShadow: '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
                        cursor: 'pointer', transition: 'all 0.15s',
                        color: isSaved ? '#F59E0B' : '#B0C4BC',
                    }}
                    title={isSaved ? 'Remove from saved' : 'Save candidate'}
                >
                    <Bookmark size={14} fill={isSaved ? '#F59E0B' : 'none'} />
                </button>
            )}

            {/* Header: Avatar + Name + Headline */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', paddingRight: '28px' }}>
                <div
                    style={{
                        width: '44px', height: '44px', borderRadius: '14px',
                        background: avatarUrl
                            ? `url(${avatarUrl}) center/cover`
                            : 'linear-gradient(145deg, #10B981, #0D9488)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: '15px',
                        boxShadow: '3px 3px 8px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.3)',
                    }}
                >
                    {!avatarUrl && initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <h3 style={{
                            fontSize: '15px', fontWeight: 700,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35', margin: 0,
                        }}>
                            {displayName}
                        </h3>
                        {expLabel && (
                            <span style={{
                                ...recessedPill, background: '#CCFBF1', color: '#0D9488',
                                border: '1px solid #99F6E4', fontSize: '10px',
                            }}>
                                {expLabel}
                            </span>
                        )}
                        {hasResume && <FileText size={13} style={{ color: '#0D9488' }} />}
                        {isViewed && (
                            <span style={{
                                ...recessedPill, background: '#D1FAE5', color: '#059669',
                                border: '1px solid #A7F3D0', fontSize: '10px',
                            }}>
                                ✓ Viewed
                            </span>
                        )}
                    </div>
                    {headline && (
                        <p style={{
                            fontSize: '12px', color: '#8A9BA6', margin: '3px 0 0',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {headline}
                        </p>
                    )}
                </div>
            </div>

            {/* Specialties */}
            {safeSpecs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {safeSpecs.map(spec => (
                        <span key={spec} style={{
                            ...recessedPill, background: '#EDE9FE', color: '#7C3AED',
                            border: '1px solid #DDD6FE',
                        }}>
                            {spec}
                        </span>
                    ))}
                </div>
            )}

            {/* Certifications */}
            {safeCerts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {safeCerts.map(cert => (
                        <span key={cert} style={{
                            ...recessedPill, background: '#CCFBF1', color: '#0D9488',
                            border: '1px solid #99F6E4',
                        }}>
                            {cert}
                        </span>
                    ))}
                </div>
            )}

            {/* Licensed States */}
            {visibleStates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <MapPin size={12} style={{ color: '#B0C4BC', flexShrink: 0 }} />
                    {visibleStates.map(st => (
                        <span key={st} style={{
                            fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '6px',
                            background: '#F5F6F8', color: '#6B7F8A', border: '1px solid rgba(0,0,0,0.06)',
                        }}>
                            {st}
                        </span>
                    ))}
                    {extraStates > 0 && (
                        <span style={{ fontSize: '10px', color: '#B0C4BC' }}>
                            +{extraStates} more
                        </span>
                    )}
                </div>
            )}

            {/* Footer: Work mode, availability, View/Unlock Profile */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '12px', marginTop: 'auto', paddingTop: '10px',
                borderTop: '1px solid rgba(0,0,0,0.04)',
            }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {preferredWorkMode && (
                        <span style={{
                            ...recessedPill, background: '#F5F6F8', color: '#6B7F8A', fontSize: '11px',
                        }}>
                            <Briefcase size={10} />
                            {modeIcon} {preferredWorkMode}
                        </span>
                    )}
                    {availLabel && (
                        <span style={{
                            ...recessedPill, background: '#F5F6F8', color: '#6B7F8A', fontSize: '11px',
                        }}>
                            <Calendar size={10} />
                            {availLabel}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                    {isExhausted ? (
                        <>
                            <span style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '12px',
                                background: '#F5F6F8', color: '#B0C4BC', cursor: 'not-allowed',
                                border: '1px solid rgba(0,0,0,0.06)',
                                boxShadow: 'inset 2px 2px 5px rgba(0,60,50,0.04)',
                            }}>
                                <Lock size={12} /> No Unlocks Left
                            </span>
                            <span style={{ fontSize: '10px', color: '#DC2626', whiteSpace: 'nowrap' }}>
                                Upgrade to unlock more
                            </span>
                        </>
                    ) : (
                        <>
                            <Link
                                href={`/employer/candidates/${id}`}
                                className="clay-profile-btn"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    fontSize: '12px', fontWeight: 600, color: '#fff',
                                    textDecoration: 'none', padding: '7px 14px', borderRadius: '12px',
                                    background: isViewed
                                        ? 'linear-gradient(145deg, #10B981, #0D9488)'
                                        : 'linear-gradient(145deg, #8B5CF6, #7C3AED)',
                                    boxShadow: isViewed
                                        ? '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
                                        : '3px 3px 8px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}
                            >
                                {isViewed ? 'View Profile →' : <><Lock size={12} /> Unlock Profile</>}
                            </Link>
                            {!isViewed && remaining !== null && (
                                <span style={{
                                    fontSize: '10px', whiteSpace: 'nowrap',
                                    color: remaining <= 2 ? '#D97706' : '#B0C4BC',
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
