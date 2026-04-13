import { redirect } from 'next/navigation'
import EmployerSignUpForm from '@/components/employer/EmployerSignUpForm'
import { getCurrentUser } from '@/lib/auth/protect'
import AuthLayout from '@/components/auth/AuthLayout'

export const metadata = {
    title: 'Employer Sign Up | PMHNP Jobs',
    description: 'Create an employer account to post jobs and find qualified psychiatric nurse practitioners.',
}

export default async function EmployerSignUpPage() {
    const currentUser = await getCurrentUser()
    if (currentUser) {
        redirect('/employer/dashboard')
    }

    return (
        <AuthLayout variant="employer_signup">
            <EmployerSignUpForm />
        </AuthLayout>
    )
}
