'use client';

import { usePathname } from 'next/navigation';

/**
 * On mobile, hide the footer and extra chrome on app-shell routes (signed-in
 * dashboards, settings, employer surfaces, etc.) where the bottom nav is the
 * primary navigation. Marketing and SEO surfaces (homepage, jobs, pSEO city
 * and state pages, content pages) keep the footer visible on mobile so
 * footer links remain reachable and the page retains its full link equity.
 */

// App-shell prefixes whose mobile rendering should NOT include the footer.
// These are signed-in surfaces where the BottomNav suffices.
const APP_SHELL_PREFIXES = [
    '/dashboard',
    '/settings',
    '/messages',
    '/saved',
    '/my-applications',
    '/employer',
    '/admin',
    '/post-job',
];

function isAppShell(pathname: string): boolean {
    return APP_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function MobileHideOnAppRoutes({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (!isAppShell(pathname)) return <>{children}</>;

    // App-shell route: hide on mobile, show on desktop
    return (
        <div className="hidden md:block">
            {children}
        </div>
    );
}
