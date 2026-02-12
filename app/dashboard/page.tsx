import { requireAuth } from '@/lib/auth/protect'
import { redirect } from 'next/navigation'
import DashboardContent from '@/components/dashboard/DashboardContent'

export const metadata = {
  title: 'Dashboard | PMHNP Jobs',
}

export default async function DashboardPage() {
  const { profile } = await requireAuth()

  // Redirect employers to their dedicated dashboard
  if (profile?.role === 'employer') {
    redirect('/employer/dashboard')
  }

  return <DashboardContent />
}
