'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, MapPin, Briefcase, Zap, CheckCircle, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import CategoryHero from '@/components/CategoryHero';

// US States array for dropdown
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

// Work mode options
const WORK_MODES = ['Remote', 'Hybrid', 'In-Person'];

// Job type options
const JOB_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'];

/* ═══════════════════════════════════════════
   WARM DIORAMA DESIGN TOKENS
   ═══════════════════════════════════════════ */
const cardBase: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const cardRecessed: React.CSSProperties = {
  background: '#F9F7F1',
  borderRadius: '14px',
  border: '1px solid #EAE6DF',
  boxShadow: 'inset 2px 2px 6px rgba(0,0,0,0.04), inset -1px -1px 3px rgba(255,255,255,0.5)',
};

const clayInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '14px',
  borderRadius: '12px',
  border: '1px solid #EAE6DF',
  background: '#F9F7F1',
  color: '#1A2E35',
  boxShadow: 'inset 2px 2px 6px rgba(0,0,0,0.04), inset -1px -1px 3px rgba(255,255,255,0.4)',
  outline: 'none',
  transition: 'all 0.2s',
};

const clayPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '6px 14px', borderRadius: '20px',
  fontSize: '12px', fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
  cursor: 'pointer', transition: 'all 0.2s', textDecoration: 'none',
};

