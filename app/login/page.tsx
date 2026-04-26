import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/protect'
import LoginContent from '@/components/auth/LoginContent'
import AuthLayout from '@/components/auth/AuthLayout'
import { Suspense } from 'react'

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your PMHNP Hiring account to manage saved jobs, job alerts, and applications. Access your personalized dashboard.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const currentUser = await getCurrentUser()
  const params = await searchParams
  const redirectTo = params.redirectTo || '/dashboard'
  // Only allow relative redirects to prevent open redirect attacks
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard'
  if (currentUser) {
    redirect(safeRedirect)
  }

  return (
    <AuthLayout variant="login">
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(0,0,0,0.04)' }} />
            <div className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(0,0,0,0.04)' }} />
            <div className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(0,0,0,0.04)' }} />
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </AuthLayout>
  )
}
