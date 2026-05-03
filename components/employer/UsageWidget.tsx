'use client';

import { useState, useEffect } from 'react';
import { Users, Mail, TrendingUp, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';

interface UsageData {
    tier: string;
    tierLabel: string;
    usage: {
        candidateUnlocks: { used: number; limit: number | null; unlimited: boolean };
        inmails: { used: number; limit: number | null; unlimited: boolean };
    };
}

interface QuotaStatus {
    eligible: boolean;
    willBeFree?: boolean;
    remaining?: number;
    limit?: number;
}

/* ═══ Clay Design Tokens ═══ */
const clayCard: React.CSSProperties = {
    borderRadius: '18px',
    border: '1px solid rgba(0,0,0,0.05)',
    boxShadow: '5px 5px 14px rgba(0,0,0,0.05), -3px -3px 8px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.5), inset -1px -1px 1px rgba(0,0,0,0.02)',
    background: '#FFFFFF',
};

const clayIconWrap: React.CSSProperties = {
    width: '44px', height: '44px', borderRadius: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.06), inset 1px 1px 2px rgba(255,255,255,0.3)',
};

export default function UsageWidget() {
    const [data, setData] = useState<UsageData | null>(null);
    const [quota, setQuota] = useState<QuotaStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch in parallel — usage drives the meters, quota drives the
        // Free-vs-Pro plan label and the "X free posts left" line.
        Promise.allSettled([
            fetch('/api/employer/usage').then(r => r.ok ? r.json() : null),
            fetch('/api/employer/free-quota-status').then(r => r.ok ? r.json() : null),
        ]).then(([usageResult, quotaResult]) => {
            if (usageResult.status === 'fulfilled') setData(usageResult.value);
            if (quotaResult.status === 'fulfilled') setQuota(quotaResult.value);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '28px', borderRadius: '18px',
                ...clayCard,
                marginBottom: '24px',
            }}>
                <Loader2 size={20} className="animate-spin" style={{ color: '#B0BEC5' }} />
            </div>
        );
    }

    if (!data) return null;

    const { usage, tierLabel, tier } = data;

    // Single-tier model — gradient palette keyed for current 'pro' value with
    // legacy fallbacks so older cached payloads still render correctly.
    const tierGradients: Record<string, { gradient: string; accent: string; glow: string }> = {
        pro: { gradient: 'linear-gradient(145deg, #0D9488, #10B981)', accent: '#0D9488', glow: 'rgba(13,148,136,0.15)' },
        starter: { gradient: 'linear-gradient(145deg, #94A3B8, #64748B)', accent: '#94A3B8', glow: 'rgba(148,163,184,0.15)' },
        growth: { gradient: 'linear-gradient(145deg, #0D9488, #10B981)', accent: '#0D9488', glow: 'rgba(13,148,136,0.15)' },
        premium: { gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.15)' },
    };

    const t = tierGradients[tier] || tierGradients.pro;

    // Show "Free trial" as the plan label when the employer still has free
    // posts available (and is otherwise eligible). Once they pay or burn
    // their free quota, it flips to the proper tier label ("Pro").
    const onFreeTrial = quota?.eligible === true && (quota.remaining ?? 0) > 0;
    const planLabel = onFreeTrial ? 'Free trial' : tierLabel;
    const planSublabel = onFreeTrial && typeof quota?.remaining === 'number' && typeof quota?.limit === 'number'
        ? `${quota.remaining} of ${quota.limit} free posts left`
        : null;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
            marginBottom: '24px',
        }}>
            {/* ─── Tier Badge — single-line label, tier + optional free counter ─── */}
            <CompactCard
                icon={<Zap size={14} color="#fff" />}
                iconBg={t.gradient}
                iconGlow={t.glow}
                label="Plan"
                value={planLabel}
                valueColor={t.accent}
                sub={planSublabel}
            />

            {/* ─── Candidate Unlocks ─── */}
            <CompactMeter
                icon={<Users size={14} />}
                label="Unlocks"
                used={usage.candidateUnlocks.used}
                limit={usage.candidateUnlocks.limit}
                unlimited={usage.candidateUnlocks.unlimited}
                accent="#0D9488"
                gradient="linear-gradient(90deg, #0D9488, #10B981)"
                glow="rgba(13,148,136,0.12)"
            />

            {/* ─── InMails ─── */}
            <CompactMeter
                icon={<Mail size={14} />}
                label="InMails"
                used={usage.inmails.used}
                limit={usage.inmails.limit}
                unlimited={usage.inmails.unlimited}
                accent="#3B82F6"
                gradient="linear-gradient(90deg, #3B82F6, #60A5FA)"
                glow="rgba(59,130,246,0.12)"
            />

            {/* ─── Post-another-job CTA — same compact footprint as the others ─── */}
            <Link
                href="/post-job"
                className="clay-upgrade-btn"
                style={{
                    ...clayCard, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                }}
            >
                <div style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)',
                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15), inset 1px 1px 2px rgba(255,255,255,0.2)',
                    flexShrink: 0,
                }}>
                    <TrendingUp size={14} color="#fff" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                        fontSize: '13px', fontWeight: 700, margin: 0,
                        color: '#0D9488',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>Post Another</p>
                    <p style={{
                        fontSize: '10px', color: '#8A9BA6', margin: '1px 0 0',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        +25 unlocks · +25 InMails
                    </p>
                </div>
            </Link>

            <style>{`
                .clay-upgrade-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 7px 7px 16px rgba(0,0,0,0.06), -3px -3px 8px rgba(255,255,255,0.8),
                                inset 1px 1px 2px rgba(255,255,255,0.5) !important;
                }
            `}</style>
        </div>
    );
}

