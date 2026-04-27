"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Building2, Loader2, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight, Mail } from 'lucide-react'
import {
  inputStyle, inputWithRightIcon, inputWithLeftIcon, inputWithBothIcons,
  labelStyle, helperStyle, leftIconStyle, eyeBtnStyle,
  errorBannerStyle, optInCardStyle, linkStyle,
} from '@/components/auth/authTokens'

const FREE_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
    'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
]

/* ─── Employer-specific accent (indigo) ─── */
const employerCta = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '13px 24px',
  borderRadius: '14px',
  border: 'none',
  background: 'linear-gradient(145deg, #B45309, #92400E)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '15px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.6 : 1,
  boxShadow: '0 4px 14px rgba(180,83,9,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
  transition: 'all 0.15s',
});

const employerLink: React.CSSProperties = {
  fontWeight: 600,
  color: '#B45309',
  textDecoration: 'none',
};

export default function EmployerSignUpForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [company, setCompany] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [newsletterOptIn, setNewsletterOptIn] = useState(true)

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

        const emailDomain = email.toLowerCase().split('@')[1]
        if (emailDomain && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
            setError('Please use your company email to sign up. Free email providers (Gmail, Yahoo, etc.) are not accepted for employer accounts.')
            setLoading(false)
            return
        }

        try {
            const supabase = createClient()

            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/confirm`,
                    data: {
                        first_name: firstName,
                        last_name: lastName,
                        role: 'employer',
                        company: company,
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
                        role: 'employer',
                        company: company,
                        wantJobHighlights: false,
                        newsletterOptIn,
                    }),
                })

                fetch('/api/auth/welcome', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: data.user.email }),
                }).catch(() => {})

                setSuccess(true)

                if (data.session) {
                    router.refresh()
                    router.push('/employer/dashboard')
                }
            }
        } catch {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <div style={{
                    width: '56px', height: '56px', borderRadius: '16px',
                    background: '#FEF3C7', color: '#B45309',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <CheckCircle className="w-7 h-7" />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: 0, fontFamily: 'var(--font-lora), Georgia, serif' }}>
                    Account Created!
                </h3>
                <p style={{ fontSize: '14px', color: '#6B7F8A', margin: 0, lineHeight: 1.5 }}>
                    We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                    <br />Please check your email to activate your employer account.
                </p>
                <Link href="/employer/login" style={{ ...employerLink, fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                    Go to Employer Login <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
                <div style={errorBannerStyle}>
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p style={{ fontSize: '14px', color: '#DC2626', margin: 0 }}>{error}</p>
                </div>
            )}

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="emp-firstName" style={labelStyle}>First name</label>
                    <input id="emp-firstName" type="text" value={firstName}
                        onChange={(e) => setFirstName(e.target.value)} required
                        style={inputStyle} placeholder="Jane" />
                </div>
                <div>
                    <label htmlFor="emp-lastName" style={labelStyle}>Last name</label>
                    <input id="emp-lastName" type="text" value={lastName}
                        onChange={(e) => setLastName(e.target.value)} required
                        style={inputStyle} placeholder="Doe" />
                </div>
            </div>

            {/* Company */}
            <div>
                <label htmlFor="emp-company" style={labelStyle}>Company name</label>
                <div style={{ position: 'relative' }}>
                    <Building2 className="w-4 h-4" style={leftIconStyle} />
                    <input id="emp-company" type="text" value={company}
                        onChange={(e) => setCompany(e.target.value)} required
                        style={inputWithLeftIcon} placeholder="Your company" />
                </div>
            </div>

            {/* Email */}
            <div>
                <label htmlFor="emp-email" style={labelStyle}>Work Email</label>
                <div style={{ position: 'relative' }}>
                    <Mail className="w-4 h-4" style={leftIconStyle} />
                    <input id="emp-email" type="email" value={email}
                        onChange={(e) => setEmail(e.target.value)} required
                        style={inputWithLeftIcon} placeholder="hiring@company.com" />
                </div>
                <p style={helperStyle}>Please use your professional or company email address.</p>
            </div>

            {/* Password */}
            <div>
                <label htmlFor="emp-password" style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                    <input id="emp-password" type={showPassword ? "text" : "password"} value={password}
                        onChange={(e) => setPassword(e.target.value)} required minLength={8}
                        style={inputWithRightIcon} placeholder="Minimum 8 characters" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle}
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Confirm Password */}
            <div>
                <label htmlFor="emp-confirmPassword" style={labelStyle}>Confirm password</label>
                <div style={{ position: 'relative' }}>
                    <input id="emp-confirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} required
                        style={inputWithRightIcon} placeholder="Re-enter your password" />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={eyeBtnStyle}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Newsletter Opt-in */}
            <div style={{ ...optInCardStyle, background: '#FFFBEB', borderColor: '#FCD34D' }}>
                <label style={{ display: 'flex', alignItems: 'start', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)}
                        style={{ accentColor: '#B45309', width: '16px', height: '16px', marginTop: '2px', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#4B5E68' }}>
                        Send me hiring tips, salary benchmarks &amp; PMHNP market insights
                    </span>
                </label>
            </div>

            {/* Submit — indigo */}
            <button type="submit" disabled={loading} style={employerCta(loading)}>
                {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
                ) : (
                    <>Create Employer Account <ArrowRight className="w-4 h-4" /></>
                )}
            </button>

            {/* Sign in link */}
            <p style={{ textAlign: 'center', fontSize: '14px', color: '#6B7F8A', margin: 0 }}>
                Already have an account?{' '}
                <Link href="/employer/login" style={employerLink}>Log In</Link>
            </p>

            {/* Cross-link to job seeker */}
            <div style={{
                padding: '12px 16px', borderRadius: '12px',
                background: '#F0FDF4', border: '1px solid #BBF7D0', textAlign: 'center',
            }}>
                <span style={{ fontSize: '13px', color: '#6B7F8A' }}>
                    Looking for a job?{' '}
                    <Link href="/signup" style={{ fontWeight: 700, color: '#0D9488', textDecoration: 'none' }}>
                        Create Job Seeker Account →
                    </Link>
                </span>
            </div>
        </form>
    )
}
