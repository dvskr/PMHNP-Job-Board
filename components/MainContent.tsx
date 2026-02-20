'use client';

import { usePathname } from 'next/navigation';

const BARE_ROUTES = ['/admin', '/employer/dashboard'];

export default function MainContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isBarePath = BARE_ROUTES.some(r => pathname?.startsWith(r));

    return (
        <main className={isBarePath ? 'min-h-screen' : 'pt-16 pb-20 md:pb-0'}>
            {children}
        </main>
    );
}
