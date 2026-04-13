'use client';

import { usePathname } from 'next/navigation';

const BARE_ROUTES = ['/admin', '/employer/dashboard', '/login', '/signup', '/forgot-password', '/reset-password', '/employer/login', '/employer/signup'];

/**
 * Wraps main-site chrome (Header, Footer, BottomNav, etc.)
 * and hides it on routes that have their own layout (admin, employer dashboard).
 */
export default function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isBarePath = BARE_ROUTES.some(r => pathname?.startsWith(r));

    if (isBarePath) return null;

    return <>{children}</>;
}
