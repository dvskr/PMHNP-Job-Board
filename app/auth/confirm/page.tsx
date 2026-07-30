'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeInternalPath } from '@/lib/auth/safe-redirect'

/**
 * /auth/confirm
 * 
 * Client-side page that handles Supabase hash fragment redirects.
 * @supabase/ssr browser client does NOT auto-detect hash fragments,
 * so we manually extract access_token and refresh_token from the URL hash
 * and call setSession() to establish the auth session.
 * 
 * Handles:
 * - Magic link confirmations (#access_token=...&type=magiclink)
 * - Password reset links (#access_token=...&type=recovery)
 * 
 * The server-side /auth/callback remains for Google OAuth (PKCE with ?code=)
 */
export default function AuthConfirmPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'awaiting-click'>('loading')
  const [message, setMessage] = useState('Confirming your account...')
  /** token_hash strategy state. Held in memory only, never re-logged. */
  const [pending, setPending] = useState<{ tokenHash: string; type: string; redirectTo: string } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  /**
   * Verify the token. Runs ONLY from the button's onClick, never on mount.
   * That is the entire point: a mail scanner pre-fetching this page performs a
   * GET, which must consume nothing. See app/api/auth/verify-confirmation.
   */
  const confirmNow = async () => {
    if (!pending || verifying) return
    setVerifying(true)
    try {
      const res = await fetch('/api/auth/verify-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_hash: pending.tokenHash,
          type: pending.type,
          redirectTo: pending.redirectTo,
        }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.success) {
        setStatus('error')
        setCanResend(true)
        setMessage(
          data?.expired
            ? 'This confirmation link has already been used or has expired. Send yourself a fresh one below.'
            : (data?.error || 'Could not confirm your email. Please try again.'),
        )
        return
      }

      setStatus('success')
      setMessage(data.isRecovery
        ? 'Verified! Redirecting to reset your password...'
        : 'Email confirmed! Taking you to your dashboard...')
      if (data.email && !data.isRecovery) {
        fetch('/api/auth/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email }),
        }).catch(() => {})
      }
      setTimeout(() => router.push(data.redirectTo || '/dashboard'), 1200)
    } catch {
      setStatus('error')
      setCanResend(true)
      setMessage('Could not reach the server. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const resend = async () => {
    setResendState('sending')
    try {
      // The address is not in the URL, so ask Supabase-side by email only if we
      // have one; otherwise send the user to signup to re-enter it.
      const email = new URLSearchParams(window.location.search).get('email')
      if (!email) { router.push('/signup?resend=1'); return }
      const res = await fetch('/api/auth/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResendState(res.ok ? 'sent' : 'failed')
    } catch {
      setResendState('failed')
    }
  }

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const supabase = createClient()

        // --- Check for errors from Supabase (e.g. expired OTP) ---
        const urlParams = new URLSearchParams(window.location.search)

        // Post-confirmation return target. SignUpForm threads the wall's
        // ?redirectTo= (e.g. /post-job) through emailRedirectTo so the user
        // lands back where they started instead of on the dashboard.
        // Re-validated here as a same-origin path — no open redirects.
        const nextPath = safeInternalPath(urlParams.get('redirectTo'), '/dashboard')

        const queryError = urlParams.get('error')
        const queryErrorCode = urlParams.get('error_code')
        const queryErrorDesc = urlParams.get('error_description')

        if (queryError || queryErrorCode) {
          console.error('Auth error from query params:', queryError, queryErrorCode, queryErrorDesc)
          setStatus('error')
          if (queryErrorCode === 'otp_expired') {
            setMessage('This link has expired. Please request a new one.')
          } else {
            setMessage(queryErrorDesc?.replace(/\+/g, ' ') || 'Authentication failed. Please try again.')
          }
          setTimeout(() => router.push('/forgot-password'), 4000)
          return
        }

        // --- Strategy 0: token_hash (the scanner-safe path) ---
        // The confirmation email now links here with ?token_hash=...&type=...
        // We deliberately DO NOT verify on mount. These tokens are single use
        // and are spent by a plain GET, so anything that opens the URL before
        // the human does burns it. Show a button; verify on click.
        const tokenHash = urlParams.get('token_hash')
        if (tokenHash) {
          setPending({
            tokenHash,
            type: urlParams.get('type') || 'magiclink',
            redirectTo: nextPath,
          })
          setStatus('awaiting-click')
          setMessage(urlParams.get('type') === 'recovery'
            ? 'Confirm it is you to continue resetting your password.'
            : 'One last step: confirm your email address.')
          return
        }

        // --- Strategy 1: PKCE flow (code in query params) ---
        // @supabase/ssr uses PKCE by default. Supabase's verify endpoint
        // redirects with ?code=xxx in the query string after validating the token.
        const code = urlParams.get('code')

        if (code) {
          console.log('Auth confirm - exchanging PKCE code for session')
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.warn('PKCE code exchange failed:', error.message)

            // PKCE verifier mismatch — happens when the confirmation email
            // opens in a different tab/browser than where signup occurred.
            // Supabase already confirmed the user server-side during the
            // redirect (before appending ?code=), so the email IS confirmed.
            // We just can't establish a client session without the verifier.
            setMessage('Email confirmed! Please log in to continue.')
            setStatus('success')
            // Thread the return target through login (?next= is honored by
            // LoginContent) so the user still lands back where they started.
            setTimeout(() => router.push(
              nextPath !== '/dashboard'
                ? `/login?confirmed=true&next=${encodeURIComponent(nextPath)}`
                : '/login?confirmed=true'
            ), 2000)
            return
          }

          // Determine type from the session metadata
          const isRecovery = data.session?.user?.recovery_sent_at || 
            urlParams.get('type') === 'recovery'

          if (isRecovery) {
            setMessage('Verified! Redirecting to reset password...')
            setStatus('success')
            router.push('/reset-password')
            return
          }

          // Email confirmation — user is now logged in
          setMessage(nextPath === '/dashboard'
            ? 'Email confirmed! Redirecting to dashboard...'
            : 'Email confirmed! Taking you back to where you left off...')
          setStatus('success')
          // Send welcome email (fire-and-forget, dedup handled server-side)
          const userEmail = data.session?.user?.email
          if (userEmail) {
            fetch('/api/auth/welcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: userEmail }),
            }).catch(() => {})
          }
          setTimeout(() => router.push(nextPath), 1500)
          return
        }

        // --- Strategy 2: Implicit flow (tokens in hash fragment) ---
        // Fallback for admin-generated links (e.g. /api/auth/send-confirmation)
        const hash = window.location.hash.substring(1) // remove '#'
        if (!hash) {
          console.log('No code or hash fragment found, redirecting to login')
          setStatus('error')
          setMessage('Invalid or expired link. Redirecting to login...')
          setTimeout(() => router.push('/login'), 2000)
          return
        }

        // Parse the hash fragment
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type = params.get('type')
        const errorParam = params.get('error')
        const errorDescription = params.get('error_description')


        if (errorParam) {
          console.error('Auth error from hash:', errorParam, errorDescription)
          setStatus('error')
          setMessage(errorDescription?.replace(/\+/g, ' ') || 'Authentication failed. Please try again.')
          setTimeout(() => router.push('/login'), 3000)
          return
        }

        if (!accessToken || !refreshToken) {
          console.error('Missing tokens in hash fragment')
          setStatus('error')
          setMessage('Invalid authentication link. Please request a new one.')
          setTimeout(() => router.push('/login'), 3000)
          return
        }

        // Set the session using the tokens from the hash
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          console.error('Failed to set session:', error.message)
          setStatus('error')
          setMessage('Session expired or invalid. Please try again.')
          setTimeout(() => router.push('/login'), 3000)
          return
        }


        // Handle different auth types
        if (type === 'recovery') {
          setMessage('Verified! Redirecting to reset password...')
          setStatus('success')
          router.push('/reset-password')
          return
        }

        // Magic link / email confirmation — user is now logged in
        setMessage(nextPath === '/dashboard'
          ? 'Email confirmed! Redirecting to dashboard...'
          : 'Email confirmed! Taking you back to where you left off...')
        setStatus('success')
        // Send welcome email (fire-and-forget, dedup handled server-side)
        const userEmail2 = data.session?.user?.email
        if (userEmail2) {
          fetch('/api/auth/welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail2 }),
          }).catch(() => {})
        }
        setTimeout(() => router.push(nextPath), 1500)
      } catch (err) {
        console.error('Auth confirm unexpected error:', err)
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
        setTimeout(() => router.push('/login'), 3000)
      }
    }

    handleAuth()
  }, [router])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #060E18)',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          padding: '48px 32px',
          background: 'var(--bg-secondary, #0F1923)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #1E293B)',
          maxWidth: '420px',
          width: '100%',
        }}
      >
        {status === 'loading' && (
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(45,212,191,0.2)',
              borderTopColor: '#2DD4BF',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 20px',
            }}
          />
        )}
        {status === 'success' && (
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
        )}
        {status === 'error' && (
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
        )}
        {status === 'awaiting-click' && (
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✉️</div>
        )}
        <p
          style={{
            color: status === 'error' ? '#EF4444' : 'var(--text-primary, #F1F5F9)',
            fontSize: '16px',
            fontWeight: 600,
            margin: 0,
          }}
        >
          {message}
        </p>

        {status === 'awaiting-click' && (
          <>
            <button
              type="button"
              onClick={confirmNow}
              disabled={verifying}
              style={{
                marginTop: '24px',
                width: '100%',
                padding: '14px 20px',
                borderRadius: '10px',
                border: 'none',
                background: verifying ? '#134E4A' : '#0D9488',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 700,
                cursor: verifying ? 'wait' : 'pointer',
              }}
            >
              {verifying ? 'Confirming...' : 'Confirm my email'}
            </button>
            <p style={{ color: 'var(--text-muted, #94A3B8)', fontSize: '12px', lineHeight: 1.6, margin: '14px 0 0' }}>
              Your email provider may scan links before you open them. This
              button makes sure that scan cannot use up your confirmation.
            </p>
          </>
        )}

        {status === 'error' && canResend && (
          <div style={{ marginTop: '20px' }}>
            {resendState === 'sent' ? (
              <p style={{ color: '#0D9488', fontSize: '13px', fontWeight: 600, margin: 0 }}>
                A new confirmation email is on its way.
              </p>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={resendState === 'sending'}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: '10px',
                  border: '1px solid #0D9488',
                  background: 'transparent',
                  color: '#2DD4BF',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: resendState === 'sending' ? 'wait' : 'pointer',
                }}
              >
                {resendState === 'sending' ? 'Sending...' : 'Send me a new link'}
              </button>
            )}
            {resendState === 'failed' && (
              <p style={{ color: '#EF4444', fontSize: '12px', margin: '10px 0 0' }}>
                That did not work. Please try signing up again.
              </p>
            )}
          </div>
        )}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
