'use client';

import { usePathname } from 'next/navigation';

/**
 * Routes that feel "app-like" on mobile — footer & extra chrome hidden.
 * Bottom nav remains the primary navigation for these.
 */
const APP_ROUTES = [
    '/messages',
    '/dashboard',
    '/settings',
    '/saved',
    '/job-alerts',
    '/employer',
    '/jobs',
];

export default function MobileHideOnAppRoutes({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAppRoute = APP_ROUTES.some(r => pathname?.startsWith(r));

    if (!isAppRoute) return <>{children}</>;

    // On app routes: hide on mobile, show on desktop
    return (
        <div className="hidden md:block">
            {children}
        </div>
    );
}
