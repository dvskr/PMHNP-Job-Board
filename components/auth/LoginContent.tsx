'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { safeInternalPath } from '@/lib/auth/safe-redirect';
import { Loader2, AlertCircle, Eye, EyeOff, ArrowRight, Mail, User, Building2 } from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';
import {
  inputStyle, inputWithRightIcon, labelStyle, eyeBtnStyle,
  errorBannerStyle, linkStyle,
} from './authTokens';

type Role = 'seeker' | 'employer';

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

export default function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>('seeker');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnconfirmed, setIsUnconfirmed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Init role from URL param
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'employer') setRole('employer');
  }, [searchParams]);

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0 || !email) return;
    setResendStatus('sending');
    try {
      const res = await fetch('/api/auth/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setResendStatus('error');
      } else {
        setResendStatus('sent');
        setResendCooldown(60);
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      }
    } catch {
      setResendStatus('error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIsUnconfirmed(false);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirm')) {
          setIsUnconfirmed(true);
          setError('Your email has not been confirmed yet. Check your inbox (and spam) for the confirmation link.');
        } else {
          setError(signInError.message);
        }
        return;
      }

      if (data.user) {
        // If this account was soft-deleted, logging back in within the 30-day
        // grace window restores it — exactly what the delete-account flow
        // promises. The endpoint is a no-op (400) for accounts that aren't
        // deleted, so this is safe to call on every login. Same-origin fetch
        // passes the Origin-based CSRF check automatically. Never block login
        // on this probe.
        try {
          await fetch('/api/auth/restore-account', { method: 'POST' });
        } catch { /* non-blocking */ }
        router.refresh();
        // Honor a post-login return target (?redirectTo= or the ?next= that
        // /onboarding/professional and other gated pages send). Validated to a
        // safe same-origin path; falls back to the role's dashboard.
        const dest = safeInternalPath(
          searchParams.get('redirectTo') || searchParams.get('next'),
          role === 'employer' ? '/employer/dashboard' : '/dashboard',
        );
        router.push(dest);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const switchRole = (newRole: Role) => {
    setRole(newRole);
    setError(null);
    setIsUnconfirmed(false);
  };

  const accent = role === 'employer' ? '#B45309' : '#0D9488';

  return (
    <>
      {/* Heading */}
      <h1 style={{
        fontSize: '28px', fontWeight: 800, color: '#1A2E35',
        fontFamily: 'var(--font-lora), Georgia, serif',
        lineHeight: 1.25, letterSpacing: '-0.5px', margin: '0 0 4px',
        textAlign: 'center',
      }}>
        Sign in
      </h1>
      <p style={{ fontSize: '14px', color: '#6B7F8A', marginBottom: '14px', textAlign: 'center' }}>
        {role === 'employer'
          ? 'Manage your job listings and find top PMHNP talent'
          : 'Access your saved jobs, applications, and profile'}
      </p>

      {/* ═══ ROLE TOGGLE ═══ */}
      <div style={{
        display: 'flex',
        background: '#F1F5F9',
        borderRadius: '14px',
        padding: '4px',
        marginBottom: '14px',
        border: '1px solid #E2E8F0',
      }}>
        <button type="button" onClick={() => switchRole('seeker')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', padding: '11px 16px', fontSize: '14px',
            fontWeight: role === 'seeker' ? 700 : 500,
            borderRadius: '11px', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: role === 'seeker' ? '#FFFFFF' : 'transparent',
            color: role === 'seeker' ? '#0D9488' : '#94A3B0',
            boxShadow: role === 'seeker' ? '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}
        >
          <User className="w-4 h-4" />
          Job Seeker
        </button>
        <button type="button" onClick={() => switchRole('employer')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', padding: '11px 16px', fontSize: '14px',
            fontWeight: role === 'employer' ? 700 : 500,
            borderRadius: '11px', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: role === 'employer' ? '#FFFFFF' : 'transparent',
            color: role === 'employer' ? '#B45309' : '#94A3B0',
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
            <GoogleSignInButton mode="login" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div role="alert" style={errorBannerStyle}>
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{error}</p>
                {isUnconfirmed && (
                  <div style={{ marginTop: '8px' }}>
                    {resendStatus === 'sent' && <p style={{ fontSize: '12px', color: '#059669', marginBottom: '4px' }}>✓ Confirmation email resent!</p>}
                    {resendStatus === 'error' && <p style={{ fontSize: '12px', color: '#DC2626', marginBottom: '4px' }}>Failed to resend.</p>}
                    <button type="button" onClick={handleResendConfirmation}
                      disabled={resendCooldown > 0 || resendStatus === 'sending'}
                      style={{ fontSize: '12px', fontWeight: 600, color: accent, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Mail className="w-3 h-3" />
                      {resendStatus === 'sending' ? 'Sending...' :
                       resendCooldown > 0 ? `Resend in ${resendCooldown}s` :
                       'Resend confirmation email'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="login-email" style={labelStyle}>
              {role === 'employer' ? 'Work Email' : 'Email address'}
            </label>
            <input id="login-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
              style={inputStyle}
              placeholder={role === 'employer' ? 'hiring@company.com' : 'you@example.com'} />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input id="login-password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                style={inputWithRightIcon} placeholder="Enter your password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle}
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember / Forgot */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
              <input type="checkbox" style={{ accentColor: accent, width: '15px', height: '15px' }} />
              <span style={{ fontSize: '13px', color: '#4B5E68' }}>Remember me</span>
            </label>
            <Link href="/forgot-password" style={{ fontSize: '13px', fontWeight: 600, color: accent, textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading} style={ctaStyle(role, loading)}>
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</>
            ) : (
              <>Sign in <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {/* Sign up link */}
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#6B7F8A', marginTop: '14px', marginBottom: 0 }}>
          Don&apos;t have an account?{' '}
          <Link href={role === 'employer' ? '/signup?role=employer' : '/signup'}
            style={{ fontWeight: 700, color: accent, textDecoration: 'none' }}>
            Create one
          </Link>
        </p>
      </div>
    </>
  );
}
