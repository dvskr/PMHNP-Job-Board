'use client';

import { usePathname } from 'next/navigation';

/* Routes that handle their own full layout (no padding at all) */
const BARE_ROUTES = ['/admin', '/employer/dashboard', '/messages'];

/* App-like routes that need top padding removed but still need bottom nav clearance */
const APP_ROUTES = ['/settings', '/saved', '/job-alerts', '/dashboard'];

export default function MainContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isBarePath = BARE_ROUTES.some(r => pathname?.startsWith(r));
    const isAppPath = APP_ROUTES.some(r => pathname?.startsWith(r));

    let className = 'pt-16 pb-20 md:pb-0'; // default: header spacer + bottom nav clearance
    if (isBarePath) {
        className = 'min-h-screen'; // fully custom layout
    } else if (isAppPath) {
        className = 'pt-16 pb-24 md:pb-0'; // header spacer + extra bottom nav clearance
    }

    return (
        <main className={className} suppressHydrationWarning>
            {children}
        </main>
    );
}