/* ═══ Compact Card — used for the Plan badge ═══ */
function CompactCard({
    icon, iconBg, iconGlow, label, value, valueColor, sub,
}: {
    icon: React.ReactNode;
    iconBg: string;
    iconGlow: string;
    label: string;
    value: string;
    valueColor: string;
    sub: string | null;
}) {
    return (
        <div style={{
            ...clayCard, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: '10px',
        }}>
            <div style={{
                width: '32px', height: '32px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: iconBg,
                boxShadow: `3px 3px 8px ${iconGlow}, inset 1px 1px 2px rgba(255,255,255,0.2)`,
                flexShrink: 0,
            }}>
                {icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{
                    fontSize: '10px', fontWeight: 700, color: '#B0BEC5', margin: 0,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{label}</p>
                <p style={{
                    fontSize: '15px', fontWeight: 800, margin: '1px 0 0',
                    color: valueColor,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{value}</p>
                {sub && (
                    <p style={{
                        fontSize: '10px', color: '#0D9488', margin: '1px 0 0', fontWeight: 600,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {sub}
                    </p>
                )}
            </div>
        </div>
    );
}

/* ═══ Compact Meter — used for unlocks / InMails ═══ */
function CompactMeter({
    icon, label, used, limit, unlimited, accent, gradient, glow,
}: {
    icon: React.ReactNode;
    label: string;
    used: number;
    limit: number | null;
    unlimited: boolean;
    accent: string;
    gradient: string;
    glow: string;
}) {
    // No active posting → no entitlement at all. Render a dashed, gentle empty
    // state instead of "0/25", which previously implied a free 25-credit pool.
    const noEntitlement = !unlimited && (limit === 0 || limit === null);

    const pct = unlimited || !limit ? 0 : Math.min((used / limit) * 100, 100);
    const isNearLimit = !unlimited && !!limit && used >= limit * 0.8;
    const isAtLimit = !unlimited && !!limit && used >= limit;
    const valueColor = noEntitlement
        ? '#B0C4BC'
        : isAtLimit ? '#EF4444' : isNearLimit ? '#F59E0B' : '#1A2E35';

    return (
        <div style={{
            ...clayCard, padding: '12px 14px',
            border: noEntitlement
                ? '1px dashed rgba(0,0,0,0.12)'
                : isAtLimit
                    ? '1px solid rgba(239,68,68,0.22)'
                    : isNearLimit
                        ? '1px solid rgba(251,191,36,0.22)'
                        : '1px solid rgba(0,0,0,0.05)',
            display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: glow, color: accent,
                    flexShrink: 0,
                    opacity: noEntitlement ? 0.55 : 1,
                }}>
                    {icon}
                </div>
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{
                        fontSize: '10px', fontWeight: 700, color: '#8A9BA6',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{label}</span>
                    <span style={{
                        fontSize: noEntitlement ? '11px' : '14px',
                        fontWeight: 800,
                        color: valueColor,
                        fontFamily: 'var(--font-inter, system-ui)',
                        whiteSpace: 'nowrap',
                    }}>
                        {unlimited ? '∞' : noEntitlement ? 'Post a job' : `${used}/${limit}`}
                    </span>
                </div>
            </div>
            {!unlimited && !noEntitlement && limit && (
                <div style={{
                    width: '100%', height: '4px', borderRadius: '2px',
                    background: '#F0F2F5',
                    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: '2px',
                        background: isAtLimit
                            ? 'linear-gradient(90deg, #EF4444, #F87171)'
                            : isNearLimit
                                ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                : gradient,
                        transition: 'width 0.6s ease',
                    }} />
                </div>
            )}
        </div>
    );
}

