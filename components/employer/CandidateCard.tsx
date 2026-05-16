'use client';

import Link from 'next/link';
import {
    MapPin, Briefcase, FileText, Calendar, Bookmark, Lock, Sparkles, Check,
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
    /** Smart Match — LLM-generated one-line "why this candidate" rationale. */
    aiReason?: string;
    /** Smart Match — vector similarity rendered as 0..100 for the badge. */
    aiMatchPercent?: number;
    /** Current Talent Pool page (1-indexed). Passed through to the profile
     *  URL as ?fromPage=N so the in-page "Back to Talent Pool" link can
     *  return the user to the exact page they came from. */
    fromPage?: number;
    /** Selected posting in the talent-pool dropdown at the moment the card
     *  was clicked. Forwarded to the profile URL as ?postingId=... so the
     *  unlock debits THIS posting's quota — not whatever canUnlockCandidate's
     *  auto-picker chooses. Avoids the sessionStorage staleness problem. */
    selectedPostingId?: string;
    /** Selection state for the bulk-unlock workflow. When defined, the
     *  card renders a checkbox in the top-left (next to the Bookmark
     *  button in the top-right). Card is considered "selectable" only
     *  when locked — already-unlocked cards skip the checkbox entirely. */
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
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
    aiReason, aiMatchPercent, fromPage, selectedPostingId,
    isSelected, onToggleSelect,
}: CandidateCardProps) {
    // Profile URL carries the originating page so /employer/candidates/[id]
    // knows where to send the user when they click "Back to Talent Pool".
    // Skip when fromPage is 1 (or unset) — a clean URL is the default.
    // Also include selectedPostingId so the unlock debits the right
    // posting's quota (sessionStorage was unreliable for this).
    const profileQs = new URLSearchParams();
    if (fromPage && fromPage > 1) profileQs.set('fromPage', String(fromPage));
    if (selectedPostingId) profileQs.set('postingId', selectedPostingId);
    const qsStr = profileQs.toString();
    const profileHref = qsStr
        ? `/employer/candidates/${id}?${qsStr}`
        : `/employer/candidates/${id}`;
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
    // Distinguish three states (when not yet viewed):
    //   1. unlimited / no usage payload → show normal Unlock CTA
    //   2. limit === 0 → no active posting at all; gate behind "Post a Job"
    //   3. limit > 0, remaining > 0 → show "Unlock Profile (X left)"
    //   4. limit > 0, remaining <= 0 → show "No Unlocks Left" + upgrade hint
    const hasNoEntitlement = !!unlockUsage
        && !unlockUsage.unlimited
        && (unlockUsage.limit === 0 || unlockUsage.limit === null);
    const remaining = unlockUsage && !unlockUsage.unlimited && unlockUsage.limit && unlockUsage.limit > 0
        ? unlockUsage.limit - unlockUsage.used
        : null;
    const isExhausted = !isViewed && !hasNoEntitlement && remaining !== null && remaining <= 0;
    const requiresPosting = !isViewed && hasNoEntitlement;

    // Bulk-select is only available for cards that can actually be
    // unlocked. Already-viewed cards are excluded (no credit to spend),
    // as are cards with no posting entitlement.
    const selectable = !!onToggleSelect && !isViewed && !requiresPosting && !isExhausted;

    return (
        <div
            className={`clay-candidate-card${isSelected ? ' is-selected' : ''}`}
            style={{
                ...cardBase,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s ease',
                position: 'relative',
                ...(isSelected
                    ? {
                          outline: '2px solid #0D9488',
                          outlineOffset: '-1px',
                          boxShadow: '0 0 0 4px rgba(13,148,136,0.12), 6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
                      }
                    : {}),
            }}
        >
            {/* Bulk-select checkbox — file-manager-style. Top-left, mirror
                of the bookmark button on the right. Visible on the card's
                hover state OR when already selected. Clicking it does NOT
                navigate to the profile. */}
            {selectable && (
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect!(id); }}
                    aria-pressed={isSelected ? 'true' : 'false'}
                    title={isSelected ? 'Deselect' : 'Select for bulk unlock'}
                    className="clay-card-select-btn"
                    style={{
                        position: 'absolute', top: '14px', left: '14px',
                        width: '24px', height: '24px', borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isSelected ? 'linear-gradient(145deg, #10B981, #0D9488)' : '#FFFFFF',
                        border: `1.5px solid ${isSelected ? '#0D9488' : 'rgba(0,0,0,0.18)'}`,
                        boxShadow: isSelected
                            ? '2px 2px 6px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.2)'
                            : '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
                        cursor: 'pointer', transition: 'all 0.15s',
                        color: isSelected ? '#FFFFFF' : 'transparent',
                        opacity: isSelected ? 1 : undefined,
                        zIndex: 2,
                    }}
                >
                    <Check size={14} strokeWidth={3} />
                </button>
            )}

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
                {typeof aiMatchPercent === 'number' && (() => {
                    // Cosine similarity is clustered in a narrow band
                    // (~50-65% for most clinical text pairs) so showing
                    // the raw percentage is misleading — a 55% match
                    // sounds "half right" when it's actually a strong
                    // signal in this data. Bucket into three tiers
                    // calibrated against the empirical PMHNP query
                    // distribution. Within a tier, ranking position
                    // (the LLM rerank's order) is the source of truth.
                    type Tier = { label: string; bg: string; color: string; border: string };
                    let tier: Tier;
                    if (aiMatchPercent >= 65) {
                        tier = {
                            label: 'Strong match',
                            bg: 'linear-gradient(145deg, #DDD6FE, #C4B5FD)',
                            color: '#5B21B6',
                            border: '1px solid #A78BFA',
                        };
                    } else if (aiMatchPercent >= 50) {
                        tier = {
                            label: 'Good match',
                            bg: 'linear-gradient(145deg, #EDE9FE, #DDD6FE)',
                            color: '#6D28D9',
                            border: '1px solid #C4B5FD',
                        };
                    } else {
                        tier = {
                            label: 'Possible match',
                            bg: '#F5F3FF',
                            color: '#7C3AED',
                            border: '1px solid #DDD6FE',
                        };
                    }
                    return (
                        <span
                            title={`Cosine similarity ${aiMatchPercent}% — ranking is determined by the AI rerank, not this score`}
                            style={{
                                ...recessedPill,
                                background: tier.bg,
                                color: tier.color,
                                border: tier.border,
                                fontSize: '11px',
                                flexShrink: 0,
                            }}
                        >
                            <Sparkles size={11} /> {tier.label}
                        </span>
                    );
                })()}
            </div>

            {/* AI rationale (Smart Match only) */}
            {aiReason && (
                <div style={{
                    background: 'linear-gradient(145deg, #F5F3FF, #EDE9FE)',
                    border: '1px solid #DDD6FE',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    lineHeight: 1.45,
                    color: '#4C1D95',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                }}>
                    <Sparkles size={12} style={{ color: '#7C3AED', flexShrink: 0, marginTop: '2px' }} />
                    <span>{aiReason}</span>
                </div>
            )}

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
                    {requiresPosting ? (
                        <>
                            <Link
                                href="/post-job"
                                className="clay-profile-btn"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    fontSize: '12px', fontWeight: 600, color: '#fff',
                                    textDecoration: 'none', padding: '7px 14px', borderRadius: '12px',
                                    background: 'linear-gradient(145deg, #10B981, #0D9488)',
                                    boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}
                            >
                                <Briefcase size={12} /> Post a Job
                            </Link>
                            <span style={{ fontSize: '10px', color: '#8A9BA6', whiteSpace: 'nowrap' }}>
                                to unlock candidates
                            </span>
                        </>
                    ) : isExhausted ? (
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
                                href={profileHref}
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
