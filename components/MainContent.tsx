'use client';

import { usePathname } from 'next/navigation';

/* Routes that handle their own full layout (no padding at all) */
const BARE_ROUTES = ['/admin', '/messages', '/login', '/signup', '/forgot-password', '/reset-password', '/employer/login', '/employer/signup', '/employer/dashboard', '/employer/candidates', '/employer/settings', '/pricing', '/contact', '/terms', '/privacy', '/faq', '/about', '/for-employers', '/for-job-seekers', '/salary-guide', '/resources', '/blog', '/jobs', '/job-alerts'];

/* App-like routes that need top padding removed but still need bottom nav clearance */
const APP_ROUTES = ['/settings', '/saved', '/dashboard'];

export default function MainContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isBarePath = BARE_ROUTES.some(r => pathname?.startsWith(r));
    const isAppPath = APP_ROUTES.some(r => pathname?.startsWith(r));

    let className = 'pt-16 pb-20 md:pb-0'; // default: header spacer + bottom nav clearance
    if (isBarePath) {
        className = 'min-h-screen'; // fully custom layout
    } else if (isAppPath) {
        className = 'pt-4 pb-24 md:pb-0'; // small gap below header spacer + bottom nav clearance
    }

    // SEO Fix H6: id="main-content" is the target of the skip link rendered
    // first inside <body> in app/layout.tsx (WCAG 2.4.1 Bypass Blocks).
    return (
        <main id="main-content" className={className} suppressHydrationWarning style={{ flex: 1 }}>
            {children}
        </main>
    );
}
