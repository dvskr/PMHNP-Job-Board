import { requireAdmin } from '@/lib/auth/protect';
import AdminSidebar from './_components/AdminSidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This will redirect to /login if not authenticated
  // And to /unauthorized if not admin
  await requireAdmin();

  return <AdminSidebar>{children}</AdminSidebar>;
}

