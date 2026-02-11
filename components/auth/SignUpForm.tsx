"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { User, Building2, Loader2, AlertCircle, CheckCircle, Eye, EyeOff, Bell, ArrowRight } from 'lucide-react'

type UserRole = 'job_seeker' | 'employer'

import GoogleSignInButton from './GoogleSignInButton'

const FREE_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
]

export default function SignUpForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<UserRole>('job_seeker')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [wantJobHighlights, setWantJobHighlights] = useState(true)
  const [highlightsFrequency, setHighlightsFrequency] = useState<'daily' | 'weekly'>('daily')

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

    if (role === 'employer') {
      const emailDomain = email.toLowerCase().split('@')[1]
      if (emailDomain && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
        setError('Please use your company email to sign up as an employer. Free email providers are not accepted.')
        setLoading(false)
        return
      }
    }

    try {
      const supabase = createClient()

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            role: role,
            company: role === 'employer' ? company : null,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (data.user) {
        await fetch('/api/auth/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabaseId: data.user.id,
            email: data.user.email,
            firstName,
            lastName,
            role,
            company: role === 'employer' ? company : null,
            wantJobHighlights: role === 'job_seeker' ? wantJobHighlights : false,
            highlightsFrequency: role === 'job_seeker' ? highlightsFrequency : undefined,
          }),
        })

        setSuccess(true)

        if (data.session) {
          router.refresh()
          router.push('/dashboard')
        }
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Shared input classes
  const inputCls = "block w-full px-4 py-3 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
  const inputSty = {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-color-dark)',
  }

  if (success) {
    return (
      <div className="text-center space-y-4 py-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(16,185,129,0.1)' }}
        >
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Check your email</h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          We&apos;ve sent a confirmation link to <strong>{email}</strong>
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 mt-4 font-medium text-sm hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          Return to login
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div
          className="rounded-lg p-3 flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Role Selection - Pill Toggle */}
      <div className="flex rounded-lg p-1" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
        <button
          type="button"
          onClick={() => setRole('job_seeker')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all"
          style={{
            background: role === 'job_seeker' ? 'var(--bg-secondary)' : 'transparent',
            color: role === 'job_seeker' ? 'var(--color-primary)' : 'var(--text-tertiary)',
            boxShadow: role === 'job_seeker' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          <User className="w-4 h-4" />
          Job Seeker
        </button>
        <button
          type="button"
          onClick={() => setRole('employer')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all"
          style={{
            background: role === 'employer' ? 'var(--bg-secondary)' : 'transparent',
            color: role === 'employer' ? 'var(--color-primary)' : 'var(--text-tertiary)',
            boxShadow: role === 'employer' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          <Building2 className="w-4 h-4" />
          Employer
        </button>
      </div>

      {/* Google Sign-In for Job Seekers */}
      {role !== 'employer' && (
        <>
          <GoogleSignInButton mode="signup" />
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--border-color)' }} />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 text-xs uppercase tracking-wider font-medium"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
              >
                or
              </span>
            </div>
          </div>
        </>
      )}

      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="signup-firstName" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            First name
          </label>
          <input
            id="signup-firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoComplete="given-name"
            className={inputCls}
            style={inputSty}
            placeholder="Jane"
          />
        </div>
        <div>
          <label htmlFor="signup-lastName" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Last name
          </label>
          <input
            id="signup-lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            autoComplete="family-name"
            className={inputCls}
            style={inputSty}
            placeholder="Doe"
          />
        </div>
      </div>

      {/* Company Field (employers only) */}
      {role === 'employer' && (
        <div>
          <label htmlFor="signup-company" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Company name
          </label>
          <input
            id="signup-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            autoComplete="organization"
            className={inputCls}
            style={inputSty}
            placeholder="Your company"
          />
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Email address
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className={inputCls}
          style={inputSty}
          placeholder="you@example.com"
        />
        {role === 'employer' && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Please use your professional or company email address.
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Password
        </label>
        <div className="relative">
          <input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={`${inputCls} pr-11`}
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

      {/* Confirm Password */}
      <div>
        <label htmlFor="signup-confirmPassword" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Confirm password
        </label>
        <div className="relative">
          <input
            id="signup-confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={`${inputCls} pr-11`}
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

      {/* Job Highlights Opt-in (Job Seekers only) */}
      {role === 'job_seeker' && (
        <div
          className="rounded-lg p-4"
          style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)' }}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={wantJobHighlights}
              onChange={(e) => setWantJobHighlights(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded"
              style={{ accentColor: 'var(--color-primary)' }}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Email me job highlights</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Get the latest PMHNP opportunities delivered to your inbox</p>
            </div>
          </label>

          {wantJobHighlights && (
            <div className="mt-3 ml-7 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="highlightsFrequency"
                  value="daily"
                  checked={highlightsFrequency === 'daily'}
                  onChange={() => setHighlightsFrequency('daily')}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Daily</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="highlightsFrequency"
                  value="weekly"
                  checked={highlightsFrequency === 'weekly'}
                  onChange={() => setHighlightsFrequency('weekly')}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Weekly</span>
              </label>
            </div>
          )}
          <p className="text-xs mt-2 ml-7" style={{ color: 'var(--text-tertiary)' }}>You can change this anytime</p>
        </div>
      )}

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
            Creating account...
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Sign in link */}
      <p className="text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Already have an account?{' '}
        <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
