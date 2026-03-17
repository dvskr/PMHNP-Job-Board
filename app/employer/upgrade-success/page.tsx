'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { config, PricingTier } from '@/lib/config';

interface UpgradeData {
  tier: PricingTier;
  tierLabel: string;
  jobTitle: string;
  expiresAt: string;
}

const TIER_BENEFITS: Record<PricingTier, string[]> = {
  starter: [
    '30-day job listing',
    'Basic analytics',
    '5 candidate unlocks/posting',
    '5 InMails/posting',
  ],
  growth: [
    '60-day listing (2× longer)',
    '"Featured" badge on listing',
    'Top placement in search results',
    'Highlighted in daily job alerts',
    '25 candidate unlocks/posting',
    '25 InMails/posting',
    'Advanced analytics (views, clicks, sources)',
  ],
  premium: [
    '90-day listing (3× longer)',
    'Everything in Growth',
    'Unlimited candidate unlocks',
    'Unlimited InMails',
    'Social media promotion',
    'Dedicated account support',
  ],
};

function UpgradeSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UpgradeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID found');
      setLoading(false);
      return;
    }

    fetch(`/api/verify-upgrade-session?session_id=${sessionId}`)
      .then(r => r.json())
      .then(result => {
        if (result.success) {
          setData({
            tier: result.tier || 'growth',
            tierLabel: result.tierLabel || config.getTierLabel(result.tier || 'growth'),
            jobTitle: result.jobTitle || 'Your Job',
            expiresAt: result.expiresAt || '',
          });
        } else {
          // Fallback: even if verification fails, show a success-ish page
          // since the user was redirected here from Stripe
          setData({
            tier: 'growth',
            tierLabel: 'Growth',
            jobTitle: 'Your Job',
            expiresAt: '',
          });
        }
      })
      .catch(() => {
        // Show fallback on network error
        setData({
          tier: 'growth',
          tierLabel: 'Growth',
          jobTitle: 'Your Job',
          expiresAt: '',
        });
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p style={{ color: 'var(--text-secondary)' }}>Verifying your upgrade...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-md w-full rounded-lg shadow-md p-8 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Something went wrong</h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <Link href="/employer/dashboard" className="inline-block bg-teal-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const tier = data?.tier || 'growth';
  const tierLabel = data?.tierLabel || 'Growth';
  const benefits = TIER_BENEFITS[tier] || TIER_BENEFITS.growth;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-lg w-full rounded-lg shadow-md p-8 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Upgrade Complete! 🎉
        </h1>
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
          {data?.jobTitle ? `"${data.jobTitle}" has been upgraded to ` : 'Your job has been upgraded to '}
          <strong style={{ color: tier === 'premium' ? '#A855F7' : '#E86C2C' }}>{tierLabel}</strong>.
        </p>

        <div className="text-left mb-6 rounded-lg p-4" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            What you get with {tierLabel}:
          </h3>
          <ul className="space-y-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: tier === 'premium' ? '#A855F7' : '#2DD4BF' }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {data?.expiresAt && (
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Your posting is now active until {new Date(data.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        )}

        <Link
          href="/employer/dashboard"
          className="inline-block bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function UpgradeSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
      </div>
    }>
      <UpgradeSuccessContent />
    </Suspense>
  );
}
