'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Confirming your account...')

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const supabase = createClient()

        // --- Strategy 1: PKCE flow (code in query params) ---
        // @supabase/ssr uses PKCE by default. Supabase's verify endpoint
        // redirects with ?code=xxx in the query string after validating the token.
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')

        if (code) {
          console.log('Auth confirm - exchanging PKCE code for session')
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.error('Failed to exchange code:', error.message)
            setStatus('error')
            setMessage('Invalid or expired link. Please request a new one.')
            setTimeout(() => router.push('/login'), 3000)
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
          setMessage('Email confirmed! Redirecting to dashboard...')
          setStatus('success')
          setTimeout(() => router.push('/dashboard'), 1500)
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

        console.log('Auth confirm - type:', type, 'hasAccessToken:', !!accessToken, 'error:', errorParam)

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

        console.log('Session set successfully, type:', type, 'user:', data.session?.user?.email)

        // Handle different auth types
        if (type === 'recovery') {
          setMessage('Verified! Redirecting to reset password...')
          setStatus('success')
          router.push('/reset-password')
          return
        }

        // Magic link / email confirmation — user is now logged in
        setMessage('Email confirmed! Redirecting to dashboard...')
        setStatus('success')
        setTimeout(() => router.push('/dashboard'), 1500)
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
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