function JobAlertsContent() {
  const searchParams = useSearchParams();

  // Pre-fill from URL params
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [mode, setMode] = useState(searchParams.get('mode') || '');
  const [jobType, setJobType] = useState(searchParams.get('jobType') || '');
  const [frequency, setFrequency] = useState('daily');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  const [emailError, setEmailError] = useState('');

  // Pre-fill email for logged-in users
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.email && !email) setEmail(data.email);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for searchParams changes (e.g., from quick links)
  useEffect(() => {
    setLocation(searchParams.get('location') || '');
    setMode(searchParams.get('mode') || '');
    setJobType(searchParams.get('jobType') || '');
  }, [searchParams]);

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setMessage({ type: '', text: '' });

    // Validate email
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/job-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          location: location || undefined,
          mode: mode || undefined,
          jobType: jobType || undefined,
          frequency,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Job alert created! Check your email to confirm.' });
        // Reset form
        setEmail('');
        setLocation('');
        setMode('');
        setJobType('');
        setFrequency('daily');
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build criteria summary for display
  const buildCriteriaSummary = (): string => {
    const parts: string[] = [];
    if (mode) parts.push(mode);
    if (jobType) parts.push(jobType);
    if (location) parts.push(`in ${location}`);
    return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      {/* ═══ Hero Section ═══ */}
      <CategoryHero
        bgColor="#0D9488"
        heroImage="/images/categories/hero_wc_general.png"
        heroAlt="Job Alerts"
        badgeText="Job Alerts"
        breadcrumbs={['Home', 'Job Alerts']}
        indexLabel="№ 03"
        headlineLine1="Never Miss a"
        headlineLine2="Dream Job"
        headlineSub="Personalized alerts"
        stats={[
          { value: "200+", label: 'New Daily' },
          { value: "10K+", label: 'Active Jobs' }
        ]}
        description="Get personalized PMHNP job alerts delivered straight to your inbox. Be the first to apply to jobs that match your exact criteria."
        ctaLabel="Manage Alerts"
        ctaHref="/job-alerts/manage"
      />

      {/* ═══ Main Content ═══ */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px 40px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

          {/* ─── Form Card ─── */}
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>
            <div style={{ ...cardBase, padding: '24px' }}>
              <h2 style={{
                fontSize: '18px', fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', marginBottom: '6px',
              }}>Create Your Job Alert</h2>
              <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '24px', lineHeight: 1.5 }}>
                Enter your details below and we&apos;ll notify you when matching jobs are posted.
              </p>

              {/* Success */}
              {message.type === 'success' && (
                <div style={{
                  ...cardRecessed, padding: '14px 16px', marginBottom: '20px',
                  background: '#D1FAE5', border: '1px solid #A7F3D0',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <CheckCircle size={18} style={{ color: '#059669', flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#059669', margin: '0 0 4px' }}>{message.text}</p>
                    <p style={{ fontSize: '12px', color: '#6B7F8A', margin: 0 }}>
                      You can <Link href="/job-alerts/manage" style={{ color: '#0D9488', textDecoration: 'underline' }}>manage your alerts</Link> anytime.
                    </p>
                  </div>
                </div>
              )}

              {/* Error */}
              {message.type === 'error' && (
                <div style={{
                  ...cardRecessed, padding: '14px 16px', marginBottom: '20px',
                  background: '#FEE2E2', border: '1px solid #FECACA',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{message.text}</p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Email */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6B7F8A', marginBottom: '6px' }}>
                      Email Address <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                      placeholder="you@example.com"
                      style={{
                        ...clayInput,
                        borderColor: emailError ? '#EF4444' : '#D5E8E0',
                      }}
                    />
                    {emailError && (
                      <p style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>{emailError}</p>
                    )}
                  </div>

                  {/* Location */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6B7F8A', marginBottom: '6px' }}>
                      Location <span style={{ fontWeight: 400, color: '#B0C4BC' }}>(optional)</span>
                    </label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      style={clayInput}
                    >
                      <option value="">Any Location</option>
                      <optgroup label="Work Arrangement">
                        <option value="Remote">Remote Only</option>
                      </optgroup>
                      <optgroup label="US States">
                        {US_STATES.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Work Mode */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6B7F8A', marginBottom: '6px' }}>
                      Work Mode <span style={{ fontWeight: 400, color: '#B0C4BC' }}>(optional)</span>
                    </label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      style={clayInput}
                    >
                      <option value="">Any Work Mode</option>
                      {WORK_MODES.map((workMode) => (
                        <option key={workMode} value={workMode}>{workMode}</option>
                      ))}
                    </select>
                  </div>

                  {/* Job Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6B7F8A', marginBottom: '6px' }}>
                      Job Type <span style={{ fontWeight: 400, color: '#B0C4BC' }}>(optional)</span>
                    </label>
                    <select
                      value={jobType}
                      onChange={(e) => setJobType(e.target.value)}
                      style={clayInput}
                    >
                      <option value="">Any Job Type</option>
                      {JOB_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6B7F8A', marginBottom: '8px' }}>
                      How often would you like to receive alerts?
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {['daily', 'weekly'].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          style={{
                            padding: '8px 18px', borderRadius: '12px',
                            fontSize: '13px', fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.2s',
                            background: frequency === f ? '#0D9488' : '#EDF5F0',
                            color: frequency === f ? '#fff' : '#6B7F8A',
                            border: `1px solid ${frequency === f ? 'rgba(255,255,255,0.3)' : '#D5E8E0'}`,
                            boxShadow: frequency === f
                              ? '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
                              : 'inset 2px 2px 5px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.4)',
                          }}
                        >
                          {f === 'daily' ? '📬 Daily Digest' : '📅 Weekly Digest'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div style={{
                    ...cardRecessed, padding: '12px 16px',
                  }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#B0C4BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                      You&apos;ll receive alerts for
                    </p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: 0 }}>
                      {buildCriteriaSummary()}
                    </p>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="clay-submit-btn"
                    style={{
                      width: '100%', padding: '12px',
                      borderRadius: '14px', border: 'none',
                      background: 'linear-gradient(145deg, #10B981, #0D9488)',
                      color: '#fff', fontSize: '14px', fontWeight: 700,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      opacity: isSubmitting ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '4px 4px 12px rgba(13,148,136,0.25), -2px -2px 8px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creating Alert...
                      </>
                    ) : (
                      <>
                        <Bell size={16} />
                        Create Job Alert
                      </>
                    )}
                  </button>

                  <p style={{ fontSize: '11px', color: '#B0C4BC', textAlign: 'center', margin: 0 }}>
                    You can unsubscribe anytime from the email or{' '}
                    <Link href="/job-alerts/manage" style={{ color: '#0D9488', textDecoration: 'underline' }}>
                      manage your alerts
                    </Link>.
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* ─── Sidebar ─── */}
          <div style={{ flex: '0 1 280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Benefits */}
            <div style={{ ...cardBase, padding: '20px' }}>
              <h3 style={{
                fontSize: '15px', fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', marginBottom: '16px',
              }}>Why Set Up Alerts?</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { icon: <Zap size={14} />, bg: '#DCFCE7', color: '#059669', title: 'Be First to Apply', desc: 'Get notified as soon as new jobs are posted' },
                  { icon: <Bell size={14} />, bg: '#CCFBF1', color: '#0D9488', title: 'Personalized Matches', desc: 'Only receive jobs that match your criteria' },
                  { icon: <Briefcase size={14} />, bg: '#EDE9FE', color: '#7C3AED', title: 'Save Time', desc: 'No need to check the site daily' },
                ].map((item) => (
                  <div key={item.title} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '10px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: item.bg, color: item.color, flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.5)',
                      boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
                    }}>
                      {item.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: '0 0 2px' }}>{item.title}</p>
                      <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div style={{ ...cardBase, padding: '20px' }}>
              <h3 style={{
                fontSize: '15px', fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', marginBottom: '12px',
              }}>Popular Alert Filters</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { label: 'Remote', icon: <MapPin size={12} />, href: '/job-alerts?mode=Remote' },
                  { label: 'Full-Time', icon: <Briefcase size={12} />, href: '/job-alerts?jobType=Full-Time' },
                  { label: 'California', href: '/job-alerts?location=California' },
                  { label: 'Texas', href: '/job-alerts?location=Texas' },
                  { label: 'New York', href: '/job-alerts?location=New+York' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    style={{
                      ...clayPill,
                      background: '#EDF5F0', color: '#6B7F8A',
                    }}
                  >
                    {link.icon}{link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{ ...cardBase, padding: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Trusted by PMHNPs
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ ...cardRecessed, padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: '#0D9488', margin: '0 0 2px' }}>200+</p>
                  <p style={{ fontSize: '10px', color: '#8A9BA6', margin: 0 }}>New jobs daily</p>
                </div>
                <div style={{ ...cardRecessed, padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: '#0D9488', margin: '0 0 2px' }}>10,000+</p>
                  <p style={{ fontSize: '10px', color: '#8A9BA6', margin: 0 }}>Active listings</p>
                </div>
              </div>
            </div>

            {/* Manage link */}
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <p style={{ fontSize: '12px', color: '#8A9BA6' }}>
                Already have alerts?{' '}
                <Link href="/job-alerts/manage" style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'underline' }}>
                  Manage them here
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Browse link */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Link href="/jobs" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', fontWeight: 600, color: '#6B7F8A',
            textDecoration: 'none',
          }}>
            <ArrowLeft size={14} />
            Browse all jobs instead
          </Link>
        </div>
      </div>

      {/* ═══ Hover styles ═══ */}
      <style>{`
        .clay-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 6px 6px 16px rgba(13,148,136,0.30), -3px -3px 10px rgba(255,255,255,0.4), inset 0 1px 0 rgba(255,255,255,0.2) !important;
        }
        .clay-submit-btn:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 4px rgba(255,255,255,0.1) !important;
        }
      `}</style>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', display: 'flex', flexDirection: 'column' }}>
      {/* Shimmer hero */}
      <div style={{ padding: '32px 16px 24px', background: '#F9F7F1', borderBottom: '1px solid #EAE6DF' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="skel-shimmer" style={{ width: '52px', height: '52px', borderRadius: '16px', background: '#FFFFFF', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skel-shimmer" style={{ height: '22px', width: '60%', borderRadius: '8px', background: '#EAE6DF', marginBottom: '8px' }} />
            <div className="skel-shimmer" style={{ height: '14px', width: '40%', borderRadius: '6px', background: '#F9F7F1' }} />
          </div>
        </div>
      </div>
      {/* Shimmer form */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px', width: '100%' }}>
        <div style={{ ...cardBase, padding: '24px', maxWidth: '500px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ marginBottom: '18px' }}>
              <div className="skel-shimmer" style={{ height: '12px', width: '80px', borderRadius: '6px', background: '#EDF5F0', marginBottom: '8px' }} />
              <div className="skel-shimmer" style={{ height: '40px', width: '100%', borderRadius: '12px', background: '#EDF5F0' }} />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skel-shimmer {
          background: linear-gradient(90deg, #EDF5F0 25%, #F7FBF8 50%, #EDF5F0 75%) !important;
          background-size: 200% 100% !important;
          animation: shimmer 1.5s ease-in-out infinite !important;
        }
      `}</style>
    </div>
  );
}

export default function JobAlertsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <JobAlertsContent />
    </Suspense>
  );
}
