import { redirect } from 'next/navigation'
import SignUpForm from '@/components/auth/SignUpForm'
import AuthLayout from '@/components/auth/AuthLayout'
import { getCurrentUser } from '@/lib/auth/protect'
import { safeInternalPath } from '@/lib/auth/safe-redirect'
import { prisma } from '@/lib/prisma'
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

// Real platform numbers for the employer side panel — same counts the
// /for-employers hero uses. Never invent people or testimonials here; the
// previous hardcoded quote belonged to the deleted fake-persona family.
// Returns zeros on DB failure so the caller can fall back to a
// numbers-free value prop instead of rendering "0 organizations".
async function getEmployerStats() {
  try {
    const [totalJobs, totalCompanies] = await Promise.all([
      prisma.job.count({ where: { isPublished: true } }),
      prisma.job.groupBy({ by: ['employer'], where: { isPublished: true } }).then((r) => r.length),
    ])
    return { totalJobs, totalCompanies }
  } catch {
    return { totalJobs: 0, totalCompanies: 0 }
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; role?: string }>
}) {
  const currentUser = await getCurrentUser()
  const params = await searchParams
  const safeRedirect = safeInternalPath(params.redirectTo, '/dashboard')
  if (currentUser) {
    redirect(safeRedirect)
  }

  const isEmployer = params.role === 'employer'
  const stats = isEmployer ? await getEmployerStats() : null

  // Side-panel copy — real value props only. Employer requests get live
  // platform numbers when the DB answered; everything else gets a
  // non-fabricated product statement attributed to the platform itself.
  const panel = isEmployer
    ? stats && stats.totalJobs > 0 && stats.totalCompanies > 0
      ? {
          quote: `Join ${stats.totalCompanies.toLocaleString()} organizations hiring ${stats.totalJobs.toLocaleString()}+ PMHNPs on PMHNP Hiring.`,
          name: 'PMHNP Hiring',
          title: 'Live platform numbers',
        }
      : {
          quote: 'Your first job post is free, and every listing reaches a 100% psychiatric-NP audience.',
          name: 'PMHNP Hiring',
          title: 'Built for hiring PMHNPs',
        }
    : {
        quote: 'Every listing here is a psychiatric mental health NP role — no sifting through generic nursing boards.',
        name: 'PMHNP Hiring',
        title: 'Built exclusively for PMHNPs',
      }

  return (
    <AuthLayout
      illustration="/illustrations/auth-signup.png"
      testimonial={panel}
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
