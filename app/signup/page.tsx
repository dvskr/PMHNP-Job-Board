import { redirect } from 'next/navigation'
import SignUpForm from '@/components/auth/SignUpForm'
import AuthLayout from '@/components/auth/AuthLayout'
import { getCurrentUser } from '@/lib/auth/protect'
import { Suspense } from 'react'

export const metadata = {
  title: 'Create Account | PMHNP Hiring',
  description: 'Create your free PMHNP Hiring account. Save jobs, set up alerts, and get matched with psychiatric nurse practitioner positions.',
  // Page is noindexed via middleware X-Robots-Tag (per app/robots.ts P2.3
  // unblock window). Self-canonical consolidates ?redirectTo=… variants
  // to the bare /signup URL.
  alternates: { canonical: 'https://pmhnphiring.com/signup' },
  robots: { index: false, follow: true },
}

export default async function SignUpPage({
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
      illustration="/illustrations/auth-signup.png"
      testimonial={{
        quote: '"Setting up my profile took 2 minutes, and I was getting matched with relevant positions the same day."',
        name: 'James R., PMHNP',
        title: 'Denver, CO',
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
        <SignUpForm />
      </Suspense>
    </AuthLayout>
  )
}
