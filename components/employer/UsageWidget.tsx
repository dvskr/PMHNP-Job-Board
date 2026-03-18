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
                padding: '24px', borderRadius: '16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                marginBottom: '24px',
            }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
            </div>
        );
    }

    if (!data) return null;

    const { usage, tierLabel, tier } = data;

    const tierColors: Record<string, { bg: string; border: string; text: string }> = {
        starter: { bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.25)', text: '#94A3B8' },
        growth: { bg: 'rgba(45,212,191,0.08)', border: 'rgba(45,212,191,0.25)', text: '#2DD4BF' },
        premium: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', text: '#A855F7' },
    };

    const colors = tierColors[tier] || tierColors.starter;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '24px',
        }}>
            {/* Tier Badge */}
            <div style={{
                padding: '16px 20px',
                borderRadius: '14px',
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
            }}>
                <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: `linear-gradient(135deg, ${colors.text}33, ${colors.text}11)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Zap size={18} style={{ color: colors.text }} />
                </div>
                <div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Current Plan
                    </p>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: colors.text, margin: 0 }}>
                        {tierLabel}
                    </p>
                </div>
            </div>

            {/* Candidate Unlocks */}
            <UsageMeter
                icon={<Users size={18} />}
                label="Profile Unlocks"
                used={usage.candidateUnlocks.used}
                limit={usage.candidateUnlocks.limit}
                unlimited={usage.candidateUnlocks.unlimited}
                color="#2DD4BF"
            />

            {/* InMails */}
            <UsageMeter
                icon={<Mail size={18} />}
                label="InMails Sent"
                used={usage.inmails.used}
                limit={usage.inmails.limit}
                unlimited={usage.inmails.unlimited}
                color="#60A5FA"
            />

            {/* Upgrade CTA — only show for starter/growth */}
            {tier !== 'premium' && (
                <Link
                    href="/post-job"
                    style={{
                        padding: '16px 20px',
                        borderRadius: '14px',
                        backgroundColor: 'rgba(45,212,191,0.06)',
                        border: '1px solid rgba(45,212,191,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                    }}
                >
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #2DD4BF33, #14B8A611)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <TrendingUp size={18} style={{ color: '#2DD4BF' }} />
                    </div>
                    <div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#2DD4BF', margin: 0 }}>
                            Upgrade Plan
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                            Get more unlocks & InMails
                        </p>
                    </div>
                </Link>
            )}
        </div>
    );
}

function UsageMeter({
    icon, label, used, limit, unlimited, color,
}: {
    icon: React.ReactNode;
    label: string;
    used: number;
    limit: number | null;
    unlimited: boolean;
    color: string;
}) {
    const pct = unlimited || !limit ? 0 : Math.min((used / limit) * 100, 100);
    const isNearLimit = !unlimited && limit && used >= limit * 0.8;
    const isAtLimit = !unlimited && limit && used >= limit;

    return (
        <div style={{
            padding: '16px 20px',
            borderRadius: '14px',
            backgroundColor: 'var(--bg-secondary)',
            border: `1px solid ${isAtLimit ? 'rgba(239,68,68,0.4)' : isNearLimit ? 'rgba(251,191,36,0.4)' : 'var(--border-color)'}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color }}>{icon}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {label}
                    </span>
                </div>
                <span style={{
                    fontSize: '14px', fontWeight: 700,
                    color: isAtLimit ? '#EF4444' : isNearLimit ? '#FBBF24' : 'var(--text-primary)',
                }}>
                    {unlimited ? '∞' : `${used}/${limit}`}
                </span>
            </div>

            {!unlimited && limit && (
                <div style={{
                    width: '100%', height: '4px', borderRadius: '2px',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: '2px',
                        backgroundColor: isAtLimit ? '#EF4444' : isNearLimit ? '#FBBF24' : color,
                        transition: 'width 0.5s ease',
                    }} />
                </div>
            )}

            {unlimited && (
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                    Unlimited with Premium
                </p>
            )}
        </div>
    );
}
