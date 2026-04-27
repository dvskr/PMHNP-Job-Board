"use client"

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import { inputWithRightIcon, labelStyle, eyeBtnStyle, errorBannerStyle, ctaButtonStyle } from '@/components/auth/authTokens'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)

  useEffect(() => {
    const errorCode = searchParams.get('error_code')
    const errorDescription = searchParams.get('error_description')
    if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
      setLinkExpired(true)
    } else if (errorCode) {
      setError('Invalid or expired reset link. Please request a new one.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) { setError(updateError.message); return; }
      setSuccess(true)
      setTimeout(() => { router.push('/login') }, 3000)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const renderCard = (children: React.ReactNode) => (
    <div style={{
      background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0',
      boxShadow: '0 4px 24px rgba(0,0,0,0.04)', padding: '24px',
    }}>
      {children}
    </div>
  );

  return (
    <AuthLayout illustration="/illustrations/auth-forgot.png">
      <h1 style={{
        fontSize: '28px', fontWeight: 800, color: '#1A2E35',
        fontFamily: 'var(--font-lora), Georgia, serif',
        margin: '0 0 6px', letterSpacing: '-0.5px', textAlign: 'center',
      }}>
        {linkExpired ? 'Link Expired' : success ? 'Password Updated' : 'Set new password'}
      </h1>
      <p style={{ fontSize: '14px', color: '#6B7F8A', marginBottom: '20px', textAlign: 'center' }}>
        {linkExpired ? 'This link is no longer valid' : success ? 'Redirecting to login...' : 'Choose a strong password'}
      </p>

      {renderCard(
        linkExpired ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle className="w-7 h-7" />
            </div>
            <p style={{ fontSize: '14px', color: '#6B7F8A', margin: 0 }}>Reset links expire after 1 hour for security.</p>
            <Link href="/forgot-password" style={{ ...ctaButtonStyle(false), width: 'auto', display: 'inline-flex', marginTop: '4px', textDecoration: 'none' }}>
              Request New Link
            </Link>
            <Link href="/login" style={{ fontSize: '13px', color: '#6B7F8A', textDecoration: 'none' }}>Return to login</Link>
          </div>
        ) : success ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#D1FAE5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle className="w-7 h-7" />
            </div>
            <p style={{ fontSize: '14px', color: '#6B7F8A', margin: 0 }}>Your password has been updated. Redirecting...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div style={errorBannerStyle}>
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="reset-password" style={labelStyle}>New password</label>
              <div style={{ position: 'relative' }}>
                <input id="reset-password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"
                  style={inputWithRightIcon} placeholder="Minimum 8 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reset-confirm" style={labelStyle}>Confirm new password</label>
              <div style={{ position: 'relative' }}>
                <input id="reset-confirm" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password"
                  style={inputWithRightIcon} placeholder="Re-enter your password" />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={eyeBtnStyle}>
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={ctaButtonStyle(loading)}>
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Updating...</> : <>Update password <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        )
      )}
    </AuthLayout>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#0D9488', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '14px', color: '#94A3B0' }}>Loading...</p>
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
