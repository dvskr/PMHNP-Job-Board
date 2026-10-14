"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff, Bell, ArrowRight, User, Building2, Mail } from 'lucide-react'
import { trackSignUp } from '@/lib/analytics'
import { safeInternalPath } from '@/lib/auth/safe-redirect'
import GoogleSignInButton from './GoogleSignInButton'
import {
  inputStyle, inputWithRightIcon, inputWithLeftIcon, labelStyle, helperStyle,
  eyeBtnStyle, errorBannerStyle, optInCardStyle, linkStyle,
} from './authTokens'

type Role = 'seeker' | 'employer';

const FREE_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
];

/* ─── CTA per role ─── */
const ctaStyle = (role: Role, loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '13px 24px',
  borderRadius: '14px',
  border: 'none',
  background: role === 'employer'
    ? 'linear-gradient(145deg, #B45309, #92400E)'
    : 'linear-gradient(145deg, #0D9488, #0F766E)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '15px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.6 : 1,
  boxShadow: role === 'employer'
    ? '0 4px 14px rgba(180,83,9,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
    : '0 4px 14px rgba(13,148,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
  transition: 'all 0.2s',
});

export default function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>('seeker');

  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Seeker-specific
  const [wantJobHighlights, setWantJobHighlights] = useState(true);
  const [highlightsFrequency, setHighlightsFrequency] = useState<'daily' | 'weekly'>('daily');
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);

  // Employer-specific
  const [company, setCompany] = useState('');

  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  // The cooldown interval is started inside an event handler, so it has no
  // effect cleanup of its own. Without this ref it kept ticking (and calling
  // setState on an unmounted component) for up to 60s after the user
  // navigated away from the form.
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // There is deliberately no "preferences did not save" state any more. The
  // opt-ins now travel in the signUp metadata and are applied by
  // ensure-profile when the profile is created, so the profile POST failing
  // loses nothing and has nothing to report. See lib/auth/signup-preferences.

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'employer') setRole('employer');
  }, [searchParams]);

  useEffect(() => () => {
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
  }, []);

  // Post-signup return target (e.g. the /post-job wall sends
  // ?redirectTo=/post-job so the employer lands back on the form instead
  // of having to re-find it from the dashboard). Validated to a
  // same-origin path — never an absolute/protocol-relative URL — so the
  // param can't be abused as an open redirect. Null when absent/invalid.
  const redirectTo = safeInternalPath(searchParams.get('redirectTo'), '') || null;

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0) return;
    setResendStatus('sending');
    try {
      const res = await fetch('/api/auth/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { setResendStatus('error'); }
      else {
        setResendStatus('sent');
        setResendCooldown(60);
        if (resendTimerRef.current) clearInterval(resendTimerRef.current);
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
        resendTimerRef.current = timer;
      }
    } catch { setResendStatus('error'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // `required` passes on a string of spaces, and sanitizeText trims it away
    // server-side, so a blank-name account was created with a success screen
    // and no name at all. Check the trimmed value, not the raw one.
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    // Employer: block free email
    if (role === 'employer') {
      const emailDomain = email.toLowerCase().split('@')[1];
      if (emailDomain && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
        setError('Please use your company email. Free email providers (Gmail, Yahoo, etc.) are not accepted for employer accounts.');
        setLoading(false);
        return;
      }
    }

    try {
      const supabase = createClient();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Carry the return target through the email-confirmation loop —
          // /auth/confirm reads ?redirectTo= and routes there (re-validated
          // on that page) instead of hardcoding /dashboard.
          emailRedirectTo: `${window.location.origin}/auth/confirm${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`,
          // Everything the profile needs travels here, because this is the
          // only channel that survives the gap. signUp() returns no session
          // when the project requires email confirmation, so the POST below
          // cannot authenticate and 401s; ensure-profile reads this metadata
          // back on the first authenticated request and builds the profile
          // from it. role and company have been carried this way since
          // 2026-05. The three opt-ins were not, which is why they were lost
          // on every signup and the form reported that they had been.
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role: role === 'employer' ? 'employer' : 'job_seeker',
            company: role === 'employer' ? company.trim() : null,
            want_job_highlights: role === 'seeker' ? wantJobHighlights : false,
            highlights_frequency: role === 'seeker' ? highlightsFrequency : null,
            newsletter_opt_in: newsletterOptIn,
          },
        },
      });

      if (signUpError) { setError(signUpError.message); return; }

      if (data.user) {
        // Best effort, and deliberately silent on failure.
        //
        // This POST authenticates from the session cookie, and signUp() does
        // not issue one while the project requires email confirmation, so it
        // answers 401 on essentially every signup. It used to surface that as
        // "we could not save your email preferences", which is a real-looking
        // warning on the success screen of a signup that worked, and it is
        // what one employer reported as a pop-up blocking their final step.
        //
        // Nothing is lost when it fails now: every field above also travels
        // in the signUp metadata, and ensure-profile applies it when the
        // profile is created on the first authenticated request. The call is
        // kept only for the case where a session DOES exist (confirmation
        // turned off, or an already-confirmed address), where it saves a
        // round trip later.
        fetch('/api/auth/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabaseId: data.user.id,
            email: data.user.email,
            firstName: firstName.trim(), lastName: lastName.trim(),
            role: role === 'employer' ? 'employer' : 'job_seeker',
            company: role === 'employer' ? company.trim() : null,
            wantJobHighlights: role === 'seeker' ? wantJobHighlights : false,
            highlightsFrequency: role === 'seeker' ? highlightsFrequency : undefined,
            newsletterOptIn,
          }),
        }).catch(() => {});

        fetch('/api/auth/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.user.email }),
        }).catch(() => {});

        setSuccess(true);
        trackSignUp('email', role === 'employer' ? 'employer' : 'job_seeker');

        if (data.session) {
          router.refresh();
          // A validated ?redirectTo= wins (e.g. back to /post-job from the
          // posting wall). Otherwise: seekers go through the 1-screen
          // professional-info interstitial so headline/specialties/
          // yearsExperience get filled before they hit the dashboard. The
          // page itself short-circuits to /dashboard if the profile is
          // already searchable (returning users in autoconfirm setups), so
          // it's safe to route everyone through it.
          router.push(redirectTo ?? (role === 'employer' ? '/employer/dashboard' : '/onboarding/professional'));
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchRole = (newRole: Role) => {
    setRole(newRole);
    setError(null);
  };

  // A11y: accent is used as link and button TEXT on white, where #0D9488
  // is only 3.74:1. #0F766E is 5.47:1 and is the repo's compliant teal.
  const accent = role === 'employer' ? '#B45309' : '#0F766E';

  // ─── SUCCESS STATE ───
  if (success) {
    return (
      <>
        <div style={{
          background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0',
          boxShadow: '0 4px 24px rgba(0,0,0,0.04)', padding: '32px',
          textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: role === 'employer' ? '#FEF3C7' : '#D1FAE5',
            color: role === 'employer' ? '#B45309' : '#059669',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle className="w-7 h-7" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: 0, fontFamily: 'var(--font-lora), Georgia, serif' }}>
            Check your email
          </h3>
          <p style={{ fontSize: '14px', color: '#4B5E68', margin: 0 }}>
            We&apos;ve sent a confirmation link to <strong>{email}</strong>
          </p>
          <p style={{ fontSize: '12px', color: '#4B5E68', margin: 0 }}>
            Check spam/junk if you don&apos;t see it within a few minutes.
          </p>
          <div style={{ marginTop: '4px' }}>
            {resendStatus === 'sent' && <p style={{ fontSize: '12px', color: '#059669' }}>✓ Confirmation email resent!</p>}
            {resendStatus === 'error' && <p style={{ fontSize: '12px', color: '#DC2626' }}>Failed to resend.</p>}
            <button type="button" onClick={handleResendConfirmation}
              disabled={resendCooldown > 0 || resendStatus === 'sending'}
              style={{ fontSize: '13px', fontWeight: 600, color: accent, background: 'none', border: 'none', cursor: 'pointer' }}>
              {resendStatus === 'sending' ? 'Sending...' :
               resendCooldown > 0 ? `Resend in ${resendCooldown}s` :
               "Didn't receive it? Resend"}
            </button>
          </div>
          <Link href="/login" style={{ ...linkStyle, fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', color: accent }}>
            Go to login <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </>
    );
  }

  // ─── MAIN FORM ───
  return (
    <>
      {/* Heading */}
      <h1 style={{
        fontSize: '28px', fontWeight: 800, color: '#1A2E35',
        fontFamily: 'var(--font-lora), Georgia, serif',
        lineHeight: 1.25, letterSpacing: '-0.5px', margin: '0 0 4px',
        textAlign: 'center',
      }}>
        Create your account
      </h1>
      <p style={{ fontSize: '14px', color: '#4B5E68', marginBottom: '14px', textAlign: 'center' }}>
        {role === 'employer'
          ? 'Start posting jobs and hiring qualified PMHNPs'
          : 'Save jobs, set up alerts, and apply to psychiatric mental health NP roles'}
      </p>

      {/* ═══ ROLE TOGGLE ═══ */}
      {/* The choice changes which fields the form asks for and which mailbox
          rules apply, and it was signalled by colour and font-weight alone.
          aria-pressed is the only cue assistive tech gets. */}
      <div role="group" aria-label="Sign up as" style={{
        display: 'flex',
        background: '#F1F5F9',
        borderRadius: '14px',
        padding: '4px',
        marginBottom: '14px',
        border: '1px solid #E2E8F0',
      }}>
        <button type="button" aria-pressed={role === 'seeker'} onClick={() => switchRole('seeker')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', padding: '11px 16px', fontSize: '14px',
            fontWeight: role === 'seeker' ? 700 : 500,
            borderRadius: '11px', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: role === 'seeker' ? '#FFFFFF' : 'transparent',
            // A11y: #0D9488 is 3.74:1 on white and #94A3B0 is 2.35:1 on the
            // #F1F5F9 track. #0F766E and #4B5E68 both clear 4.5:1.
            color: role === 'seeker' ? '#0F766E' : '#4B5E68',
            boxShadow: role === 'seeker' ? '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}
        >
          <User className="w-4 h-4" />
          Job Seeker
        </button>
        <button type="button" aria-pressed={role === 'employer'} onClick={() => switchRole('employer')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', padding: '11px 16px', fontSize: '14px',
            fontWeight: role === 'employer' ? 700 : 500,
            borderRadius: '11px', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: role === 'employer' ? '#FFFFFF' : 'transparent',
            color: role === 'employer' ? '#B45309' : '#4B5E68',
            boxShadow: role === 'employer' ? '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}
        >
          <Building2 className="w-4 h-4" />
          Employer
        </button>
      </div>

      {/* ═══ FORM CARD ═══ */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
        padding: '24px',
      }}>
        {/* Google — seeker only */}
        {role === 'seeker' && (
          <>
            <GoogleSignInButton mode="signup" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#4B5E68', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div role="alert" style={errorBannerStyle}>
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Name — stack on mobile so each input has a usable width;
              two columns from sm: (640px) up where the form has room. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="signup-firstName" style={labelStyle}>First name</label>
              <input id="signup-firstName" type="text" value={firstName}
                onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name"
                style={inputStyle} placeholder="Jane" />
            </div>
            <div>
              <label htmlFor="signup-lastName" style={labelStyle}>Last name</label>
              <input id="signup-lastName" type="text" value={lastName}
                onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name"
                style={inputStyle} placeholder="Doe" />
            </div>
          </div>

          {/* Company — employer only */}
          {role === 'employer' && (
            <div>
              <label htmlFor="signup-company" style={labelStyle}>Company name</label>
              <div style={{ position: 'relative' }}>
                <Building2 className="w-4 h-4" style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: '#94A3B0', pointerEvents: 'none',
                }} />
                <input id="signup-company" type="text" value={company}
                  onChange={(e) => setCompany(e.target.value)} required
                  aria-describedby="signup-company-note"
                  style={inputWithLeftIcon} placeholder="Your company" />
              </div>
              {/* The name is locked after signup (settings refuses changes,
                  support only) and every listing publishes under it, so the
                  one moment they can choose it deserves a clear warning. */}
              <p id="signup-company-note" style={{ ...helperStyle, color: '#B45309' }}>
                Your company name cannot be changed after the account is created. All your job postings will be published under this name.
              </p>
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="signup-email" style={labelStyle}>
              {role === 'employer' ? 'Work Email' : 'Email address'}
            </label>
            {role === 'employer' ? (
              <div style={{ position: 'relative' }}>
                <Mail className="w-4 h-4" style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: '#94A3B0', pointerEvents: 'none',
                }} />
                <input id="signup-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                  style={inputWithLeftIcon} placeholder="hiring@company.com" />
              </div>
            ) : (
              <input id="signup-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                style={inputStyle} placeholder="you@example.com" />
            )}
            {role === 'employer' && (
              <p style={helperStyle}>Please use your professional or company email.</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="signup-password" style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input id="signup-password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"
                style={inputWithRightIcon} placeholder="Minimum 8 characters" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle}
                aria-label={showPassword ? 'Hide' : 'Show'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="signup-confirmPassword" style={labelStyle}>Confirm password</label>
            <div style={{ position: 'relative' }}>
              <input id="signup-confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password"
                style={inputWithRightIcon} placeholder="Re-enter your password" />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={eyeBtnStyle}
                aria-label={showConfirmPassword ? 'Hide' : 'Show'}>
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Opt-in — different per role */}
          {role === 'seeker' ? (
            <div style={optInCardStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={wantJobHighlights} onChange={(e) => setWantJobHighlights(e.target.checked)}
                  style={{ accentColor: '#0D9488', width: '15px', height: '15px', flexShrink: 0 }} />
                <Bell className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0D9488' }} />
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#1A2E35' }}>Email me job highlights</span>
                {wantJobHighlights && (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="radio" name="freq" value="daily" checked={highlightsFrequency === 'daily'}
                        onChange={() => setHighlightsFrequency('daily')} style={{ accentColor: '#0D9488' }} />
                      <span style={{ fontSize: '12px', color: '#4B5E68' }}>Daily</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="radio" name="freq" value="weekly" checked={highlightsFrequency === 'weekly'}
                        onChange={() => setHighlightsFrequency('weekly')} style={{ accentColor: '#0D9488' }} />
                      <span style={{ fontSize: '12px', color: '#4B5E68' }}>Weekly</span>
                    </label>
                  </span>
                )}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #D1E7DD' }}>
                <input type="checkbox" checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  style={{ accentColor: '#0D9488', width: '15px', height: '15px', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#4B5E68' }}>
                  Send me career tips, salary insights, and market updates
                </span>
              </label>
            </div>
          ) : (
            <div style={{ ...optInCardStyle, background: '#FFFBEB', borderColor: '#FCD34D' }}>
              <label style={{ display: 'flex', alignItems: 'start', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  style={{ accentColor: '#B45309', width: '15px', height: '15px', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#4B5E68' }}>
                  Send me hiring tips, salary benchmarks, and PMHNP market insights
                </span>
              </label>
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading} style={ctaStyle(role, loading)}>
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
            ) : (
              <>{role === 'employer' ? 'Create Employer Account' : 'Create account'} <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {/* Login link */}
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#4B5E68', marginTop: '14px', marginBottom: 0 }}>
          Already have an account?{' '}
          <Link href={role === 'employer' ? '/login?role=employer' : '/login'}
            style={{ fontWeight: 700, color: accent, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
