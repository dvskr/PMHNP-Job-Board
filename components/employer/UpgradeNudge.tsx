'use client';

import Link from 'next/link';
import { TrendingUp, ArrowRight, Lock } from 'lucide-react';

interface UpgradeNudgeProps {
    currentTier: 'starter' | 'growth' | 'premium';
    /** e.g. "Unlock advanced analytics" or "You've used 4/5 candidate views" */
    message?: string;
    /** Where to show — in analytics, candidates, etc. */
    variant?: 'analytics' | 'candidates' | 'general';
}

/**
 * Inline upgrade nudge card for Starter/Growth employers.
 * Shows in dashboard context — not a popup.
 */
export default function UpgradeNudge({
    currentTier,
    message,
    variant = 'general',
}: UpgradeNudgeProps) {
    if (currentTier === 'premium') return null;

    const defaultMessages: Record<string, string> = {
        analytics: 'Unlock salary benchmarks, market insights, and improvement suggestions',
        candidates: 'Get full access to candidate profiles, resumes, and direct messaging',
        general: 'Upgrade to unlock premium features and reach more candidates',
    };

    const targetTier = currentTier === 'starter' ? 'Growth' : 'Premium';
    const displayMessage = message || defaultMessages[variant];

    return (
        <div
            className="rounded-xl p-5 mt-4"
            style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(59,130,246,0.04))',
                border: '1px solid rgba(45,212,191,0.15)',
            }}
        >
            <div className="flex items-start gap-3">
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(45,212,191,0.12)' }}
                >
                    {variant === 'analytics' ? (
                        <TrendingUp size={20} style={{ color: '#2DD4BF' }} />
                    ) : (
                        <Lock size={20} style={{ color: '#2DD4BF' }} />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Upgrade to {targetTier}
                    </p>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                        {displayMessage}
                    </p>
                    <Link
                        href="/pricing"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }}
                    >
                        View Plans <ArrowRight size={14} />
                    </Link>
                </div>
            </div>
        </div>
    );
}
