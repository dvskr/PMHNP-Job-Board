"use client"

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'

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
      const supabase = createClient()

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      })

      if (resetError) {
        setError(resetError.message)
        return
      }

      setSuccess(true)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout variant="forgot">
      {success ? (
        <div className="text-center space-y-4 py-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(16,185,129,0.1)' }}
          >
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Check your email
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            We&apos;ve sent a password reset link to <strong>{email}</strong>
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 mt-4 font-medium text-sm hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
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

          <div className="text-center mb-2">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-lora), Georgia, serif' }}>
              Reset your password
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email address
            </label>
            <input
              id="reset-email"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                Send reset link
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 text-sm font-medium hover:underline"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
        </form>
      )}
    </AuthLayout>
  )
}
