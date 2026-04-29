import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Employer Sign Up | PMHNP Hiring',
  description: 'Create your employer account to start posting PMHNP jobs',
}

export default function EmployerSignUpPage() {
  redirect('/signup?role=employer')
}
