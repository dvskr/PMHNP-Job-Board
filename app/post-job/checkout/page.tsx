'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, Lock } from 'lucide-react';
import { config } from '@/lib/config';
import { trackBeginCheckout } from '@/lib/analytics';

interface ScreeningQuestion {
  text: string;
  type: string;
  options?: string[];
  required?: boolean;
  knockout?: boolean;
  knockoutAnswer?: string;
}

interface JobFormData {
  title: string;
  companyName: string;
  companyWebsite?: string;
  contactEmail: string;
  location: string;
  mode: string;
  jobType: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string;
  salaryCompetitive?: boolean;
  description: string;
  applyUrl?: string;
  applyOnPlatform?: boolean;
  pricingTier: 'pro';
  benefits?: string[];
  setting?: string;
  population?: string;
  companyLogoUrl?: string;
  // Phase 1 experience picker fields — see app/post-job/page.tsx Step 2.
  minYearsExperience?: number;
  maxYearsExperience?: number | null;
  newGradFriendly?: boolean;
  experienceQualifier?: string;
  screeningQuestions?: ScreeningQuestion[];
}

/* ═══ Clay Tokens — matched to app/post-job/preview/page.tsx ═══ */
const cardBase: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '14px 28px', borderRadius: '14px',
  fontSize: '14px', fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
  cursor: 'pointer', transition: 'all 0.2s ease',
};

const detailLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: '#8A9BA6',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  display: 'block', marginBottom: '2px',
};

const detailValue: React.CSSProperties = {
  fontSize: '14px', color: '#1A2E35', margin: 0,
  overflow: 'hidden', textOverflow: 'ellipsis',
};

