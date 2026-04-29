import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/protect'
import LoginContent from '@/components/auth/LoginContent'
import AuthLayout from '@/components/auth/AuthLayout'
import { Suspense } from 'react'

export const metadata = {
  title: 'Sign In | PMHNP Hiring',
  description: 'Sign in to your PMHNP Hiring account to manage saved jobs, job alerts, and applications.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const currentUser = await getCurrentUser()
  const params = await searchParams
  const redirectTo = params.redirectTo || '/dashboard'
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard'
  if (currentUser) {
    redirect(safeRedirect)
  }

  return (
    <AuthLayout
      illustration="/illustrations/auth-login.png"
      testimonial={{
        quote: '"I found my dream remote PMHNP position in less than a week. The job matching was incredibly accurate."',
        name: 'Sarah M., PMHNP-BC',
        title: 'Austin, TX',
      }}
    >
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
