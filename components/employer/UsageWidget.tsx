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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/employer/usage')
            .then(r => r.ok ? r.json() : null)
            .then(d => setData(d))
            .catch(() => {})
            .finally(() => setLoading(false));
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

    const tierGradients: Record<string, { gradient: string; accent: string; glow: string }> = {
        starter: { gradient: 'linear-gradient(145deg, #94A3B8, #64748B)', accent: '#94A3B8', glow: 'rgba(148,163,184,0.15)' },
        growth: { gradient: 'linear-gradient(145deg, #0D9488, #10B981)', accent: '#0D9488', glow: 'rgba(13,148,136,0.15)' },
        premium: { gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.15)' },
    };

    const t = tierGradients[tier] || tierGradients.starter;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginBottom: '24px',
        }}>
            {/* ─── Tier Badge ─── */}
            <div style={{
                ...clayCard, padding: '18px 20px',
                display: 'flex', alignItems: 'center', gap: '14px',
            }}>
                <div style={{
                    ...clayIconWrap,
                    background: t.gradient,
                    boxShadow: `4px 4px 10px ${t.glow}, inset 1px 1px 2px rgba(255,255,255,0.2)`,
                }}>
                    <Zap size={18} color="#fff" />
                </div>
                <div>
                    <p style={{
                        fontSize: '10px', fontWeight: 700, color: '#B0BEC5', margin: 0,
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>Current Plan</p>
                    <p style={{
                        fontSize: '17px', fontWeight: 700, margin: '2px 0 0',
                        background: t.gradient, WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>{tierLabel}</p>
                </div>
            </div>

            {/* ─── Candidate Unlocks ─── */}
            <ClayUsageMeter
                icon={<Users size={17} />}
                label="Profile Unlocks"
                used={usage.candidateUnlocks.used}
                limit={usage.candidateUnlocks.limit}
                unlimited={usage.candidateUnlocks.unlimited}
                gradient="linear-gradient(145deg, #0D9488, #10B981)"
                accent="#0D9488"
                glow="rgba(13,148,136,0.12)"
            />

            {/* ─── InMails ─── */}
            <ClayUsageMeter
                icon={<Mail size={17} />}
                label="InMails Sent"
                used={usage.inmails.used}
                limit={usage.inmails.limit}
                unlimited={usage.inmails.unlimited}
                gradient="linear-gradient(145deg, #3B82F6, #60A5FA)"
                accent="#3B82F6"
                glow="rgba(59,130,246,0.12)"
            />

            {/* ─── Upgrade CTA ─── */}
            {tier !== 'premium' && (
                <Link
                    href="/post-job"
                    className="clay-upgrade-btn"
                    style={{
                        ...clayCard, padding: '18px 20px',
                        display: 'flex', alignItems: 'center', gap: '14px',
                        textDecoration: 'none',
                        transition: 'all 0.25s ease',
                    }}
                >
                    <div style={{
                        ...clayIconWrap,
                        background: 'linear-gradient(145deg, #0D9488, #10B981)',
                        boxShadow: '4px 4px 10px rgba(13,148,136,0.15), inset 1px 1px 2px rgba(255,255,255,0.2)',
                    }}>
                        <TrendingUp size={17} color="#fff" />
                    </div>
                    <div>
                        <p style={{
                            fontSize: '13px', fontWeight: 700, margin: 0,
                            background: 'linear-gradient(145deg, #0D9488, #10B981)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>Upgrade Plan</p>
                        <p style={{ fontSize: '11px', color: '#8A9BA6', margin: '2px 0 0' }}>
                            Get more unlocks & InMails
                        </p>
                    </div>
                </Link>
            )}

            <style>{`
                .clay-upgrade-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 8px 8px 20px rgba(0,0,0,0.06), -4px -4px 10px rgba(255,255,255,0.8),
                                inset 1px 1px 2px rgba(255,255,255,0.5) !important;
                }
            `}</style>
        </div>
    );
}

function ClayUsageMeter({
    icon, label, used, limit, unlimited, gradient, accent, glow,
}: {
    icon: React.ReactNode;
    label: string;
    used: number;
    limit: number | null;
    unlimited: boolean;
    gradient: string;
    accent: string;
    glow: string;
}) {
    const pct = unlimited || !limit ? 0 : Math.min((used / limit) * 100, 100);
    const isNearLimit = !unlimited && limit && used >= limit * 0.8;
    const isAtLimit = !unlimited && limit && used >= limit;

    return (
        <div style={{
            ...clayCard, padding: '18px 20px',
            border: isAtLimit
                ? '1px solid rgba(239,68,68,0.25)'
                : isNearLimit
                    ? '1px solid rgba(251,191,36,0.25)'
                    : '1px solid rgba(0,0,0,0.05)',
        }}>
            {/* Header Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        ...clayIconWrap,
                        width: '36px', height: '36px', borderRadius: '11px',
                        background: glow,
                    }}>
                        <span style={{ color: accent }}>{icon}</span>
                    </div>
                    <span style={{
                        fontSize: '11px', fontWeight: 700, color: '#8A9BA6',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{label}</span>
                </div>
                <span style={{
                    fontSize: '16px', fontWeight: 800,
                    color: isAtLimit ? '#EF4444' : isNearLimit ? '#F59E0B' : '#1A2E35',
                    fontFamily: 'var(--font-inter, system-ui)',
                }}>
                    {unlimited ? '∞' : `${used}/${limit}`}
                </span>
            </div>

            {/* Progress Bar */}
            {!unlimited && limit && (
                <div style={{
                    width: '100%', height: '6px', borderRadius: '3px',
                    background: '#F0F2F5',
                    boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.4)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: '3px',
                        background: isAtLimit
                            ? 'linear-gradient(90deg, #EF4444, #F87171)'
                            : isNearLimit
                                ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                : gradient,
                        boxShadow: isAtLimit
                            ? '0 0 8px rgba(239,68,68,0.3)'
                            : isNearLimit
                                ? '0 0 8px rgba(245,158,11,0.3)'
                                : `0 0 8px ${glow}`,
                        transition: 'width 0.6s ease, background 0.3s ease',
                    }} />
                </div>
            )}

            {unlimited && (
                <p style={{ fontSize: '11px', color: '#B0BEC5', margin: '4px 0 0' }}>
                    Unlimited with Premium
                </p>
            )}
        </div>
    );
}
