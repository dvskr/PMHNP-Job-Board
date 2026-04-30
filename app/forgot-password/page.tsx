"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, AlertCircle, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import { inputStyle, labelStyle, errorBannerStyle, ctaButtonStyle } from '@/components/auth/authTokens'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
        }),
      })
      if (!res.ok) {
        if (res.status === 429) {
          setError('Too many reset attempts. Try again in an hour.')
        } else {
          setError('Could not send reset email. Please try again.')
        }
        return
      }
      // The server returns the same 200 OK whether or not the email
      // exists — show the same success UI to avoid account enumeration.
      setSuccess(true)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout illustration="/illustrations/auth-forgot.png">
      <h1 style={{
        fontSize: '28px', fontWeight: 800, color: '#1A2E35',
        fontFamily: 'var(--font-lora), Georgia, serif',
        margin: '0 0 6px', letterSpacing: '-0.5px', textAlign: 'center',
      }}>
        Reset your password
      </h1>
      <p style={{ fontSize: '14px', color: '#6B7F8A', marginBottom: '20px', textAlign: 'center' }}>
        Enter your email and we&apos;ll send you a reset link
      </p>

      <div style={{
        background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)', padding: '24px',
      }}>
        {success ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', padding: '8px 0' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '16px',
              background: '#D1FAE5', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle className="w-7 h-7" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>Check your email</h3>
            <p style={{ fontSize: '14px', color: '#6B7F8A', margin: 0 }}>
              We&apos;ve sent a password reset link to <strong>{email}</strong>
            </p>
            <Link href="/login" style={{ fontSize: '14px', fontWeight: 600, color: '#0D9488', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
              <ArrowLeft className="w-4 h-4" /> Back to login
            </Link>
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
              <label htmlFor="reset-email" style={labelStyle}>Email address</label>
              <input id="reset-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                style={inputStyle} placeholder="you@example.com" />
            </div>
            <button type="submit" disabled={loading} style={ctaButtonStyle(loading)}>
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : <>Send reset link <ArrowRight className="w-4 h-4" /></>}
            </button>
            <Link href="/login" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', fontSize: '14px', fontWeight: 500, color: '#6B7F8A', textDecoration: 'none',
            }}>
              <ArrowLeft className="w-4 h-4" /> Back to login
            </Link>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