export default function CheckoutPage() {
  const router = useRouter();
  const [jobData, setJobData] = useState<JobFormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why this post is paid — read-only quota check (same endpoint the preview
  // page uses). We only ASSERT a reason we actually verified:
  //   'quota-used'          eligible + willBeFree:false → free post consumed
  //   'free-email-provider' personal-email account never qualified
  //   'free-eligible'       eligible + willBeFree:true → they should NOT pay;
  //                         warn instead of charging $199 for a free post
  //   null                  unknown (fetch failed / auth reasons) → neutral copy
  const [quotaContext, setQuotaContext] = useState<
    'quota-used' | 'free-email-provider' | 'free-eligible' | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/employer/free-quota-status');
        if (!res.ok) return;
        const data = (await res.json()) as {
          eligible?: boolean; willBeFree?: boolean; reason?: string;
        };
        if (cancelled) return;
        if (data.eligible === true) {
          setQuotaContext(data.willBeFree ? 'free-eligible' : 'quota-used');
        } else if (data.reason === 'free-email-provider') {
          setQuotaContext('free-email-provider');
        }
        // unauthenticated / not-employer / server-error → stay null (neutral)
      } catch {
        /* leave null — neutral copy, never a false claim */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Checkout always requires paid form data
    // (this page is only reached when free posts are exhausted)

    // Read jobFormData from localStorage
    const storedData = localStorage.getItem('jobFormData');

    if (!storedData) {
      // No data, redirect to post-job
      router.push('/post-job');
      return;
    }

    try {
      const parsedData: JobFormData = JSON.parse(storedData);
      try {
        const storedQuestions = localStorage.getItem('jobScreeningQuestions');
        if (storedQuestions) parsedData.screeningQuestions = JSON.parse(storedQuestions);
      } catch { /* ignore */ }
      setJobData(parsedData);
    } catch (err) {
      console.error('Error parsing job data:', err);
      router.push('/post-job');
    }
  }, [router]);

  const handlePayment = async () => {
    if (!jobData) return;

    setLoading(true);
    setError(null);

    // P7: fire begin_checkout before redirect to Stripe
    trackBeginCheckout(config.stripePriceInCents, 'new');

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: jobData.title,
          companyName: jobData.companyName,
          companyWebsite: jobData.companyWebsite,
          contactEmail: jobData.contactEmail,
          location: jobData.location,
          mode: jobData.mode,
          jobType: jobData.jobType,
          salaryMin: jobData.salaryMin,
          salaryMax: jobData.salaryMax,
          salaryPeriod: jobData.salaryPeriod,
          salaryCompetitive: jobData.salaryCompetitive,
          description: jobData.description,
          applyUrl: jobData.applyOnPlatform ? undefined : jobData.applyUrl,
          applyOnPlatform: jobData.applyOnPlatform || false,
          pricingTier: jobData.pricingTier,
          benefits: jobData.benefits,
          setting: jobData.setting,
          population: jobData.population,
          companyLogoUrl: jobData.companyLogoUrl,
          minYearsExperience: jobData.minYearsExperience ?? null,
          maxYearsExperience: jobData.maxYearsExperience ?? null,
          newGradFriendly: jobData.newGradFriendly ?? false,
          experienceQualifier: jobData.experienceQualifier?.trim() || null,
          screeningQuestions: jobData.screeningQuestions || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as { error?: string; cause?: string }));
        const baseMsg = errorData.error || 'Failed to create checkout session';
        const fullMsg = errorData.cause ? `${baseMsg} — ${errorData.cause}` : baseMsg;
        throw new Error(fullMsg);
      }

      const { url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const getPrice = () => `$${config.postingPrice}`;

  const getPlanName = () => 'Job Post';

  const getDescriptionExcerpt = (html: string, max = 220): string => {
    if (!html) return '';
    // Strip tags, decode common HTML entities, collapse whitespace
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max).trimEnd()}…`;
  };

  const formatSalary = () => {
    if (jobData?.salaryCompetitive) {
      return 'Competitive';
    }
    if (jobData?.salaryMin && jobData?.salaryMax) {
      return `$${jobData.salaryMin.toLocaleString()} - $${jobData.salaryMax.toLocaleString()}`;
    }
    if (jobData?.salaryMin) {
      return `$${jobData.salaryMin.toLocaleString()}+`;
    }
    if (jobData?.salaryMax) {
      return `Up to $${jobData.salaryMax.toLocaleString()}`;
    }
    return 'Not specified';
  };

  // Show loading while checking localStorage
  if (!jobData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid #E5E7EB', borderTopColor: '#0D9488',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hasExternalApply = !jobData.applyOnPlatform && !!jobData.applyUrl;

  return (
    <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '0 16px 80px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Page Header */}
        <div style={{ padding: '24px 0 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
            Confirm Your Job Posting
          </h1>
          <p style={{ fontSize: '14px', color: '#8A9BA6', margin: 0 }}>Review your listing before payment</p>
        </div>

        {/* Free-post context — why this post is paid. Only asserts a reason
            the quota endpoint actually confirmed; unknown states get neutral
            copy instead of a false "free post used" claim. */}
        {quotaContext === 'free-eligible' ? (
          <div style={{
            ...cardBase, padding: '12px 18px', marginBottom: '16px',
            background: '#FFFBEB', border: '1px solid #FDE68A',
          }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
              Your first post is still free — you don&apos;t need to pay for this listing.{' '}
              <Link href="/post-job/preview" style={{ color: '#92400E', textDecoration: 'underline' }}>
                Return to preview to publish it free
              </Link>.
            </p>
          </div>
        ) : (
          <div style={{
            ...cardBase, padding: '12px 18px', marginBottom: '16px',
            background: '#F0FDFA', border: '1px solid #99F6E4',
          }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#115E59', margin: 0, lineHeight: 1.5 }}>
              {quotaContext === 'free-email-provider'
                ? `Free first posts require a company email — this listing is $${config.postingPrice}.`
                : quotaContext === 'quota-used'
                  ? `Your free post is used — this listing is $${config.postingPrice}.`
                  : `Standard listing — $${config.postingPrice} for ${config.durationDays} days.`}
            </p>
          </div>
        )}

        {/* Job Summary Card */}
        <div style={{ ...cardBase, padding: '24px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 16px' }}>Job Posting Summary</h2>

          {/* Title and Company */}
          <div style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 2px' }}>{jobData.title}</h3>
            <p style={{ fontSize: '14px', color: '#5A6B73', margin: 0 }}>{jobData.companyName}</p>
          </div>

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px 20px' }}>
            <div>
              <span style={detailLabel}>Location</span>
              <p style={detailValue}>{jobData.location}</p>
            </div>
            <div>
              <span style={detailLabel}>Work Mode</span>
              <p style={detailValue}>{jobData.mode}</p>
            </div>
            <div>
              <span style={detailLabel}>Job Type</span>
              <p style={detailValue}>{jobData.jobType}</p>
            </div>
            <div>
              <span style={detailLabel}>Salary</span>
              <p style={detailValue}>{formatSalary()}</p>
            </div>
            <div>
              <span style={detailLabel}>Contact Email</span>
              <p style={detailValue}>{jobData.contactEmail}</p>
            </div>
            {jobData.companyWebsite && (
              <div>
                <span style={detailLabel}>Company Website</span>
                <p style={{ ...detailValue, whiteSpace: 'nowrap' }}>{jobData.companyWebsite}</p>
              </div>
            )}
            {/* Application method — the URL row renders only for external
                apply; platform-apply jobs have no URL and used to show a
                blank row here. */}
            {hasExternalApply ? (
              <div>
                <span style={detailLabel}>Application URL</span>
                <p style={{ ...detailValue, whiteSpace: 'nowrap' }}>{jobData.applyUrl}</p>
              </div>
            ) : (
              <div>
                <span style={detailLabel}>How Candidates Apply</span>
                <p style={detailValue}>On PMHNP Hiring — applications arrive in your dashboard.</p>
              </div>
            )}
          </div>

          {/* Description Preview */}
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <span style={detailLabel}>Description Preview</span>
            <p style={{ fontSize: '13px', color: '#4A5568', margin: '4px 0 0', lineHeight: 1.6 }}>
              {getDescriptionExcerpt(jobData.description)}
            </p>
          </div>
        </div>

        {/* Pricing Card */}
        <div style={{ ...cardBase, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 2px' }}>{getPlanName()}</h3>
              <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>{config.durationDays}-day listing</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}>{getPrice()}</span>
              <p style={{ fontSize: '12px', color: '#8A9BA6', margin: 0 }}>one-time</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[
              'Top search placement',
              `${config.limits.candidateUnlocksPerPosting} candidate unlocks`,
              `${config.limits.inmailsPerPosting} InMail credits`,
              'Applicant analytics',
              'Email candidate alerts',
            ].map((f) => (
              <span key={f} style={{
                fontSize: '12px', fontWeight: 500, padding: '5px 12px',
                borderRadius: '10px', background: '#CCFBF1', color: '#0D9488',
                boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
              }}>✓ {f}</span>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{ ...cardBase, padding: '14px 18px', marginBottom: '16px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Payment Button */}
        <button
          onClick={handlePayment}
          disabled={loading}
          className="checkout-btn-primary"
          style={{
            ...clayBtn, width: '100%', justifyContent: 'center',
            background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Creating checkout session...</>
          ) : (
            <><Lock size={15} /> Proceed to Payment — {getPrice()}</>
          )}
        </button>

        {/* Terms acknowledgement — visible at point-of-purchase per consumer
            protection norms. Reduces post-charge "I didn't know it was
            non-refundable" support tickets and chargeback risk. */}
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#8A9BA6', margin: '12px 0 0' }}>
          By clicking Pay, you agree to our{' '}
          <Link href="/terms" style={{ color: '#0D9488', textDecoration: 'underline' }}>
            Terms of Service
          </Link>
          .
        </p>

        {/* Back Link */}
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link href="/post-job" style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '13px', fontWeight: 600, color: '#6B7F8A', textDecoration: 'none',
          }}>
            <ChevronLeft size={14} /> Back to edit job posting
          </Link>
        </div>

        {/* Secure Payment Note */}
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#B0BEC5', marginTop: '20px' }}>
          Secure payment powered by Stripe. Your card details are never stored on our servers.
        </p>
      </div>

      <style>{`
        .checkout-btn-primary:hover { transform: translateY(-1px); box-shadow: 6px 6px 16px rgba(13,148,136,0.3), inset 1px 1px 2px rgba(255,255,255,0.15) !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
