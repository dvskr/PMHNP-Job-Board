'use client';

import { usePathname } from 'next/navigation';

/**
 * On mobile, only show footer & extra chrome on the homepage.
 * All other pages use the bottom nav as primary navigation.
 * Desktop always shows the footer.
 */
export default function MobileHideOnAppRoutes({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isHomepage = pathname === '/';

    if (isHomepage) return <>{children}</>;

    // Non-homepage: hide on mobile, show on desktop
    return (
        <div className="hidden md:block">
            {children}
        </div>
    );
}
