"use client"

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight } from 'lucide-react'

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
      setError('This password reset link has expired. Please request a new one.')
    } else if (errorCode) {
      setError('Invalid or expired reset link. Please request a new one.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)

      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "block w-full px-4 py-3 pr-11 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
  const inputSty = {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-color-dark)',
  }

  return (
    <div
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Set new password
          </h1>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color-dark)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          }}
        >
          {linkExpired ? (
            <div className="text-center space-y-4 py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(239,68,68,0.1)' }}
              >
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Link Expired</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                This password reset link has expired or has already been used.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                For security reasons, reset links are only valid for 1 hour.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block mt-4 px-6 py-2.5 rounded-lg font-medium text-white hover:opacity-90 transition-all"
                style={{ background: 'var(--color-primary)' }}
              >
                Request New Reset Link
              </Link>
              <Link
                href="/login"
                className="block text-sm font-medium hover:underline"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Return to login
              </Link>
            </div>
          ) : success ? (
            <div className="text-center space-y-4 py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(16,185,129,0.1)' }}
              >
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Password updated!</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Redirecting you to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div
                  className="rounded-lg p-3 flex items-start gap-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  New password
                </label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputCls}
                    style={inputSty}
                    placeholder="Minimum 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-confirmPassword" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Confirm new password
                </label>
                <div className="relative">
                  <input
                    id="reset-confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={inputCls}
                    style={inputSty}
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ background: 'var(--color-primary)' }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    Update password
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
