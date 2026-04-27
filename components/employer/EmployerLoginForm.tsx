"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react'
import {
  inputStyle, inputWithRightIcon, labelStyle, eyeBtnStyle,
  errorBannerStyle,
} from '@/components/auth/authTokens'

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

export default function EmployerLoginForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const supabase = createClient()
            const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

            if (signInError) {
                setError(signInError.message)
                return
            }

            if (data.user) {
                router.refresh()
                router.push('/employer/dashboard')
            }
        } catch {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
                <div style={errorBannerStyle}>
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p style={{ fontSize: '14px', color: '#DC2626', margin: 0 }}>{error}</p>
                </div>
            )}

            {/* Email */}
            <div>
                <label htmlFor="employer-email" style={labelStyle}>Work Email</label>
                <input
                    id="employer-email" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                    style={inputStyle} placeholder="hiring@company.com"
                />
            </div>

            {/* Password */}
            <div>
                <label htmlFor="employer-password" style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                    <input
                        id="employer-password" type={showPassword ? "text" : "password"} value={password}
                        onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                        style={inputWithRightIcon} placeholder="Enter your password"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle}
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Remember / Forgot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: '#B45309', width: '16px', height: '16px' }} />
                    <span style={{ fontSize: '13px', color: '#4B5E68' }}>Remember me</span>
                </label>
                <Link href="/forgot-password" style={{ ...employerLink, fontSize: '13px' }}>
                    Forgot password?
                </Link>
            </div>

            {/* Submit — indigo */}
            <button type="submit" disabled={loading} style={employerCta(loading)}>
                {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</>
                ) : (
                    <>Log In to Dashboard <ArrowRight className="w-4 h-4" /></>
                )}
            </button>

            {/* Sign up link */}
            <p style={{ textAlign: 'center', fontSize: '14px', color: '#6B7F8A', margin: 0 }}>
                Don&apos;t have an account?{' '}
                <Link href="/employer/signup" style={employerLink}>Create Employer Account</Link>
            </p>

            {/* Cross-link to job seeker */}
            <div style={{
                padding: '12px 16px', borderRadius: '12px',
                background: '#F0FDF4', border: '1px solid #BBF7D0', textAlign: 'center',
            }}>
                <span style={{ fontSize: '13px', color: '#6B7F8A' }}>
                    Looking for a job?{' '}
                    <Link href="/login" style={{ fontWeight: 700, color: '#0D9488', textDecoration: 'none' }}>
                        Job Seeker Sign In →
                    </Link>
                </span>
            </div>
        </form>
    )
}
