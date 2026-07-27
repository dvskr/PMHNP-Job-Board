import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Employer Login | PMHNP Hiring',
  description: 'Log in to your employer dashboard to manage job postings',
}

/**
 * Thin alias for the shared login screen in employer mode.
 *
 * Forwards `redirectTo` / `next` instead of dropping them. Renewal emails link
 * here carrying the listing's renew target; swallowing that parameter landed
 * employers on a generic screen and threw away the intent the email had just
 * created.
 */
export default async function EmployerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string }>
}) {
  const params = await searchParams
  const target = params.redirectTo ?? params.next
  redirect(
    target
      ? `/login?role=employer&redirectTo=${encodeURIComponent(target)}`
      : '/login?role=employer'
  )
}
