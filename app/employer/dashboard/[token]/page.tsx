import { redirect } from 'next/navigation';

/**
 * Token-based dashboard access is deprecated.
 * All employers must have an account — redirect to login.
 */
export default function TokenDashboardPage() {
  redirect('/employer/login');
}
