import { requireAuth } from '@/lib/auth/protect'
import { redirect } from 'next/navigation'
import ResumeStudio from '@/components/resume-studio/ResumeStudio'

// noindex for /dashboard/* is handled by middleware; no robots meta needed here.
export const metadata = {
  title: 'Resume Studio | PMHNP Jobs',
  description: 'Build, score, tailor, and export your PMHNP resume.',
}

export default async function ResumeStudioPage() {
  const { profile } = await requireAuth()

  // Employers have their own dashboard; Resume Studio is for professionals.
  if (profile?.role === 'employer') {
    redirect('/employer/dashboard')
  }

  return <ResumeStudio />
}
