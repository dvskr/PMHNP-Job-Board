'use client';

import { usePathname } from 'next/navigation';

/* Routes that handle their own full layout (no padding at all) */
const BARE_ROUTES = ['/admin', '/messages', '/login', '/signup', '/forgot-password', '/reset-password', '/employer/login', '/employer/signup', '/employer/dashboard', '/employer/candidates', '/employer/applicants', '/employer/settings', '/pricing', '/contact', '/terms', '/privacy', '/faq', '/about', '/for-employers', '/for-job-seekers', '/salary-guide', '/resources', '/blog', '/jobs', '/job-alerts'];

/* App-like routes that need top padding removed but still need bottom nav clearance */
const APP_ROUTES = ['/settings', '/saved', '/dashboard'];

export default function MainContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isBarePath = BARE_ROUTES.some(r => pathname?.startsWith(r));
    const isAppPath = APP_ROUTES.some(r => pathname?.startsWith(r));

    let className = 'pt-16 pb-20 md:pb-0'; // default: header spacer + bottom nav clearance
    if (isBarePath) {
        // Even bare routes need bottom-nav clearance on mobile — the
        // BottomNav is `position: fixed` and overlaps the last ~70px of
        // page content on phones. Without pb-24 the bottom of every job
        // card / table / payment-history row was hidden behind the nav and
        // the user couldn't scroll past it. md:pb-0 keeps desktop layout
        // identical (BottomNav is `md:hidden`).
        className = 'min-h-screen pb-24 md:pb-0';
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
