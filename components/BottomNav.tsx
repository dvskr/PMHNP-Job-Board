'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Briefcase, Bookmark, Mail, Bell, LayoutDashboard, Users, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Job-seeker / marketing default — Home + Jobs + Saved + a 4th slot that
// depends on auth state. Messages is useless without an account, so
// logged-out visitors get Job Alerts (a page they can actually use);
// authenticated seekers keep Messages.
const seekerNavBase = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Jobs', href: '/jobs', icon: Briefcase },
  { label: 'Saved', href: '/saved', icon: Bookmark },
];
const seekerMessagesItem = { label: 'Messages', href: '/messages', icon: Mail };
const seekerAlertsItem = { label: 'Alerts', href: '/job-alerts', icon: Bell };

// Employer surfaces — Dashboard + Talent + Applicants + Messages. The prior
// nav (Home/Jobs/Saved) didn't reflect what employers actually do, and
// "Saved" routed to the seeker's saved-jobs page.
const employerNavItems = [
  // Shorter "Home" label so it fits in the 4-col grid on 360px phones —
  // "Dashboard" + the icon was wider than the column and the start of the
  // word was getting clipped (showed as "oard"). The icon carries the
  // meaning; "Home" is the conventional label for the dashboard entry.
  { label: 'Home', href: '/employer/dashboard', icon: LayoutDashboard },
  { label: 'Talent', href: '/employer/candidates', icon: Users },
  { label: 'Applicants', href: '/employer/applicants', icon: FileText },
  { label: 'Messages', href: '/messages', icon: Mail },
];

// Pathname prefixes that flag the page as an employer-shell surface so we
// swap to the employer nav. Same set as MobileHideOnAppRoutes uses.
const EMPLOYER_PREFIXES = ['/employer', '/admin'];

export default function BottomNav() {
  const pathname = usePathname();

  // Auth state decides the 4th seeker slot (same conditional pattern as the
  // employer-shell swap below). getSession reads the local cookie store —
  // no network round-trip. SSR and the first client paint render the
  // logged-out variant, which is also the majority case for mobile organic
  // traffic; signed-in users flip to Messages right after hydration.
  const [isAuthed, setIsAuthed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) setIsAuthed(Boolean(session));
      })
      .catch(() => { /* treat as logged out */ });
    return () => { cancelled = true; };
  }, []);

  const isEmployerShell = EMPLOYER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const seekerNavItems = [...seekerNavBase, isAuthed ? seekerMessagesItem : seekerAlertsItem];
  const navItems = isEmployerShell ? employerNavItems : seekerNavItems;

  const isActive = (href: string) => {
    if (href === '/') {
      // Exact match for home
      return pathname === '/';
    }
    // Prefix match for other routes
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav
        // safe-area inset is applied once on the inner container via `pb-safe`;
        // applying `safe-bottom` here too would double the bottom inset on iOS.
        className="md:hidden fixed bottom-0 inset-x-0 z-50 shadow-lg"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <div className="flex items-center justify-around px-2 py-2 pb-safe">
          {navItems.map((item: typeof navItems[number]) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                // min-h-[48px] meets WCAG 2.5.8 (24px) and Apple HIG (44px).
                // py-2.5 + 24px icon + 4px gap + 16px text yields ~52px reachable area.
                className={`flex flex-col items-center justify-center flex-1 min-h-[48px] py-2.5 px-2 rounded-lg transition-all touch-manipulation`}
                style={{
                  backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                }}
              >
                <Icon
                  className="w-6 h-6 mb-1 transition-colors"
                  style={{
                    color: active ? 'var(--color-primary)' : 'var(--text-tertiary)',
                  }}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className="text-xs font-medium transition-colors"
                  style={{
                    color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
