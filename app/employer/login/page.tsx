import { redirect } from 'next/navigation'
import EmployerLoginForm from '@/components/employer/EmployerLoginForm'
import { getCurrentUser } from '@/lib/auth/protect'
import AuthLayout from '@/components/auth/AuthLayout'

export const metadata = {
    title: 'Employer Login | PMHNP Jobs',
    description: 'Log in to your employer dashboard to manage job postings',
}

export default async function EmployerLoginPage() {
    const currentUser = await getCurrentUser()
    if (currentUser) {
        redirect('/employer/dashboard')
    }

    return (
        <AuthLayout variant="employer_login">
            <EmployerLoginForm />
        </AuthLayout>
    )
}
