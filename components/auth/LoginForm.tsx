"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, Eye, EyeOff, ArrowRight, Mail } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUnconfirmed, setIsUnconfirmed] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0 || !email) return
    setResendStatus('sending')
    try {
      const supabase = createClient()
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      })
      if (resendError) {
        setResendStatus('error')
      } else {
        setResendStatus('sent')
        setResendCooldown(60)
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0 }
            return prev - 1
          })
        }, 1000)
      }
    } catch {
      setResendStatus('error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setIsUnconfirmed(false)

    try {
      const supabase = createClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // Check if it's an email-not-confirmed error
        const msg = signInError.message.toLowerCase()
        if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirm')) {
          setIsUnconfirmed(true)
          setError('Your email address has not been confirmed yet. Please check your inbox (and spam folder) for the confirmation link.')
        } else {
          setError(signInError.message)
        }
        return
      }

      if (data.user) {
        router.refresh()
        router.push('/dashboard')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          className="rounded-lg p-3 flex flex-col gap-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
          {isUnconfirmed && (
            <div className="ml-8">
              {resendStatus === 'sent' && (
                <p className="text-sm text-emerald-500 mb-1">✓ Confirmation email resent! Check your inbox.</p>
              )}
              {resendStatus === 'error' && (
                <p className="text-sm text-red-400 mb-1">Failed to resend. Please try again.</p>
              )}
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resendCooldown > 0 || resendStatus === 'sending'}
                className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: 'var(--color-primary)' }}
              >
                <Mail className="w-3.5 h-3.5" />
                {resendStatus === 'sending' ? 'Sending...' :
                 resendCooldown > 0 ? `Resend in ${resendCooldown}s` :
                 'Resend confirmation email'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Email address
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="block w-full px-4 py-3 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            WebkitTextFillColor: 'var(--text-primary)',
            borderColor: 'var(--border-color-dark)',
          }}
          placeholder="you@example.com"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Password
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="block w-full px-4 py-3 pr-11 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              WebkitTextFillColor: 'var(--text-primary)',
              borderColor: 'var(--border-color-dark)',
            }}
            placeholder="Enter your password"
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

      {/* Remember / Forgot */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Remember me</span>
        </label>
        <Link
          href="/forgot-password"
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          Forgot password?
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
        style={{ background: 'var(--color-primary)' }}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Sign up link */}
      <p className="text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
          Create one
        </Link>
      </p>
    </form>
  )
}
